// Edge Function: send-event-notification  (publicada como `swift-action`)
// Envia e-mail ao lojista (advertiser) a cada evento relevante, usando Resend.
// Chamada por triggers AFTER INSERT, distinguidos por `source`:
//   1. advertiser_contact_intentions → "lead"          (perguntas/mensagens)
//   2. purchase_intentions           → "order"         (pedidos)
//   3. advertiser_credit_ledger      → "ledger"        (todo consumo de crédito)
//                                    → "balance_alert"  (saldo < 6 ou zerado)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Marca / links do app (e-mails só aceitam URLs absolutas e públicas).
const APP_BASE = "https://viagg-tx8.com.br";
const LOGO_URL = "https://viagg-tx8.com.br/images/viagg-tx8-logo.jpg";
const LOGO_HEADER = `<div style="text-align:center; margin-bottom:24px;"><img src="${LOGO_URL}" alt="Viagg-TX8" width="110" style="display:inline-block; max-width:110px; height:auto; border-radius:14px;" /></div>`;

function ctaButton(path: string, label: string) {
  return `<div style="text-align:center; margin:28px 0 8px;"><a href="${APP_BASE}${path}" style="display:inline-block; background:#f59e0b; color:#18181b; text-decoration:none; font-weight:700; font-size:15px; padding:13px 30px; border-radius:10px;">${label}</a></div>`;
}

function productBlock(ev: EventPayload) {
  if (!ev.listing_image_url && !ev.listing_title) return "";
  return `<div style="margin:0 0 20px; text-align:center;">
    ${ev.listing_image_url ? `<img src="${ev.listing_image_url}" alt="${ev.listing_title || "Produto"}" width="220" style="max-width:220px; width:100%; height:auto; border-radius:12px; border:1px solid #e4e4e7;" />` : ""}
    ${ev.listing_title ? `<p style="color:#18181b; font-size:15px; font-weight:600; margin:10px 0 0;">${ev.listing_title}</p>` : ""}
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
  source?: "ledger" | "lead" | "order" | "balance_alert" | "offer" | "wallet_topup" | "package_purchase";
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
  city?: string | null;
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
  // Oferta (source = "offer")
  offer_amount?: number | null;
  offer_note?: string | null;
  // Recarga de saldo p/ chamar motoboy (source = "wallet_topup")
  // e compra de pacote de créditos (source = "package_purchase")
  amount_brl?: number | null;
  package_name?: string | null;
  credits?: number | null;
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
      const { data: authData } = await supabase.auth.admin.getUserById(store.user_id);
      const ownerEmail = authData?.user?.email;
      if (ownerEmail) {
        return { email: ownerEmail, name: store.nome_loja || "", optedOut: false };
      }
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
    const { data } = await supabase
      .from("advertiser_accounts")
      .select("email, full_name, settings_json")
      .eq("user_id", ev.advertiser_user_id)
      .maybeSingle();
    if (data?.email) {
      return {
        email: data.email,
        name: data.full_name || "",
        optedOut: (data.settings_json || {}).receive_email_notifications === false,
      };
    }

    const { data: store } = await supabase
      .from("merchant_stores")
      .select("email, nome_loja")
      .eq("user_id", ev.advertiser_user_id)
      .not("email", "is", null)
      .maybeSingle();
    if (store?.email) {
      return { email: store.email, name: store.nome_loja || "", optedOut: false };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, name")
      .eq("id", ev.advertiser_user_id)
      .maybeSingle();
    if (profile?.email) {
      return { email: profile.email, name: profile.name || "", optedOut: false };
    }
  }

  return { email: null, name: "", optedOut: false };
}

// Best-effort: busca imagem/título do produto pelo listing_id (módulo product).
async function resolveListing(supabase: any, ev: EventPayload): Promise<void> {
  if (!ev.listing_id) return;
  if (ev.listing_module && ev.listing_module !== "product") return;
  const { data: prod } = await supabase
    .from("merchant_marketing_products")
    .select("title, image_url")
    .eq("id", ev.listing_id)
    .maybeSingle();
  if (prod) {
    ev.listing_image_url = prod.image_url || null;
    ev.listing_title = prod.title || null;
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
  let msg = (ev.visitor_message || "").trim();
  let email = "";
  const m = msg.match(/e-?mail:\s*([^\s]+@[^\s]+)/i);
  if (m) { email = m[1]; msg = msg.replace(/\n*\s*e-?mail:\s*[^\s]+@[^\s]+/i, "").trim(); }
  const emailMasked = maskEmail(email);
  const subject = "Viagg-TX8 • Você tem um novo interessado! 🎯";
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background:#f4f4f5; margin:0; padding:20px;">
      <div style="max-width:600px; margin:0 auto; background:white; border-radius:12px; padding:40px;">
        ${LOGO_HEADER}
        <h1 style="color:#18181b; font-size:22px;">Você tem um novo interessado! 🎯</h1>
        <p style="color:#52525b; font-size:15px;">${greeting}</p>
        <p style="color:#52525b; font-size:15px;"><strong>${nameMasked}</strong> ${action} em um dos seus produtos.</p>
        ${productBlock(ev)}
        <div style="margin:24px 0; padding:20px; border-left:4px solid #16a34a; background:#f0fdf4; border-radius:6px;">
          <p style="margin:0 0 6px; font-size:14px;"><strong>Nome:</strong> ${nameMasked}</p>
          <p style="margin:0 0 6px; font-size:14px;"><strong>WhatsApp:</strong> ${phoneMasked}</p>
          ${emailMasked ? `<p style="margin:0 0 6px; font-size:14px;"><strong>E-mail:</strong> ${emailMasked}</p>` : ""}
          ${ev.city ? `<p style="margin:0 0 6px; font-size:14px;"><strong>Cidade:</strong> ${ev.city}</p>` : ""}
          ${msg ? `<p style="margin:8px 0 0; font-size:14px;"><strong>Mensagem:</strong> ${msg}</p>` : ""}
        </div>
        <p style="color:#71717a; font-size:13px;">🔒 Desbloqueie no painel para ver <strong>nome, WhatsApp e e-mail completos</strong> e responder.</p>
        ${ctaButton("/anunciante/mensagens", "Desbloquear contato")}
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
        ${ctaButton("/anunciante/creditos", "Ver meus créditos")}
        <hr style="border:none; border-top:1px solid #e4e4e7; margin:24px 0;">
        <p style="color:#a1a1aa; font-size:12px;">Equipe Viagg-TX8</p>
      </div>
    </body></html>`;
  return { subject, html };
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
    if (!ev?.advertiser_account_id && !ev?.advertiser_user_id && !ev?.store_id) {
      throw new Error("Payload inválido: informe advertiser_account_id, advertiser_user_id ou store_id");
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const recipient = await resolveRecipient(supabase, ev);

    if (!recipient.email) {
      return new Response(JSON.stringify({ skipped: "sem_email" }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    if (recipient.optedOut) {
      return new Response(JSON.stringify({ skipped: "opt_out" }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Imagem/título do produto (best-effort) p/ lead e ledger
    if (ev.source === "lead" || ev.source === "ledger") {
      await resolveListing(supabase, ev);
    } else if (ev.source === "order") {
      await resolveOrderImage(supabase, ev);
    }

    const { subject, html } =
      ev.source === "package_purchase" ? packagePurchaseTemplate(ev, recipient.name)
      : ev.source === "wallet_topup" ? walletTopupTemplate(ev, recipient.name)
      : ev.source === "balance_alert" ? balanceAlertTemplate(ev, recipient.name)
      : ev.source === "offer" ? offerTemplate(ev, recipient.name)
      : ev.source === "order" ? orderTemplate(ev, recipient.name)
      : ev.source === "lead" ? leadTemplate(ev, recipient.name)
      : ledgerTemplate(ev, recipient.name);

    await sendViaResend(recipient.email, subject, html);

    return new Response(JSON.stringify({ success: true, to: recipient.email }), {
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
