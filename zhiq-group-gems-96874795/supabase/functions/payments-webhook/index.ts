/**
 * payments-webhook — recebe notificações do gateway, valida HMAC e aplica.
 *
 * Público (verify_jwt=false): o MP chama sem JWT. A autenticidade vem da
 * assinatura x-signature (HMAC SHA256 com webhook_secret do gateway).
 *
 * Rota: POST /functions/v1/payments-webhook/:provider  (default mercadopago)
 *
 * Fluxo:
 *  1. lê raw body + x-signature + x-request-id
 *  2. service_role lê credenciais do gateway
 *  3. valida HMAC; assinatura inválida → 401 (MP não deve reenviar)
 *  4. MP não manda status no webhook → GET /v1/payments/{id} resolve
 *  5. pay_webhook_apply_event (idempotente, transição + crédito single-sided)
 *  6. retry exponencial em 40001 (serialization). Erro transitório → 500
 *     (MP reenviará). Sucesso/idempotente/não-acionável → 200.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import {
  mpGetPaymentStatus,
  mpStatusToEvent,
  mpValidateWebhook,
  type MpCreds,
} from "./mp.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-signature, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const url = new URL(req.url);
  const seg = url.pathname.split("/").filter(Boolean);
  const provider = seg[seg.length - 1] === "payments-webhook"
    ? "mercadopago"
    : seg[seg.length - 1];

  if (provider !== "mercadopago") {
    return json({ error: `provider ${provider} não suportado` }, 400);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(SUPABASE_URL, SERVICE);

  const rawBody = await req.text();
  const signature = req.headers.get("x-signature");
  const requestId = req.headers.get("x-request-id");

  // Credenciais do gateway ativo.
  const { data: gw, error: gwErr } = await svc
    .from("payment_gateways")
    .select("provider_code, credentials, is_active")
    .eq("provider_code", "mercadopago")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (gwErr || !gw) {
    return json({ error: "gateway mercadopago inativo/inexistente" }, 400);
  }
  const creds = gw.credentials as MpCreds;

  // Valida assinatura.
  const v = await mpValidateWebhook(
    creds?.webhook_secret,
    rawBody,
    signature,
    requestId,
  );
  if (!v.valid) {
    // Assinatura ruim: não é transitório — 401 para o MP parar de reenviar.
    return json({ error: v.error ?? "assinatura inválida" }, 401);
  }

  // MP só manda { type, data.id }. Resolve o status real.
  const dataId = v.data_id;
  if (!dataId) {
    return json({ ok: true, ignored: "sem data.id" }, 200);
  }
  if (!String(v.topic).startsWith("payment")) {
    // Outros tópicos (merchant_order etc.) — ignora, mas confirma recebimento.
    return json({ ok: true, ignored_topic: v.topic }, 200);
  }

  const st = await mpGetPaymentStatus(creds, dataId);
  const eventType = mpStatusToEvent(st.status);
  const providerEventId = String(
    (v.raw?.id as string | number | undefined) ?? `${dataId}:${st.status}`,
  );

  // Aplica com retry em 40001 (serialization_failure).
  let attempt = 0;
  // deno-lint-ignore no-explicit-any
  let lastErr: any = null;
  while (attempt < 4) {
    const { data, error } = await svc.rpc("pay_webhook_apply_event", {
      p_provider_name: "mercadopago",
      p_provider_payment_id: dataId,
      p_provider_event_id: providerEventId,
      p_event_type: eventType,
      p_raw_payload: v.raw ?? {},
      p_normalized_payload: { status: st.status, event_type: eventType },
    });
    if (!error) {
      return json({ ok: true, result: data }, 200);
    }
    lastErr = error;
    // 40001 = serialization_failure → retry. 23514 = transição inválida → não.
    const code = (error as { code?: string }).code;
    if (code !== "40001") break;
    attempt++;
    await sleep(150 * 2 ** attempt);
  }

  // 23514 (não-acionável/transição inválida) é definitivo: 200 p/ não reenviar.
  const code = (lastErr as { code?: string })?.code;
  if (code === "23514") {
    return json({ ok: false, terminal: lastErr?.message }, 200);
  }
  // Demais erros: transitório → 500 (MP reenvia).
  return json({ error: lastErr?.message ?? "falha ao aplicar" }, 500);
});
