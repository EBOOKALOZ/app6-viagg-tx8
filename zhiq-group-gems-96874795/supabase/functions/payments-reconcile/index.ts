/**
 * payments-reconcile — confirma uma ordem consultando o status REAL no Mercado
 * Pago, sem depender do webhook.
 *
 * Por que existe: o webhook do MP pode não chegar (sandbox instável, Verify JWT
 * ligado, secret divergente). Aí a ordem fica presa em waiting_payment e o saldo
 * nunca credita, mesmo o cliente tendo pago. Esta função é o "Já paguei /
 * verificar": pega a ordem, pergunta ao MP se o pagamento foi aprovado e, se
 * sim, aplica a confirmação via a MESMA RPC do webhook (idempotente — se o
 * webhook real chegar depois, vira no-op).
 *
 * Rota: POST /functions/v1/payments-reconcile   body: { order_id }
 *
 * O provider_payment_id da ordem pode ser:
 *  - numérico  → é o payment_id real (cartão tokenizado /v1/payments).
 *  - "<user>-<uuid>" → é o preference_id do Checkout Pro; resolve o payment real
 *    via /merchant_orders/search?preference_id=...
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { resolveMpGateway } from "../_shared/mp-gateway-resolver.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const MP_API = "https://api.mercadopago.com";

interface MpPayment {
  id?: string | number;
  status?: string;
  external_reference?: string;
}

function statusToEvent(s: string): string | null {
  switch (s) {
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
      return null;
  }
}

async function mpFetch(token: string, path: string) {
  const res = await fetch(`${MP_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text };
    }
  }
  return { ok: res.ok, status: res.status, body };
}

/** Escolhe o melhor pagamento: aprovado tem prioridade; senão o mais recente. */
function pickPayment(payments: MpPayment[]): MpPayment | null {
  if (!payments.length) return null;
  const approved = payments.find((p) => p.status === "approved");
  if (approved) return approved;
  return payments[payments.length - 1];
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req.headers.get("Origin"), {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(SUPABASE_URL, SERVICE);

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json({ error: "body inválido" }, 400);
  }
  const orderId = String(input.order_id ?? "");
  if (!orderId) return json({ error: "order_id obrigatório" }, 400);

  // 1. Ordem.
  const { data: order, error: ordErr } = await svc
    .from("pay_payment_orders")
    .select("id, status, provider_name, provider_payment_id, amount")
    .eq("id", orderId)
    .maybeSingle();
  if (ordErr) return json({ error: `ordem: ${ordErr.message}` }, 400);
  if (!order) return json({ error: "ordem não encontrada" }, 404);

  // Já confirmada → nada a fazer.
  if (order.status === "paid") {
    return json({ ok: true, order_id: orderId, status: "paid", already: true });
  }

  const pid = String(order.provider_payment_id ?? "");
  if (!pid) {
    return json({ ok: false, order_id: orderId, status: order.status, reason: "sem_provider_payment_id" });
  }

  // 2. Credenciais do gateway ativo (FASE 1: config por ambiente → env → legado).
  const resolved = await resolveMpGateway(svc);
  if (!resolved.ok) return json({ error: resolved.error }, 400);
  const token = resolved.gw.credentials.access_token!;

  // 3. Resolve o pagamento real no MP.
  let payment: MpPayment | null = null;

  // 3a. PREFERIR o payment_id passado (vem na URL de retorno do MP). Consultar
  //     /v1/payments/{id} direto é muito mais confiável que a busca por
  //     preference_id (que no sandbox costuma voltar vazia → "não encontrado").
  const directPid = String(input.payment_id ?? "").trim();
  if (/^\d+$/.test(directPid)) {
    const r = await mpFetch(token, `/v1/payments/${encodeURIComponent(directPid)}`);
    if (r.ok) payment = r.body as MpPayment;
  }

  // 3b. Fallback: usa o provider_payment_id guardado na ordem.
  if (!payment) {
    if (/^\d+$/.test(pid)) {
      // payment_id numérico direto.
      const r = await mpFetch(token, `/v1/payments/${encodeURIComponent(pid)}`);
      if (r.ok) payment = r.body as MpPayment;
    } else {
      // preference_id (Checkout Pro) → busca o merchant order e seus pagamentos.
      const r = await mpFetch(
        token,
        `/merchant_orders/search?preference_id=${encodeURIComponent(pid)}`,
      );
      if (r.ok) {
        const elements = (r.body.elements as Array<Record<string, unknown>>) ?? [];
        const allPayments: MpPayment[] = [];
        let extRef: string | undefined;
        for (const mo of elements) {
          extRef = extRef ?? (mo.external_reference as string | undefined);
          const pays = (mo.payments as MpPayment[]) ?? [];
          for (const p of pays) {
            allPayments.push({ ...p, external_reference: p.external_reference ?? extRef });
          }
        }
        payment = pickPayment(allPayments);
      }
    }
  }

  if (!payment || !payment.status) {
    return json({
      ok: false,
      order_id: orderId,
      status: order.status,
      reason: "pagamento_nao_encontrado_no_mp",
    });
  }

  const eventType = statusToEvent(String(payment.status));
  if (!eventType) {
    // Ainda pendente/em análise no MP — não muda nada.
    return json({
      ok: true,
      order_id: orderId,
      status: order.status,
      mp_status: payment.status,
      pending: true,
    });
  }

  // 4. Aplica via a MESMA RPC do webhook (idempotente).
  //    ⚠️ O fallback da pay_webhook_apply_event extrai o ORDER_ID da 2ª parte do
  //    external_reference ("<x>:<order_id>"). O external_reference REAL do MP traz
  //    o reference_id (id da compra), NÃO o order_id → não casava. Como aqui já
  //    sabemos o order_id, mandamos "order:<orderId>" p/ o fallback casar direto.
  const realPaymentId = String(payment.id ?? pid);
  const { data: applied, error: applyErr } = await svc.rpc("pay_webhook_apply_event", {
    p_provider_name: order.provider_name ?? "mercadopago",
    p_provider_payment_id: realPaymentId,
    p_provider_event_id: `reconcile:${orderId}:${payment.status}`,
    p_event_type: eventType,
    p_raw_payload: { id: realPaymentId, status: payment.status, source: "reconcile" },
    p_normalized_payload: { status: payment.status, event_type: eventType },
    p_external_reference: `order:${orderId}`,
  });
  if (applyErr) {
    return json({ error: `apply_event: ${applyErr.message}`, order_id: orderId }, 500);
  }

  // 5. Relê o status final da ordem.
  const { data: fresh } = await svc
    .from("pay_payment_orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();

  return json({
    ok: true,
    order_id: orderId,
    status: (fresh as { status?: string } | null)?.status ?? order.status,
    mp_status: payment.status,
    applied,
  });
});
