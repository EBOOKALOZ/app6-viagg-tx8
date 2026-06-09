// Edge Function: send-event-notification
// Envia e-mail ao lojista (advertiser) a cada evento relevante, usando Resend
// (mesmo provedor da função enviar-email). Chamada por triggers AFTER INSERT:
//   1. advertiser_credit_ledger        → source = "ledger"
//   2. advertiser_contact_intentions   → source = "lead"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const EVENT_LABELS: Record<string, string> = {
  visitor_store_entry: "Visitante entrou na sua loja",
  visitor_product_click: "Clique em um produto seu",
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
  source?: "ledger" | "lead";
  advertiser_account_id?: string;
  advertiser_user_id?: string;
  entry_type?: string;
  amount?: number;
  reason_code?: string;
  description?: string | null;
  listing_module?: string;
  listing_id?: string;
  interest_type?: string;
  visitor_name?: string | null;
  visitor_phone?: string | null;
  visitor_message?: string | null;
  city?: string | null;
}

interface Recipient {
  email: string | null;
  name: string;
  optedOut: boolean;
}

async function resolveRecipient(supabase: any, ev: EventPayload): Promise<Recipient> {
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

function leadTemplate(ev: EventPayload, ownerName: string) {
  const action = INTEREST_LABELS[ev.interest_type || ""] || "demonstrou interesse";
  const visitor = ev.visitor_name || "Um cliente";
  const greeting = ownerName ? `Olá, ${ownerName}!` : "Olá!";
  const subject = `Viagg-TX8 • Novo interessado: ${visitor}`;
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background:#f4f4f5; margin:0; padding:20px;">
      <div style="max-width:600px; margin:0 auto; background:white; border-radius:12px; padding:40px;">
        <h1 style="color:#18181b; font-size:22px;">Você tem um novo interessado! 🎯</h1>
        <p style="color:#52525b; font-size:15px;">${greeting}</p>
        <p style="color:#52525b; font-size:15px;"><strong>${visitor}</strong> ${action} em um dos seus produtos.</p>
        <div style="margin:24px 0; padding:20px; border-left:4px solid #16a34a; background:#f0fdf4; border-radius:6px;">
          ${ev.visitor_name ? `<p style="margin:0 0 6px; font-size:14px;"><strong>Nome:</strong> ${ev.visitor_name}</p>` : ""}
          ${ev.visitor_phone ? `<p style="margin:0 0 6px; font-size:14px;"><strong>WhatsApp:</strong> ${ev.visitor_phone}</p>` : ""}
          ${ev.city ? `<p style="margin:0 0 6px; font-size:14px;"><strong>Cidade:</strong> ${ev.city}</p>` : ""}
          ${ev.visitor_message ? `<p style="margin:8px 0 0; font-size:14px;"><strong>Mensagem:</strong> ${ev.visitor_message}</p>` : ""}
        </div>
        <p style="color:#71717a; font-size:13px;">Acesse o painel em <strong>Mensagens</strong> para desbloquear o contato e responder.</p>
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
        <h1 style="color:#18181b; font-size:22px;">${title}</h1>
        <p style="color:#52525b; font-size:15px;">${greeting}</p>
        <div style="margin:24px 0; padding:20px; border-left:4px solid ${accent}; background:#f8fafc; border-radius:6px;">
          <p style="color:#18181b; font-size:16px; font-weight:600; margin:0 0 6px;">${label}</p>
          <p style="color:#52525b; font-size:14px; margin:0;">${creditLine}</p>
          ${ev.description ? `<p style="color:#71717a; font-size:13px; margin:8px 0 0;">${ev.description}</p>` : ""}
        </div>
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
    if (!ev?.advertiser_account_id && !ev?.advertiser_user_id) {
      throw new Error("Payload inválido: informe advertiser_account_id ou advertiser_user_id");
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

    const { subject, html } =
      ev.source === "lead" ? leadTemplate(ev, recipient.name) : ledgerTemplate(ev, recipient.name);

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
