/**
 * Mercado Pago — helpers Deno (Edge Functions).
 *
 * Porte enxuto de src/lib/payments/drivers/mercadopago/index.ts. O driver do
 * browser foi escrito ambiente-agnóstico (fetch + Web Crypto) de propósito;
 * esta cópia existe só porque Edge Functions (Deno) não importam de src/ com
 * o alias @/. Manter as DUAS em sincronia ao mexer em endpoint/assinatura.
 *
 * Aqui só vive o que o servidor precisa: chargePix, chargeCheckoutPro,
 * getPaymentStatus e validateWebhook (HMAC x-signature).
 */

const MP_API = "https://api.mercadopago.com";

export interface MpCreds {
  access_token: string;
  public_key?: string;
  webhook_secret?: string;
}

export interface MpChargeInput {
  method: "pix" | "credit_card" | "debit_card" | "boleto";
  amount_brl: number; // já em reais (2 casas)
  description: string;
  reference: string; // external_reference: "type:id"
  idempotency_key: string;
  payer_email?: string;
  notification_url?: string;
  back_url?: string;
  pix_expires_minutes?: number;
  sandbox: boolean;
}

export interface MpChargeOutput {
  ok: boolean;
  provider_payment_id?: string;
  status?: string; // status MP cru
  pix_qr_base64?: string;
  pix_copy_paste?: string;
  checkout_url?: string;
  expires_at?: string;
  error?: string;
}

async function mpFetch(
  creds: MpCreds,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string },
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.access_token}`,
    "Content-Type": "application/json",
  };
  if (init.idempotencyKey) headers["X-Idempotency-Key"] = init.idempotencyKey;

  const res = await fetch(`${MP_API}${path}`, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let body: Record<string, unknown> = {};
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text };
    }
  }
  return { ok: res.ok, status: res.status, body };
}

function errMsg(status: number, body: Record<string, unknown>): string {
  const m = (body?.message as string) || (body?.error as string) ||
    "erro desconhecido";
  return `MP ${status}: ${m}`;
}

export async function mpCharge(
  creds: MpCreds,
  input: MpChargeInput,
): Promise<MpChargeOutput> {
  try {
    if (input.method === "pix") {
      const expMin = input.pix_expires_minutes ?? 30;
      const expISO = new Date(Date.now() + expMin * 60_000).toISOString();
      const res = await mpFetch(creds, "/v1/payments", {
        method: "POST",
        idempotencyKey: input.idempotency_key,
        body: {
          transaction_amount: input.amount_brl,
          description: input.description,
          payment_method_id: "pix",
          external_reference: input.reference,
          date_of_expiration: expISO,
          ...(input.notification_url
            ? { notification_url: input.notification_url }
            : {}),
          payer: {
            // Sandbox: e-mail NEUTRO de comprador de teste. Se for o e-mail
            // do dono da conta MP (caso do usuário logado nos testes), a API
            // recusa com 403 "policy UNAUTHORIZED" — pagador = recebedor.
            email: input.sandbox
              ? "test_user_viagg@testuser.com"
              : (input.payer_email || "no-reply@viagg.com.br"),
            first_name: "Cliente",
          },
        },
      });
      if (!res.ok) return { ok: false, error: errMsg(res.status, res.body) };
      const b = res.body;
      const tx = (b.point_of_interaction as Record<string, unknown>)
        ?.transaction_data as Record<string, unknown> | undefined;
      return {
        ok: true,
        provider_payment_id: String(b.id ?? ""),
        status: String(b.status ?? "pending"),
        pix_qr_base64: tx?.qr_code_base64 as string | undefined,
        pix_copy_paste: tx?.qr_code as string | undefined,
        expires_at: (b.date_of_expiration as string) ?? expISO,
      };
    }

    // cartão/boleto → Checkout Pro
    const res = await mpFetch(creds, "/checkout/preferences", {
      method: "POST",
      idempotencyKey: input.idempotency_key,
      body: {
        items: [{
          title: input.description,
          quantity: 1,
          unit_price: input.amount_brl,
          currency_id: "BRL",
        }],
        external_reference: input.reference,
        // Sandbox: NÃO pinar o payer — se o e-mail for o dono da conta MP,
        // a API recusa com 403 "At least one policy returned UNAUTHORIZED"
        // (ninguém paga a si mesmo). O comprador de TESTE se identifica na
        // própria página hospedada. Em produção o payer segue pinado.
        ...(input.payer_email && !input.sandbox
          ? { payer: { email: input.payer_email } }
          : {}),
        ...(input.notification_url
          ? { notification_url: input.notification_url }
          : {}),
        ...(input.back_url
          ? {
            back_urls: {
              success: input.back_url,
              failure: input.back_url,
              pending: input.back_url,
            },
            auto_return: "approved",
          }
          : {}),
      },
    });
    if (!res.ok) return { ok: false, error: errMsg(res.status, res.body) };
    const b = res.body;
    return {
      ok: true,
      provider_payment_id: String(b.id ?? ""),
      status: "pending",
      checkout_url: input.sandbox
        ? (b.sandbox_init_point as string) ?? (b.init_point as string)
        : (b.init_point as string),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Dados tokenizados vindos do Payment Brick (front) p/ cobrar cartão direto. */
export interface MpCardInput {
  amount_brl: number;
  description: string;
  reference: string;
  idempotency_key: string;
  notification_url?: string;
  token: string;
  payment_method_id: string;
  installments: number;
  issuer_id?: string;
  payer?: {
    email?: string;
    identification?: { type?: string; number?: string };
  };
}

/**
 * Cobrança de cartão via POST /v1/payments usando o token do Brick.
 * Diferente do Checkout Pro (preference), aqui a cobrança é processada na hora
 * e o status já volta (approved/rejected/in_process).
 */
export async function mpChargeCard(
  creds: MpCreds,
  input: MpCardInput,
): Promise<MpChargeOutput & { status_detail?: string }> {
  try {
    const res = await mpFetch(creds, "/v1/payments", {
      method: "POST",
      idempotencyKey: input.idempotency_key,
      body: {
        transaction_amount: input.amount_brl,
        token: input.token,
        description: input.description,
        installments: input.installments || 1,
        payment_method_id: input.payment_method_id,
        ...(input.issuer_id ? { issuer_id: input.issuer_id } : {}),
        external_reference: input.reference,
        ...(input.notification_url
          ? { notification_url: input.notification_url }
          : {}),
        payer: {
          email: input.payer?.email || "no-reply@viagg.com.br",
          ...(input.payer?.identification
            ? { identification: input.payer.identification }
            : {}),
        },
      },
    });
    if (!res.ok) return { ok: false, error: errMsg(res.status, res.body) };
    const b = res.body;
    return {
      ok: true,
      provider_payment_id: String(b.id ?? ""),
      status: String(b.status ?? "pending"),
      status_detail: b.status_detail as string | undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function mpGetPaymentStatus(
  creds: MpCreds,
  paymentId: string,
): Promise<{ status: string; raw: Record<string, unknown> }> {
  const res = await mpFetch(creds, `/v1/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
  });
  return {
    status: res.ok ? String(res.body.status ?? "pending") : "pending",
    raw: res.body,
  };
}

/** status MP → event_type normalizado. */
export function mpStatusToEvent(
  mpStatus: string,
): "charge.paid" | "charge.failed" | "charge.expired" | "charge.refunded" | "unknown" {
  switch (mpStatus) {
    case "approved":
      return "charge.paid";
    case "rejected":
      return "charge.failed";
    case "cancelled":
      return "charge.expired";
    case "refunded":
    case "charged_back":
      return "charge.refunded";
    default:
      return "unknown";
  }
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export interface WebhookResult {
  valid: boolean;
  error?: string;
  data_id?: string; // provider_payment_id (data.id)
  topic?: string;
  raw?: Record<string, unknown>;
}

/**
 * Valida o header x-signature do MP.
 * Manifest: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 */
export async function mpValidateWebhook(
  secret: string | undefined,
  rawBody: string,
  signatureHeader: string | null,
  requestId: string | null,
): Promise<WebhookResult> {
  if (!secret) return { valid: false, error: "webhook_secret não configurado" };
  if (!signatureHeader) {
    return { valid: false, error: "x-signature ausente" };
  }
  const parts: Record<string, string> = {};
  for (const seg of signatureHeader.split(",")) {
    const i = seg.indexOf("=");
    if (i > -1) parts[seg.slice(0, i).trim()] = seg.slice(i + 1).trim();
  }
  if (!parts.ts || !parts.v1) {
    return { valid: false, error: "x-signature malformado" };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { valid: false, error: "body não é JSON" };
  }
  const dataId = (payload.data as Record<string, unknown>)?.id as string ??
    (payload.id as string | undefined);

  let manifest = "";
  if (dataId) manifest += `id:${String(dataId).toLowerCase()};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${parts.ts};`;

  const expected = await hmacHex(secret, manifest);
  if (expected !== parts.v1) {
    return { valid: false, error: "assinatura HMAC não confere" };
  }

  return {
    valid: true,
    data_id: dataId ? String(dataId) : undefined,
    topic: (payload.type as string) || (payload.topic as string) ||
      (payload.action as string) || "unknown",
    raw: payload,
  };
}
