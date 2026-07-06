// Edge Function: send-event-notification  (publicada como `swift-action`)
// Envia e-mail ao lojista (advertiser) a cada evento relevante, usando Resend.
// Chamada por triggers AFTER INSERT, distinguidos por `source`:
//   1. advertiser_contact_intentions → "lead"          (perguntas/mensagens)
//   2. purchase_intentions           → "order"         (pedidos)
//   3. advertiser_credit_ledger      → "ledger"        (todo consumo de crédito)
//                                    → "balance_alert"  (saldo < 6 ou zerado)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveMpGateway } from "../_shared/mp-gateway-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// API do Mercado Pago (para buscar o link oficial do comprovante do pagamento).
const MP_API = "https://api.mercadopago.com";

// Marca / links do app (e-mails só aceitam URLs absolutas e públicas).
const APP_BASE = "https://viagg-tx8.com.br";
const LOGO_URL = "https://viagg-tx8.com.br/images/viagg-tx8-logo.jpg";
const LOGO_HEADER = `<div style="text-align:center; margin-bottom:24px;"><img src="${LOGO_URL}" alt="Viagg-TX8" width="110" style="display:inline-block; max-width:110px; height:auto; border-radius:14px;" /></div>`;

function ctaButton(path: string, label: string) {
  return `<div style="text-align:center; margin:28px 0 8px;"><a href="${APP_BASE}${path}" style="display:inline-block; background:#f59e0b; color:#18181b; text-decoration:none; font-weight:700; font-size:15px; padding:13px 30px; border-radius:10px;">${label}</a></div>`;
}

function productBlock(ev: EventPayload) {
  if (!ev.listing_image_url && !ev.listing_title) return "";
  const priceLine = (ev.listing_price_brl !== null && ev.listing_price_brl !== undefined)
    ? `<p style="color:#16a34a; font-size:16px; font-weight:700; margin:4px 0 0;">${formatBRL(ev.listing_price_brl)}</p>`
    : "";
  const descLine = ev.listing_description
    ? `<p style="color:#52525b; font-size:13px; margin:6px 0 0; line-height:1.5;">${ev.listing_description}</p>`
    : "";
  return `
  <div style="margin:20px 0; border:1px solid #e4e4e7; border-radius:14px; overflow:hidden; background:#fafafa;">
    ${ev.listing_image_url
      ? `<img src="${ev.listing_image_url}" alt="${ev.listing_title || "Produto"}" width="600" style="width:100%; max-height:240px; object-fit:cover; display:block; border-bottom:1px solid #e4e4e7;" />`
      : ""}
    <div style="padding:16px 20px;">
      ${ev.listing_title ? `<p style="color:#18181b; font-size:16px; font-weight:700; margin:0;">${ev.listing_title}</p>` : ""}
      ${priceLine}
      ${descLine}
    </div>
  </div>`;
}

// Mascaramento do contato — o lojista paga créditos p/ desbloquear no painel.
function maskName(name?: string | null): string {
  const n = (name || "").trim();
  if (!n) return "Cliente";
  return n.charAt(0).toUpperCase() + "•••";
}
function maskPhone(phone?: string | null): string {
  const d = (phone || "").replace(/\D/g, "");
  if (d.length < 4) return "••••••••";
  return "(" + d.slice(0, 2) + ") •••••-••" + d.slice(-2);
}
function maskEmail(email?: string | null): string {
  const e = (email || "").trim();
  if (!e || !e.includes("@")) return "";
  const [u, dom] = e.split("@");
  const tld = dom && dom.includes(".") ? dom.slice(dom.lastIndexOf(".")) : "";
  return (u.charAt(0) || "") + "•••@•••" + tld;
}

// O register_product_inquiry concatena o e-mail do visitante no fim do texto
// ("E-mail: x@y.com"). Extrai esse e-mail e devolve a mensagem limpa (sem ele).
function extractVisitorEmail(message?: string | null): { email: string; message: string } {
  let msg = (message || "").trim();
  let email = "";
  const m = msg.match(/e-?mail:\s*([^\s]+@[^\s]+)/i);
  if (m) {
    email = m[1];
    msg = msg.replace(/\n*\s*e-?mail:\s*[^\s]+@[^\s]+/i, "").trim();
  }
  return { email, message: msg };
}

const EVENT_LABELS: Record<string, string> = {
  visitor_store_entry: "Visitante entrou na sua loja",
  visitor_product_click: "Clique em um produto seu",
  marketplace_product_click: "Visitante entrou na sua loja",
  visitor_cart_add: "Produto adicionado à cesta",
  visitor_checkout: "Pedido finalizado",
  advertiser_accept_offer: "Oferta de comprador aceita",
  advertiser_unlock_order_whatsapp: "WhatsApp do cliente desbloqueado (pedido)",
  advertiser_unlock_lead_whatsapp: "Contato de lead desbloqueado",
  offer_accept: "Aceite de oferta",
  package_purchase: "Compra de pacote de créditos",
  subscription_activation: "Assinatura ativada",
};

const INTEREST_LABELS: Record<string, string> = {
  whatsapp_click: "clicou no WhatsApp",
  message_request: "enviou uma mensagem",
  proposal: "fez uma proposta",
  view_contact: "quer ver seu contato",
};

interface EventPayload {
  source?: "ledger" | "lead" | "order" | "balance_alert" | "offer" | "wallet_topup" | "package_purchase" | "listing_published";
  advertiser_account_id?: string;
  advertiser_user_id?: string;
  store_id?: string;
  entry_type?: string;
  amount?: number;
  balance_after?: number | null;
  // Alerta de saldo (source = "balance_alert")
  alert_kind?: "low" | "zero";
  reason_code?: string;
  description?: string | null;
  listing_module?: string;
  listing_id?: string;
  interest_type?: string;
  visitor_name?: string | null;
  visitor_phone?: string | null;
  visitor_message?: string | null;
  visitor_email?: string | null;
  city?: string | null;
  /** UUID da advertiser_contact_intentions — a função busca advertiser_user_id + dados automaticamente */
  lead_intention_id?: string | null;
  // Campos de pedido (source = "order")
  intention_id?: string | null;
  customer_name?: string | null;
  customer_whatsapp?: string | null;
  customer_email?: string | null;
  customer_note?: string | null;
  subtotal?: number | null;
  total_items?: number | null;
  checkout_mode?: string | null;
  // Resolvidos internamente (imagem/título do produto)
  listing_image_url?: string | null;
  listing_title?: string | null;
  listing_price_brl?: number | null;
  listing_description?: string | null;
  // Oferta (source = "offer")
  offer_amount?: number | null;
  offer_note?: string | null;
  buyer_user_id?: string;   // comprador que fez a oferta (p/ e-mail de confirmação)
  // Recarga de saldo p/ chamar motoboy (source = "wallet_topup")
  // e compra de pacote de créditos (source = "package_purchase")
  amount_brl?: number | null;
  package_name?: string | null;
  credits?: number | null;
  // Ordem de pagamento (p/ comprovante/recibo no e-mail). order_id vem do trigger;
  // os demais são preenchidos por enrichPaymentReceipt() a partir da ordem.
  order_id?: string | null;
  provider_name?: string | null;
  provider_payment_id?: string | null;
  paid_at?: string | null;
  payment_method?: string | null;
  /** Link OFICIAL do comprovante no Mercado Pago (ticket_url / external_resource_url). */
  mp_receipt_url?: string | null;
}

interface Recipient {
  email: string | null;
  name: string;
  optedOut: boolean;
}

async function resolveRecipient(supabase: any, ev: EventPayload): Promise<Recipient> {
  // Resolve o destinatário por store_id.
  if (ev.store_id) {
    const { data: store } = await supabase
      .from("merchant_stores")
      .select("email, nome_loja, user_id")
      .eq("id", ev.store_id)
      .maybeSingle();
    // PRIORIDADE: e-mail de LOGIN do dono da conta (quem de fato possui o
    // saldo). O campo `email` da loja é só contato e pode estar desatualizado
    // ou compartilhado entre lojas — usá-lo primeiro fazia o aviso de dinheiro
    // ir para a conta errada. Ordem: login do dono → perfil → e-mail da loja.
    if (store?.user_id) {
      try {
        const authResp = await fetch(
          `${SUPABASE_URL}/auth/v1/admin/users/${store.user_id}`,
          { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY } }
        );
        if (authResp.ok) {
          const authUser = await authResp.json();
          const ownerEmail: string | undefined = authUser?.email;
          if (ownerEmail) {
            return { email: ownerEmail, name: store.nome_loja || "", optedOut: false };
          }
        }
      } catch {}
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, name")
        .eq("id", store.user_id)
        .maybeSingle();
      if (profile?.email) {
        return { email: profile.email, name: profile.name || store?.nome_loja || "", optedOut: false };
      }
    }
    if (store?.email) {
      return { email: store.email, name: store.nome_loja || "", optedOut: false };
    }
  }

  if (ev.advertiser_account_id) {
    const { data } = await supabase
      .from("advertiser_accounts")
      .select("email, full_name, settings_json")
      .eq("id", ev.advertiser_account_id)
      .maybeSingle();
    if (data?.email) {
      return {
        email: data.email,
        name: data.full_name || "",
        optedOut: (data.settings_json || {}).receive_email_notifications === false,
      };
    }
  }

  if (ev.advertiser_user_id) {
    let displayName = "";
    let optedOut = false;

    // Coleta nome/prefs do advertiser_accounts (melhor fonte p/ nome e opt-out),
    // mas não depende dela p/ e-mail — auth.admin.getUserById é mais confiável.
    const { data: acct } = await supabase
      .from("advertiser_accounts")
      .select("email, full_name, settings_json")
      .eq("user_id", ev.advertiser_user_id)
      .maybeSingle();
    if (acct?.full_name) displayName = acct.full_name;
    if ((acct?.settings_json || {}).receive_email_notifications === false) optedOut = true;
    if (acct?.email) {
      return {
        email: acct.email,
        name: displayName,
        optedOut,
      };
    }

    // PRIORIDADE: e-mail de LOGIN via API REST do Supabase Auth (mais confiável que
    // supabase.auth.admin.getUserById, que depende da inicialização do cliente JS).
    try {
      const authResp = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${ev.advertiser_user_id}`,
        { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY } }
      );
      if (authResp.ok) {
        const authUser = await authResp.json();
        const authEmail: string | undefined = authUser?.email;
        console.log("[resolveRecipient] auth REST email:", authEmail || "not found");
        if (authEmail) {
          if (!displayName) {
            const { data: storeN } = await supabase
              .from("merchant_stores").select("nome_loja")
              .eq("user_id", ev.advertiser_user_id).maybeSingle();
            if (storeN?.nome_loja) displayName = storeN.nome_loja;
          }
          return { email: authEmail, name: displayName, optedOut };
        }
      } else {
        console.warn("[resolveRecipient] auth REST failed:", authResp.status, await authResp.text());
      }
    } catch (authErr) {
      console.warn("[resolveRecipient] auth REST error:", authErr);
    }

    // Fallbacks restantes se auth.admin não estiver disponível
    const { data: store } = await supabase
      .from("merchant_stores")
      .select("email, nome_loja")
      .eq("user_id", ev.advertiser_user_id)
      .not("email", "is", null)
      .maybeSingle();
    if (store?.email) {
      return { email: store.email, name: store.nome_loja || displayName, optedOut };
    }
    if (store?.nome_loja) displayName = store.nome_loja;

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, name")
      .eq("id", ev.advertiser_user_id)
      .maybeSingle();
    if (profile?.email) {
      return { email: profile.email, name: profile.name || displayName, optedOut };
    }
  }

  return { email: null, name: "", optedOut: false };
}

// Nome da loja (p/ o e-mail de confirmação ao comprador: "a loja X recebeu...").
async function resolveStoreName(supabase: any, ev: EventPayload): Promise<string> {
  if (ev.advertiser_user_id) {
    const { data } = await supabase
      .from("merchant_stores")
      .select("nome_loja")
      .eq("user_id", ev.advertiser_user_id)
      .not("nome_loja", "is", null)
      .maybeSingle();
    if (data?.nome_loja) return data.nome_loja;
  }
  if (ev.store_id) {
    const { data } = await supabase
      .from("merchant_stores")
      .select("nome_loja")
      .eq("id", ev.store_id)
      .maybeSingle();
    if (data?.nome_loja) return data.nome_loja;
  }
  return "";
}

// E-mail + nome do COMPRADOR (oferta) a partir do user_id. profiles primeiro,
// auth como fallback p/ o e-mail.
async function resolveBuyer(supabase: any, userId?: string): Promise<{ email: string | null; name: string }> {
  if (!userId) return { email: null, name: "" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, name")
    .eq("id", userId)
    .maybeSingle();
  let email: string | null = profile?.email || null;
  const name = profile?.name || "";
  if (!email) {
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    email = authData?.user?.email || null;
  }
  return { email, name };
}

// Best-effort: busca título (+ preço) e imagem do anúncio pelo listing_id,
// cobrindo os módulos product / real_estate / vehicle. Assim o bloco do produto
// aparece no e-mail de lead independente do tipo de anúncio.
async function resolveListing(supabase: any, ev: EventPayload): Promise<void> {
  if (!ev.listing_id) return;
  const mod = ev.listing_module || "product";

  const storageBase = SUPABASE_URL.replace(/\/$/, "");

  if (mod === "product") {
    // Um produto pode viver em DUAS tabelas distintas:
    //  • merchant_marketing_products → campanhas/ofertas (image_url, price_label texto)
    //  • advertiser_listings         → produtos do marketplace (cover_image_url + mídia, price número)
    // O listing_id existe em apenas uma delas; tenta a campanha primeiro.
    const { data: mkt } = await supabase
      .from("merchant_marketing_products")
      .select("title, image_url, price_label")
      .eq("id", ev.listing_id)
      .maybeSingle();
    if (mkt) {
      ev.listing_title = mkt.title || null;
      ev.listing_image_url = mkt.image_url || null;
      const raw = String(mkt.price_label ?? "").replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
      const p = Number(raw);
      if (raw && !Number.isNaN(p) && p > 0) ev.listing_price_brl = p;
      return;
    }

    // Não é campanha → produto do marketplace (advertiser_listings).
    const { data: adv } = await supabase
      .from("advertiser_listings")
      .select("title, cover_image_url, price")
      .eq("id", ev.listing_id)
      .maybeSingle();
    if (adv) {
      ev.listing_title = adv.title || null;
      ev.listing_price_brl = adv.price ?? null;
      ev.listing_image_url = adv.cover_image_url || null;
      if (!ev.listing_image_url) {
        // Sem capa? usa a 1ª mídia (media_url já é URL pública; storage_path como fallback).
        const { data: media } = await supabase
          .from("advertiser_listing_media")
          .select("media_url, storage_path")
          .eq("listing_id", ev.listing_id)
          .limit(1);
        const first = (media || [])[0];
        if (first) {
          ev.listing_image_url = first.media_url
            || (first.storage_path
              ? `${storageBase}/storage/v1/object/public/marketing-materials/${first.storage_path}`
              : null);
        }
      }
    }
    return;
  }

  if (mod === "real_estate") {
    const { data: re } = await supabase
      .from("real_estate_listings")
      .select("title, price_brl")
      .eq("id", ev.listing_id)
      .maybeSingle();
    if (re) {
      ev.listing_title = re.title || null;
      ev.listing_price_brl = re.price_brl ?? null;
    }
    // 1ª imagem mascarada APROVADA (bucket público real-estate-public).
    const { data: media } = await supabase
      .from("real_estate_media")
      .select("public_masked_storage_path, moderation_status, sort_order")
      .eq("listing_id", ev.listing_id)
      .order("sort_order", { ascending: true });
    const ok = (media || []).find((m: any) =>
      m.public_masked_storage_path &&
      ["approved", "approved_clean", "approved_masked"].includes(m.moderation_status)
    );
    if (ok) {
      ev.listing_image_url =
        `${storageBase}/storage/v1/object/public/real-estate-public/${ok.public_masked_storage_path}`;
    }
    return;
  }

  if (mod === "vehicle" || mod === "vehicles") {
    const { data: ve } = await supabase
      .from("vehicle_listings")
      .select("title, brand, model, year, price_brl, cover_image_url")
      .eq("id", ev.listing_id)
      .maybeSingle();
    if (ve) {
      const desc = [ve.brand, ve.model, ve.year].filter(Boolean).join(" ");
      ev.listing_title = ve.title || desc || null;
      ev.listing_price_brl = ve.price_brl ?? null;
      if (ve.cover_image_url) ev.listing_image_url = ve.cover_image_url;
    }
    // Sem capa? usa a 1ª mídia do veículo (bucket real-estate-original).
    if (!ev.listing_image_url) {
      const { data: vmedia } = await supabase
        .from("vehicle_media")
        .select("public_masked_storage_path, original_storage_path, sort_order")
        .eq("listing_id", ev.listing_id)
        .order("sort_order", { ascending: true });
      const first = (vmedia || [])[0];
      const p = first?.public_masked_storage_path || first?.original_storage_path;
      if (p) {
        ev.listing_image_url = String(p).startsWith("http")
          ? p
          : `${storageBase}/storage/v1/object/public/real-estate-original/${p}`;
      }
    }
    return;
  }

  if (mod === "services") {
    const { data: sv } = await supabase
      .from("service_listings")
      .select("title")
      .eq("id", ev.listing_id)
      .maybeSingle();
    if (sv) {
      ev.listing_title = sv.title || null;
    }
    // 1ª mídia do serviço (bucket real-estate-original, mesmo padrão de veículos).
    const { data: smedia } = await supabase
      .from("service_media")
      .select("public_masked_storage_path, original_storage_path, sort_order")
      .eq("listing_id", ev.listing_id)
      .order("sort_order", { ascending: true });
    const first = (smedia || [])[0];
    const p = first?.public_masked_storage_path || first?.original_storage_path;
    if (p) {
      ev.listing_image_url = String(p).startsWith("http")
        ? p
        : `${storageBase}/storage/v1/object/public/real-estate-original/${p}`;
    }
    return;
  }

  if (mod === "freight") {
    const { data: fr } = await supabase
      .from("freight_listings")
      .select("title")
      .eq("id", ev.listing_id)
      .maybeSingle();
    if (fr) {
      ev.listing_title = fr.title || null;
    }
    // 1ª mídia do frete (bucket real-estate-original, mesmo padrão de serviços).
    const { data: fmedia } = await supabase
      .from("freight_media")
      .select("public_masked_storage_path, original_storage_path, sort_order")
      .eq("listing_id", ev.listing_id)
      .order("sort_order", { ascending: true });
    const ffirst = (fmedia || [])[0];
    const fp = ffirst?.public_masked_storage_path || ffirst?.original_storage_path;
    if (fp) {
      ev.listing_image_url = String(fp).startsWith("http")
        ? fp
        : `${storageBase}/storage/v1/object/public/real-estate-original/${fp}`;
    }
    return;
  }

  if (mod === "travel") {
    const { data: tr } = await supabase
      .from("travel_listings")
      .select("title, description, price_per_person, total_price, entry_price, destination, departure_date, duration_days, category, owner_user_id")
      .eq("id", ev.listing_id)
      .maybeSingle();
    if (tr) {
      ev.listing_title = tr.title || null;
      // Preço: entry_price texto > price_per_person > total_price
      if (tr.entry_price) {
        const raw = Number(tr.entry_price);
        ev.listing_price_brl = !Number.isNaN(raw) && raw > 0 ? raw : null;
      } else {
        ev.listing_price_brl = tr.price_per_person ?? tr.total_price ?? null;
      }
      // Mini-descrição: destino + data de saída + duração
      const parts: string[] = [];
      if (tr.destination) parts.push(`✈️ Destino: ${tr.destination}`);
      if (tr.departure_date) {
        const d = new Date(tr.departure_date + "T12:00:00");
        parts.push(`📅 Saída: ${d.toLocaleDateString("pt-BR")}`);
      }
      if (tr.duration_days) parts.push(`⏱️ ${tr.duration_days} dias`);
      if (tr.category) parts.push(`🏷️ ${tr.category}`);
      if (parts.length) ev.listing_description = parts.join(" &nbsp;|&nbsp; ");
      // Injeta advertiser_user_id se ainda não resolvido
      if (!ev.advertiser_user_id && tr.owner_user_id) ev.advertiser_user_id = tr.owner_user_id;
    }
    // 1ª foto (bucket real-estate-original, mesmo padrão de veículos/serviços)
    const { data: tmedia } = await supabase
      .from("travel_media")
      .select("public_masked_storage_path, original_storage_path, sort_order")
      .eq("listing_id", ev.listing_id)
      .order("sort_order", { ascending: true });
    const tfirst = (tmedia || [])[0];
    const tp = tfirst?.public_masked_storage_path || tfirst?.original_storage_path;
    if (tp) {
      ev.listing_image_url = String(tp).startsWith("http")
        ? tp
        : `${storageBase}/storage/v1/object/public/real-estate-original/${tp}`;
    }
    return;
  }
}

// Pedido: busca a imagem/título do 1º item do pedido (os itens já estão commitados
// quando a edge function roda, pois o net.http_post é disparado após o commit).
async function resolveOrderImage(supabase: any, ev: EventPayload): Promise<void> {
  if (!ev.intention_id) return;
  const { data: item } = await supabase
    .from("purchase_intention_items")
    .select("product_image_url, product_title")
    .eq("intention_id", ev.intention_id)
    .limit(1)
    .maybeSingle();
  if (item) {
    ev.listing_image_url = item.product_image_url || null;
    ev.listing_title = item.product_title || null;
  }
}

function leadTemplate(ev: EventPayload, ownerName: string) {
  const action = INTEREST_LABELS[ev.interest_type || ""] || "demonstrou interesse";
  const greeting = ownerName ? `Olá, ${ownerName}!` : "Olá!";
  const nameMasked = maskName(ev.visitor_name);
  const phoneMasked = maskPhone(ev.visitor_phone);
  // O register_product_inquiry concatena o e-mail do visitante no texto — extrai e mascara.
  const { email, message: msg } = extractVisitorEmail(ev.visitor_message);
  const emailMasked = maskEmail(email);
  // Imóvel/veículo/serviço = anúncio de anunciante individual; produto = loja.
  const isRealEstate = ev.listing_module === "real_estate";
  const isVehicle = ev.listing_module === "vehicles";
  const isService = ev.listing_module === "services";
  const isFreight = ev.listing_module === "freight";
  const isTravel = ev.listing_module === "travel";
  const itemWord = ev.listing_module === "product" ? "produtos" : isService ? "serviços" : isFreight ? "fretes" : isTravel ? "viagens" : "anúncios";
  const painelLink = isRealEstate ? "/anunciante/imoveis/mensagens"
    : isVehicle ? "/anunciante/veiculos/mensagens"
    : isService ? "/anunciante/servicos/mensagens"
    : isFreight ? "/anunciante/fretes/mensagens"
    : isTravel ? "/anunciante/viagens/mensagens"
    : "/anunciante/mensagens";
  const subject = "Viagg-TX8 • Você tem um novo interessado! 🎯";
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background:#f4f4f5; margin:0; padding:20px;">
      <div style="max-width:600px; margin:0 auto; background:white; border-radius:12px; padding:40px;">
        ${LOGO_HEADER}
        <h1 style="color:#18181b; font-size:22px;">Você tem um novo interessado! 🎯</h1>
        <p style="color:#52525b; font-size:15px;">${greeting}</p>
        <p style="color:#52525b; font-size:15px;"><strong>${nameMasked}</strong> ${action} em um dos seus ${itemWord}.</p>
        ${productBlock(ev)}
        <div style="margin:24px 0; padding:20px; border-left:4px solid #16a34a; background:#f0fdf4; border-radius:6px;">
          <p style="margin:0 0 6px; font-size:14px;"><strong>Nome:</strong> ${nameMasked}</p>
          <p style="margin:0 0 6px; font-size:14px;"><strong>WhatsApp:</strong> ${phoneMasked}</p>
          ${emailMasked ? `<p style="margin:0 0 6px; font-size:14px;"><strong>E-mail:</strong> ${emailMasked}</p>` : ""}
          ${ev.city ? `<p style="margin:0 0 6px; font-size:14px;"><strong>Cidade:</strong> ${ev.city}</p>` : ""}
          ${msg ? `<p style="margin:8px 0 0; font-size:14px;"><strong>Mensagem:</strong> ${msg}</p>` : ""}
        </div>
        <p style="color:#71717a; font-size:13px;">🔒 Desbloqueie no painel para ver <strong>nome, WhatsApp e e-mail completos</strong> e responder.</p>
        ${ctaButton(painelLink, "Desbloquear contato")}
        <hr style="border:none; border-top:1px solid #e4e4e7; margin:24px 0;">
        <p style="color:#a1a1aa; font-size:12px;">Equipe Viagg-TX8</p>
      </div>
    </body></html>`;
  return { subject, html };
}

// Confirmação enviada ao PRÓPRIO interessado (comprador/visitante) quando ele
// demonstra interesse num produto. Mesmo visual do e-mail do lojista, porém
// SEM mascarar (é o dado dele) e com mensagem de "recebemos seu contato".
function buyerLeadTemplate(ev: EventPayload, buyerName: string | null | undefined, storeName: string) {
  const greeting = buyerName ? `Olá, ${buyerName}!` : "Olá!";
  // Imóvel/veículo = anunciante INDIVIDUAL (não é loja). Só produto vincula loja.
  const isStore = ev.listing_module === "product";
  const destino = (isStore && storeName) ? `a loja <strong>${storeName}</strong>` : "o anunciante";
  const { message: msg } = extractVisitorEmail(ev.visitor_message);
  const subject = "Viagg-TX8 • Recebemos o seu interesse! ✅";
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background:#f4f4f5; margin:0; padding:20px;">
      <div style="max-width:600px; margin:0 auto; background:white; border-radius:12px; padding:40px;">
        ${LOGO_HEADER}
        <h1 style="color:#18181b; font-size:22px;">Recebemos o seu interesse! ✅</h1>
        <p style="color:#52525b; font-size:15px;">${greeting}</p>
        <p style="color:#52525b; font-size:15px;">Enviamos o seu contato para ${destino}. Em breve o vendedor responde pelo WhatsApp que você informou.</p>
        ${productBlock(ev)}
        ${msg ? `<div style="margin:24px 0; padding:20px; border-left:4px solid #16a34a; background:#f0fdf4; border-radius:6px;">
          <p style="margin:0; font-size:14px;"><strong>Sua mensagem:</strong> ${msg}</p>
        </div>` : ""}
        <p style="color:#71717a; font-size:13px;">Obrigado por usar o Viagg-TX8! 💚</p>
        ${ctaButton("/mercado", "Explorar mais ofertas")}
        <hr style="border:none; border-top:1px solid #e4e4e7; margin:24px 0;">
        <p style="color:#a1a1aa; font-size:12px;">Equipe Viagg-TX8</p>
      </div>
    </body></html>`;
  return { subject, html };
}

// Confirmação ao anunciante de que o anúncio dele foi publicado (dispara no
// INSERT da tabela de listing, ex.: service_listings). Por enquanto só
// Serviços usa esse trigger, mas a função já resolve o link certo por módulo.
function listingPublishedTemplate(ev: EventPayload, ownerName: string) {
  const greeting = ownerName ? `Olá, ${ownerName}!` : "Olá!";
  const isRealEstate = ev.listing_module === "real_estate";
  const isVehicle = ev.listing_module === "vehicles";
  const isService = ev.listing_module === "services";
  const isFreight = ev.listing_module === "freight";
  const isTravelPub = ev.listing_module === "travel";
  const itemWord = isService ? "serviço" : isFreight ? "frete" : isRealEstate ? "imóvel" : isVehicle ? "veículo" : isTravelPub ? "viagem" : "anúncio";
  const painelLink = isRealEstate ? "/anunciante/imoveis/meus-anuncios"
    : isVehicle ? "/anunciante/veiculos/meus-anuncios"
    : isService ? "/anunciante/servicos/meus-anuncios"
    : isFreight ? "/anunciante/fretes/meus-anuncios"
    : isTravelPub ? "/anunciante/viagens/meus-anuncios"
    : "/anunciante/meus-anuncios";
  const subject = "Viagg-TX8 • Seu anúncio foi publicado! ✅";
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background:#f4f4f5; margin:0; padding:20px;">
      <div style="max-width:600px; margin:0 auto; background:white; border-radius:12px; padding:40px;">
        ${LOGO_HEADER}
        <h1 style="color:#18181b; font-size:22px;">Seu anúncio foi publicado! ✅</h1>
        <p style="color:#52525b; font-size:15px;">${greeting}</p>
        <p style="color:#52525b; font-size:15px;">Seu ${itemWord} já está no ar e visível para todo mundo no Viagg-TX8.</p>
        ${productBlock(ev)}
        <p style="color:#71717a; font-size:13px;">Assim que alguém demonstrar interesse, a gente te avisa por e-mail.</p>
        ${ctaButton(painelLink, "Ver meus anúncios")}
        <hr style="border:none; border-top:1px solid #e4e4e7; margin:24px 0;">
        <p style="color:#a1a1aa; font-size:12px;">Equipe Viagg-TX8</p>
      </div>
    </body></html>`;
  return { subject, html };
}

function ledgerTemplate(ev: EventPayload, ownerName: string) {
  const isDebit = ev.entry_type === "debit" || (typeof ev.amount === "number" && ev.amount < 0);
  const credits = Math.abs(Number(ev.amount || 0));
  const creditWord = credits === 1 ? "crédito" : "créditos";
  const label = EVENT_LABELS[ev.reason_code || ""] || ev.description || "Atividade na sua loja";
  const title = isDebit ? "Nova atividade na sua loja 🛎️" : "Créditos adicionados 💰";
  const creditLine = isDebit
    ? `Esta ação consumiu <strong>${credits} ${creditWord}</strong> do seu saldo.`
    : `Foram adicionados <strong>${credits} ${creditWord}</strong> ao seu saldo.`;
  const accent = isDebit ? "#0ea5e9" : "#16a34a";
  const greeting = ownerName ? `Olá, ${ownerName}!` : "Olá!";
  const subject = `Viagg-TX8 • ${label}`;
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background:#f4f4f5; margin:0; padding:20px;">
      <div style="max-width:600px; margin:0 auto; background:white; border-radius:12px; padding:40px;">
        ${LOGO_HEADER}
        <h1 style="color:#18181b; font-size:22px;">${title}</h1>
        <p style="color:#52525b; font-size:15px;">${greeting}</p>
        ${productBlock(ev)}
        <div style="margin:24px 0; padding:20px; border-left:4px solid ${accent}; background:#f8fafc; border-radius:6px;">
          <p style="color:#18181b; font-size:16px; font-weight:600; margin:0 0 6px;">${label}</p>
          <p style="color:#52525b; font-size:14px; margin:0;">${creditLine}</p>
          ${ev.description ? `<p style="color:#71717a; font-size:13px; margin:8px 0 0;">${ev.description}</p>` : ""}
        </div>
        ${ctaButton("/anunciante/painel", "Abrir meu painel")}
        <hr style="border:none; border-top:1px solid #e4e4e7; margin:24px 0;">
        <p style="color:#a1a1aa; font-size:12px;">Equipe Viagg-TX8</p>
      </div>
    </body></html>`;
  return { subject, html };
}

function formatBRL(value: number | null | undefined): string {
  const n = Number(value || 0);
  try {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return "R$ " + n.toFixed(2).replace(".", ",");
  }
}

function orderTemplate(ev: EventPayload, ownerName: string) {
  const customer = ev.customer_name || "Um cliente";
  const greeting = ownerName ? `Olá, ${ownerName}!` : "Olá!";
  const items = Number(ev.total_items || 0);
  const itemWord = items === 1 ? "item" : "itens";
  const subtotal = formatBRL(ev.subtotal);
  const modeLabel =
    ev.checkout_mode === "online_payment" ? "Pagamento online" : "Pagar/retirar na loja";
  const subject = `Viagg-TX8 • Novo pedido de ${customer}`;
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background:#f4f4f5; margin:0; padding:20px;">
      <div style="max-width:600px; margin:0 auto; background:white; border-radius:12px; padding:40px;">
        ${LOGO_HEADER}
        <h1 style="color:#18181b; font-size:22px;">Você recebeu um novo pedido! 🛒</h1>
        <p style="color:#52525b; font-size:15px;">${greeting}</p>
        <p style="color:#52525b; font-size:15px;"><strong>${customer}</strong> enviou um pedido na sua loja.</p>
        ${productBlock(ev)}
        <div style="margin:24px 0; padding:20px; border-left:4px solid #f59e0b; background:#fffbeb; border-radius:6px;">
          <p style="margin:0 0 6px; font-size:14px;"><strong>Total:</strong> ${subtotal} (${items} ${itemWord})</p>
          <p style="margin:0 0 6px; font-size:14px;"><strong>Forma:</strong> ${modeLabel}</p>
          ${ev.customer_whatsapp ? `<p style="margin:0 0 6px; font-size:14px;"><strong>WhatsApp:</strong> ${ev.customer_whatsapp}</p>` : ""}
          ${ev.customer_email ? `<p style="margin:0 0 6px; font-size:14px;"><strong>E-mail:</strong> ${ev.customer_email}</p>` : ""}
          ${ev.customer_note ? `<p style="margin:8px 0 0; font-size:14px;"><strong>Observação:</strong> ${ev.customer_note}</p>` : ""}
        </div>
        ${ctaButton("/anunciante/pedidos", "Ver pedido no painel")}
        <hr style="border:none; border-top:1px solid #e4e4e7; margin:24px 0;">
        <p style="color:#a1a1aa; font-size:12px;">Equipe Viagg-TX8</p>
      </div>
    </body></html>`;
  return { subject, html };
}

function balanceAlertTemplate(ev: EventPayload, ownerName: string) {
  const isZero = ev.alert_kind === "zero" || Number(ev.balance_after || 0) <= 0;
  const balance = Number(ev.balance_after || 0);
  const greeting = ownerName ? `Olá, ${ownerName}!` : "Olá!";
  const title = isZero ? "⚠️ Seus créditos acabaram" : "⚠️ Seu saldo de créditos está baixo";
  const accent = isZero ? "#dc2626" : "#f59e0b";
  const bg = isZero ? "#fef2f2" : "#fffbeb";
  const line = isZero
    ? "Seu saldo chegou a <strong>0 créditos</strong>. Sua loja pode parar de aparecer e de receber novos clientes até você recarregar."
    : `Restam apenas <strong>${balance} ${balance === 1 ? "crédito" : "créditos"}</strong>. Recarregue para não perder visitas, mensagens e pedidos.`;
  const subject = isZero
    ? "Viagg-TX8 • ⚠️ Seus créditos acabaram"
    : `Viagg-TX8 • ⚠️ Saldo baixo (${balance} ${balance === 1 ? "crédito" : "créditos"})`;
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background:#f4f4f5; margin:0; padding:20px;">
      <div style="max-width:600px; margin:0 auto; background:white; border-radius:12px; padding:40px;">
        ${LOGO_HEADER}
        <h1 style="color:#18181b; font-size:22px;">${title}</h1>
        <p style="color:#52525b; font-size:15px;">${greeting}</p>
        <div style="margin:24px 0; padding:20px; border-left:4px solid ${accent}; background:${bg}; border-radius:6px;">
          <p style="color:#18181b; font-size:15px; margin:0;">${line}</p>
        </div>
        ${ctaButton("/anunciante/creditos", "Recarregar créditos")}
        <hr style="border:none; border-top:1px solid #e4e4e7; margin:24px 0;">
        <p style="color:#a1a1aa; font-size:12px;">Equipe Viagg-TX8</p>
      </div>
    </body></html>`;
  return { subject, html };
}

function offerTemplate(ev: EventPayload, ownerName: string) {
  const greeting = ownerName ? `Olá, ${ownerName}!` : "Olá!";
  const amount = formatBRL(ev.offer_amount);
  const subject = `Viagg-TX8 • Nova oferta recebida: ${amount}`;
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background:#f4f4f5; margin:0; padding:20px;">
      <div style="max-width:600px; margin:0 auto; background:white; border-radius:12px; padding:40px;">
        ${LOGO_HEADER}
        <h1 style="color:#18181b; font-size:22px;">Você recebeu uma oferta! 💰</h1>
        <p style="color:#52525b; font-size:15px;">${greeting}</p>
        <p style="color:#52525b; font-size:15px;">Um comprador fez uma oferta em um dos seus produtos.</p>
        ${productBlock(ev)}
        <div style="margin:24px 0; padding:20px; border-left:4px solid #8b5cf6; background:#f5f3ff; border-radius:6px;">
          <p style="color:#18181b; font-size:18px; font-weight:700; margin:0 0 6px;">Oferta: ${amount}</p>
          ${ev.offer_note ? `<p style="color:#52525b; font-size:14px; margin:0;"><strong>Mensagem:</strong> ${ev.offer_note}</p>` : ""}
        </div>
        <p style="color:#71717a; font-size:13px;">Aceite ou responda no painel (aceitar uma oferta consome créditos).</p>
        ${ctaButton("/anunciante/ofertas-recebidas", "Ver oferta no painel")}
        <hr style="border:none; border-top:1px solid #e4e4e7; margin:24px 0;">
        <p style="color:#a1a1aa; font-size:12px;">Equipe Viagg-TX8</p>
      </div>
    </body></html>`;
  return { subject, html };
}

// Confirmação enviada ao PRÓPRIO comprador quando ele faz uma oferta. Mesmo
// visual do e-mail do lojista, com "torça para a loja aceitar".
function buyerOfferTemplate(ev: EventPayload, buyerName: string, storeName: string) {
  const greeting = buyerName ? `Olá, ${buyerName}!` : "Olá!";
  const amount = formatBRL(ev.offer_amount);
  const loja = storeName ? `a loja <strong>${storeName}</strong>` : "o vendedor";
  const subject = "Viagg-TX8 • Sua oferta foi enviada! 🤞";
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background:#f4f4f5; margin:0; padding:20px;">
      <div style="max-width:600px; margin:0 auto; background:white; border-radius:12px; padding:40px;">
        ${LOGO_HEADER}
        <h1 style="color:#18181b; font-size:22px;">Sua oferta foi enviada! 🤞</h1>
        <p style="color:#52525b; font-size:15px;">${greeting}</p>
        <p style="color:#52525b; font-size:15px;">Enviamos a sua oferta para ${loja}. Agora é torcer para o vendedor aceitar! 🍀</p>
        ${productBlock(ev)}
        <div style="margin:24px 0; padding:20px; border-left:4px solid #8b5cf6; background:#f5f3ff; border-radius:6px;">
          <p style="color:#18181b; font-size:18px; font-weight:700; margin:0 0 6px;">Sua oferta: ${amount}</p>
          ${ev.offer_note ? `<p style="color:#52525b; font-size:14px; margin:0;"><strong>Sua mensagem:</strong> ${ev.offer_note}</p>` : ""}
        </div>
        <p style="color:#71717a; font-size:13px;">Você será avisado assim que a loja responder.</p>
        ${ctaButton("/minhas-ofertas", "Acompanhar minhas ofertas")}
        <hr style="border:none; border-top:1px solid #e4e4e7; margin:24px 0;">
        <p style="color:#a1a1aa; font-size:12px;">Equipe Viagg-TX8</p>
      </div>
    </body></html>`;
  return { subject, html };
}

function walletTopupTemplate(ev: EventPayload, ownerName: string) {
  const greeting = ownerName ? `Olá, ${ownerName}!` : "Olá!";
  const amount = formatBRL(ev.amount_brl);
  const subject = `Viagg-TX8 • Saldo adicionado: ${amount} 🛵`;
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background:#f4f4f5; margin:0; padding:20px;">
      <div style="max-width:600px; margin:0 auto; background:white; border-radius:12px; padding:40px;">
        ${LOGO_HEADER}
        <h1 style="color:#18181b; font-size:22px;">Recarga confirmada! 🛵</h1>
        <p style="color:#52525b; font-size:15px;">${greeting}</p>
        <p style="color:#52525b; font-size:15px;">Recebemos o seu pagamento e o saldo já está disponível na sua carteira.</p>
        <div style="margin:24px 0; padding:20px; border-left:4px solid #10b981; background:#ecfdf5; border-radius:6px;">
          <p style="color:#18181b; font-size:18px; font-weight:700; margin:0 0 6px;">+ ${amount} de saldo</p>
          <p style="color:#52525b; font-size:14px; margin:0;">Use este saldo para <strong>chamar o motoboy</strong> e pagar suas entregas.</p>
        </div>
        ${receiptBlock(ev)}
        ${ctaButton("/merchant/billing", "Ver minha carteira")}
        <hr style="border:none; border-top:1px solid #e4e4e7; margin:24px 0;">
        <p style="color:#a1a1aa; font-size:12px;">Equipe Viagg-TX8</p>
      </div>
    </body></html>`;
  return { subject, html };
}

function packagePurchaseTemplate(ev: EventPayload, ownerName: string) {
  const greeting = ownerName ? `Olá, ${ownerName}!` : "Olá!";
  const amount = formatBRL(ev.amount_brl);
  const pkg = ev.package_name || "Pacote de créditos";
  const credits = Number(ev.credits || 0);
  const creditLine = credits > 0
    ? `<p style="color:#18181b; font-size:16px; font-weight:700; margin:6px 0 0;">+ ${credits.toLocaleString("pt-BR")} créditos</p>`
    : "";
  const subject = `Viagg-TX8 • Compra de créditos confirmada: ${amount} 💰`;
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background:#f4f4f5; margin:0; padding:20px;">
      <div style="max-width:600px; margin:0 auto; background:white; border-radius:12px; padding:40px;">
        ${LOGO_HEADER}
        <h1 style="color:#18181b; font-size:22px;">Compra confirmada! 💰</h1>
        <p style="color:#52525b; font-size:15px;">${greeting}</p>
        <p style="color:#52525b; font-size:15px;">Recebemos o seu pagamento e os créditos já estão disponíveis no seu painel.</p>
        <div style="margin:24px 0; padding:20px; border-left:4px solid #f59e0b; background:#fffbeb; border-radius:6px;">
          <p style="color:#18181b; font-size:15px; font-weight:600; margin:0;">${pkg}</p>
          ${creditLine}
          <p style="color:#52525b; font-size:14px; margin:8px 0 0;">Valor pago: <strong>${amount}</strong></p>
        </div>
        ${receiptBlock(ev)}
        ${ctaButton("/anunciante/creditos", "Ver meus créditos")}
        <hr style="border:none; border-top:1px solid #e4e4e7; margin:24px 0;">
        <p style="color:#a1a1aa; font-size:12px;">Equipe Viagg-TX8</p>
      </div>
    </body></html>`;
  return { subject, html };
}

// ── Comprovante / recibo de pagamento ──────────────────────────────────────
function fmtDateBR(iso?: string | null): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }); }
  catch { return String(iso); }
}
function gatewayLabel(name?: string | null): string {
  const n = String(name || "").toLowerCase();
  if (n.includes("mercado") || n === "mp" || n === "mercado_pago") return "Mercado Pago";
  return name || "Gateway de pagamento";
}

/** Busca o link OFICIAL do comprovante no Mercado Pago para o pagamento informado.
 *  Usa o access_token do gateway ativo (FASE 1: resolver central — config por
 *  ambiente → env vars → legado payment_gateways). Best-effort:
 *  retorna null se não houver token, pagamento ou URL de comprovante. */
async function fetchMpReceiptUrl(supabase: any, providerPaymentId: string): Promise<string | null> {
  try {
    if (!/^\d+$/.test(String(providerPaymentId))) return null; // só payment_id numérico do MP
    const resolved = await resolveMpGateway(supabase);
    const token = resolved.ok ? resolved.gw.credentials.access_token : undefined;
    if (!token) return null;

    const res = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(providerPaymentId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const p: any = await res.json().catch(() => ({}));
    // Comprovante oficial: PIX/boleto expõem ticket_url / external_resource_url.
    return (
      p?.point_of_interaction?.transaction_data?.ticket_url ||
      p?.transaction_details?.external_resource_url ||
      null
    );
  } catch (_e) {
    return null;
  }
}

/** Preenche ev com os dados de pagamento da ordem (best-effort) p/ o comprovante. */
async function enrichPaymentReceipt(supabase: any, ev: EventPayload): Promise<void> {
  if (!ev.order_id) return;
  try {
    const { data: o } = await supabase
      .from("pay_payment_orders")
      .select("amount, provider_name, provider_payment_id, paid_at, metadata")
      .eq("id", ev.order_id)
      .maybeSingle();
    if (o) {
      ev.provider_name = ev.provider_name ?? o.provider_name ?? null;
      ev.provider_payment_id = o.provider_payment_id ?? null;
      ev.paid_at = o.paid_at ?? null;
      if (ev.amount_brl == null) ev.amount_brl = Number(o.amount || 0);
      ev.payment_method = (o.metadata?.method || o.metadata?.payment_method || null);

      // Link oficial do comprovante no Mercado Pago (best-effort).
      const isMp = String(o.provider_name || "").toLowerCase().includes("mercado");
      if (isMp && o.provider_payment_id) {
        ev.mp_receipt_url = await fetchMpReceiptUrl(supabase, String(o.provider_payment_id));
      }
    }
  } catch (_e) { /* best-effort: sem comprovante detalhado */ }
}

/** Bloco HTML de comprovante de pagamento (recibo) para anexar ao e-mail. */
function receiptBlock(ev: EventPayload): string {
  if (!ev.order_id && !ev.provider_payment_id) return "";
  const rows: Array<[string, string]> = [];
  rows.push(["Forma de pagamento", gatewayLabel(ev.provider_name)]);
  if (ev.payment_method) rows.push(["Método", String(ev.payment_method)]);
  if (ev.provider_payment_id) rows.push(["ID do pagamento", String(ev.provider_payment_id)]);
  if (ev.paid_at) rows.push(["Data", fmtDateBR(ev.paid_at)]);
  rows.push(["Valor pago", formatBRL(ev.amount_brl)]);
  if (ev.order_id) rows.push(["Pedido", String(ev.order_id).slice(0, 8).toUpperCase()]);
  rows.push(["Status", "Aprovado ✅"]);
  const trs = rows.map(([k, v]) =>
    `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">${k}</td>` +
    `<td style="padding:4px 0;color:#18181b;font-size:13px;font-weight:600;text-align:right;">${v}</td></tr>`
  ).join("");
  const officialBtn = ev.mp_receipt_url
    ? `<div style="text-align:center; margin:16px 0 0;">
         <a href="${ev.mp_receipt_url}" target="_blank" style="display:inline-block; background:#009ee3; color:#ffffff; text-decoration:none; font-weight:700; font-size:13px; padding:11px 22px; border-radius:8px;">Ver comprovante no Mercado Pago</a>
       </div>`
    : "";
  return `
    <div style="margin:24px 0; padding:20px; border:1px solid #e4e4e7; border-radius:8px; background:#fafafa;">
      <p style="margin:0 0 12px; font-size:14px; font-weight:700; color:#18181b;">📄 Comprovante de pagamento</p>
      <table style="width:100%; border-collapse:collapse;">${trs}</table>
      ${officialBtn}
      <p style="margin:12px 0 0; font-size:11px; color:#a1a1aa;">Guarde este comprovante. Pagamento processado por ${gatewayLabel(ev.provider_name)}.</p>
    </div>`;
}

async function sendViaResend(to: string, subject: string, html: string) {
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error("Resend falhou: " + JSON.stringify(result));
  }
  return result;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY não configurada");
    if (!EMAIL_FROM) throw new Error("EMAIL_FROM não configurado");

    const ev: EventPayload = await req.json();
    if (!ev?.advertiser_account_id && !ev?.advertiser_user_id && !ev?.store_id && !ev?.lead_intention_id) {
      throw new Error("Payload inválido: informe advertiser_account_id, advertiser_user_id, store_id ou lead_intention_id");
    }

    console.log("[swift-action] svc_key_set:", !!SERVICE_ROLE_KEY, "source:", ev.source, "lead_id:", ev.lead_intention_id || "-", "listing_id:", ev.listing_id || "-");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Se veio lead_intention_id sem advertiser_user_id, busca a intenção para preencher os campos
    if (ev.lead_intention_id && !ev.advertiser_user_id) {
      const { data: intention, error: intentionErr } = await supabase
        .from("advertiser_contact_intentions")
        .select("advertiser_user_id, listing_module, listing_id, interest_type, visitor_name, visitor_phone, visitor_message, city")
        .eq("id", ev.lead_intention_id)
        .maybeSingle();
      console.log("[swift-action] intention lookup:", intention?.advertiser_user_id || "null", intentionErr?.message || "ok");
      if (intention) {
        ev.advertiser_user_id   = intention.advertiser_user_id;
        ev.listing_module       = ev.listing_module   || intention.listing_module;
        ev.listing_id           = ev.listing_id       || intention.listing_id;
        ev.interest_type        = ev.interest_type    || intention.interest_type;
        ev.visitor_name         = ev.visitor_name     || intention.visitor_name;
        ev.visitor_phone        = ev.visitor_phone    || intention.visitor_phone;
        ev.visitor_message      = ev.visitor_message  || intention.visitor_message;
        ev.city                 = ev.city             || intention.city;
        ev.source               = ev.source           || "lead";
      }
    }

    // Fallback: se a tabela advertiser_contact_intentions estiver bloqueada por RLS
    // (anon key), tenta resolver advertiser_user_id direto pela tabela do anúncio
    // (que é pública). Cobre product, real_estate, vehicles, services, freight.
    if (!ev.advertiser_user_id && ev.listing_id) {
      try {
        const mod = ev.listing_module || "product";
        if (mod === "product") {
          const { data } = await supabase.from("merchant_marketing_products")
            .select("created_by_user_id").eq("id", ev.listing_id).maybeSingle();
          if (data?.created_by_user_id) ev.advertiser_user_id = data.created_by_user_id;
        } else if (mod === "real_estate") {
          const { data } = await supabase.from("real_estate_listings")
            .select("user_id").eq("id", ev.listing_id).maybeSingle();
          if (data?.user_id) ev.advertiser_user_id = data.user_id;
        } else if (mod === "vehicle" || mod === "vehicles") {
          const { data } = await supabase.from("vehicle_listings")
            .select("user_id").eq("id", ev.listing_id).maybeSingle();
          if (data?.user_id) ev.advertiser_user_id = data.user_id;
        } else if (mod === "services") {
          const { data } = await supabase.from("service_listings")
            .select("user_id").eq("id", ev.listing_id).maybeSingle();
          if (data?.user_id) ev.advertiser_user_id = data.user_id;
        } else if (mod === "freight") {
          const { data } = await supabase.from("freight_listings")
            .select("user_id").eq("id", ev.listing_id).maybeSingle();
          if (data?.user_id) ev.advertiser_user_id = data.user_id;
        } else if (mod === "travel") {
          const { data } = await supabase.from("travel_listings")
            .select("owner_user_id").eq("id", ev.listing_id).maybeSingle();
          if (data?.owner_user_id) ev.advertiser_user_id = data.owner_user_id;
        }
      } catch (listingErr) {
        console.warn("[swift-action] listing fallback error:", listingErr);
      }
    }

    console.log("[swift-action] advertiser_user_id resolved:", ev.advertiser_user_id || "NONE");

    // Imagem/título do produto (best-effort) p/ lead, ledger e oferta de desconto
    // (que manda listing_id). Arremate manda os campos do produto direto (sem
    // listing_id) → resolveListing sai cedo e preserva os valores recebidos.
    if (ev.source === "lead" || ev.source === "ledger" || ev.source === "listing_published" || (ev.source === "offer" && ev.listing_id)) {
      await resolveListing(supabase, ev);
    } else if (ev.source === "order") {
      await resolveOrderImage(supabase, ev);
    } else if (ev.source === "package_purchase" || ev.source === "wallet_topup") {
      // Enriquecer com dados de pagamento p/ o comprovante/recibo no e-mail.
      await enrichPaymentReceipt(supabase, ev);
    }

    const recipient = await resolveRecipient(supabase, ev);
    const sentTo: string[] = [];

    // 1) E-mail ao LOJISTA (dono do produto/loja).
    if (recipient.email && !recipient.optedOut) {
      const { subject, html } =
        ev.source === "package_purchase" ? packagePurchaseTemplate(ev, recipient.name)
        : ev.source === "wallet_topup" ? walletTopupTemplate(ev, recipient.name)
        : ev.source === "balance_alert" ? balanceAlertTemplate(ev, recipient.name)
        : ev.source === "offer" ? offerTemplate(ev, recipient.name)
        : ev.source === "order" ? orderTemplate(ev, recipient.name)
        : ev.source === "lead" ? leadTemplate(ev, recipient.name)
        : ev.source === "listing_published" ? listingPublishedTemplate(ev, recipient.name)
        : ledgerTemplate(ev, recipient.name);
      await sendViaResend(recipient.email, subject, html);
      sentTo.push(recipient.email);
    }

    // 2) E-mail de CONFIRMAÇÃO ao COMPRADOR — só em leads (interesse no produto),
    //    quando o visitante informou e-mail. Mesmo visual do e-mail do lojista,
    //    porém sem mascarar (é o dado do próprio comprador).
    if (ev.source === "lead") {
      // visitor_email direto no payload tem prioridade; fallback: extrai da mensagem
      const { email: extractedEmail } = extractVisitorEmail(ev.visitor_message);
      const buyerEmail = (ev.visitor_email || extractedEmail || "").trim();
      if (buyerEmail) {
        const storeName = await resolveStoreName(supabase, ev);
        const { subject, html } = buyerLeadTemplate(ev, ev.visitor_name, storeName);
        await sendViaResend(buyerEmail, subject, html);
        sentTo.push(buyerEmail);
      }
    }

    // 3) E-mail de CONFIRMAÇÃO ao COMPRADOR — quando ele faz uma OFERTA.
    //    Arremate: comprador logado → buyer_user_id (resolve e-mail/nome).
    //    Desconto ("Minha Oferta é"): comprador anônimo → customer_email (se informou).
    if (ev.source === "offer") {
      let buyerEmail: string | null = null;
      let buyerName = ev.customer_name || "";
      if (ev.buyer_user_id) {
        const buyer = await resolveBuyer(supabase, ev.buyer_user_id);
        buyerEmail = buyer.email;
        if (buyer.name) buyerName = buyer.name;
      } else if (ev.customer_email) {
        buyerEmail = ev.customer_email;
      }
      if (buyerEmail) {
        const storeName = await resolveStoreName(supabase, ev);
        const { subject, html } = buyerOfferTemplate(ev, buyerName, storeName);
        await sendViaResend(buyerEmail, subject, html);
        sentTo.push(buyerEmail);
      }
    }

    if (sentTo.length === 0) {
      return new Response(JSON.stringify({ skipped: "sem_email" }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ success: true, to: sentTo }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Erro:", message);
    return new Response(JSON.stringify({ error: { message, http_code: 500 } }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
