/**
 * payments-charge — cria a ordem de pagamento e gera a cobrança no gateway.
 *
 * Por que Edge Function: o charge() precisa do access_token do gateway, que a
 * Fase 1 deliberadamente NÃO expõe ao browser. Aqui as credenciais são lidas
 * do banco com service_role e nunca trafegam pro cliente.
 *
 * Fluxo:
 *  1. client do usuário (JWT) → pay_get_or_create_account (conta destino)
 *  2. client do usuário (JWT) → pay_create_payment_order (status pending)
 *  3. service_role → lê gateway ativo + credenciais → mpCharge()
 *  4. client do usuário (JWT) → pay_set_order_provider (→ waiting_payment)
 *  5. responde QR/copia-e-cola ou checkout_url
 *
 * Em falha no charge: marca a ordem pending→failed (ator system) p/ não pendurar.
 *
 * Unidades: client manda amount_cents (convenção da UI). DB/MP usam reais.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { mpCharge, mpChargeCard, type MpCreds, type MpCardInput } from "./mp.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Authorization obrigatório" }, 401);

  // Client com o JWT do usuário → auth.uid() funciona nas RPCs autenticadas.
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  // Client service_role → lê credenciais do gateway (RLS admin-only).
  const svc = createClient(SUPABASE_URL, SERVICE);

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json({ error: "body inválido" }, 400);
  }

  const amountCents = Number(input.amount_cents);
  const method = String(input.method ?? "pix");
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return json({ error: "amount_cents inválido" }, 400);
  }
  const amountBrl = Math.round(amountCents) / 100;
  const ownerType = String(input.payer_owner_type ?? "merchant_store");
  const ownerId = (input.payer_owner_id as string) ?? null;
  const accountType = String(input.account_type ?? "merchant_wallet");
  const idempotencyKey = String(
    input.idempotency_key ?? crypto.randomUUID(),
  );

  try {
    // 1. Conta destino.
    const { data: acct, error: acctErr } = await userClient.rpc(
      "pay_get_or_create_account",
      {
        p_owner_type: ownerType,
        p_owner_id: ownerId,
        p_account_type: accountType,
        p_metadata: {},
      },
    );
    if (acctErr) return json({ error: `conta: ${acctErr.message}` }, 400);
    const targetAccountId = (acct as { id: string }).id;

    // 2. Gateway ativo + credenciais (service_role).
    const { data: gw, error: gwErr } = await svc
      .from("payment_gateways")
      .select("provider_code, mode, credentials, config, is_active")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (gwErr || !gw) {
      return json({ error: "nenhum gateway ativo" }, 400);
    }
    if (gw.provider_code !== "mercadopago") {
      return json({
        error: `gateway ativo é ${gw.provider_code}; esta função só faz mercadopago`,
      }, 400);
    }
    const creds = gw.credentials as MpCreds;
    if (!creds?.access_token) {
      return json({ error: "gateway sem access_token" }, 400);
    }

    // 3. Cria a ordem (pending).
    const { data: order, error: orderErr } = await userClient.rpc(
      "pay_create_payment_order",
      {
        p_payer_owner_type: ownerType,
        p_payer_owner_id: ownerId,
        p_target_account_id: targetAccountId,
        p_amount: amountBrl,
        p_provider_name: "mercadopago",
        p_idempotency_key: idempotencyKey,
        p_product_type: input.product_type ?? null,
        p_product_id: input.product_id ?? null,
        p_product_snapshot: input.product_snapshot ?? {},
        p_expires_at: null,
        p_metadata: input.metadata ?? {},
      },
    );
    if (orderErr) return json({ error: `ordem: ${orderErr.message}` }, 400);
    const orderRow = order as { id: string; status: string };

    // 4. Charge no MP.
    const reference = `${input.reference_type ?? "recharge"}:${
      input.reference_id ?? orderRow.id
    }`;
    const notificationUrl = (gw.config as Record<string, unknown>)
      ?.webhook_url as string | undefined;

    // 4a. Cartão tokenizado pelo Payment Brick → cobra direto via /v1/payments.
    //     (caso contrário, mantém o fluxo atual: PIX ou Checkout Pro hospedado.)
    const card = (input.card ?? {}) as Record<string, unknown>;
    const cardToken = typeof card.token === "string" ? card.token : "";
    const isCardToken =
      (method === "credit_card" || method === "debit_card") &&
      cardToken.length > 0;

    const charge = isCardToken
      ? await mpChargeCard(creds, {
        amount_brl: amountBrl,
        description: String(input.description ?? "Pagamento"),
        reference,
        idempotency_key: idempotencyKey,
        notification_url: notificationUrl,
        token: cardToken,
        payment_method_id: String(card.payment_method_id ?? ""),
        installments: Number(card.installments ?? 1),
        issuer_id: card.issuer_id ? String(card.issuer_id) : undefined,
        payer: (card.payer as MpCardInput["payer"]) ??
          { email: input.payer_email as string | undefined },
      })
      : await mpCharge(creds, {
        method: method as "pix" | "credit_card" | "debit_card" | "boleto",
        amount_brl: amountBrl,
        description: String(input.description ?? "Recarga de saldo"),
        reference,
        idempotency_key: idempotencyKey,
        payer_email: input.payer_email as string | undefined,
        notification_url: notificationUrl,
        // Alguns fluxos mandam back_url no nível raiz, outros dentro de metadata.
        back_url: (input.back_url ?? (input.metadata as Record<string, unknown> | undefined)?.back_url) as string | undefined,
        sandbox: gw.mode === "sandbox",
      });

    if (!charge.ok || !charge.provider_payment_id) {
      // Loga o motivo real do MP p/ diagnóstico (aparece nos logs da função).
      console.error("payments-charge: cobranca falhou no MP:", JSON.stringify({
        method,
        isCardToken,
        amount_brl: amountBrl,
        mp_error: charge.error,
        provider_payment_id: charge.provider_payment_id ?? null,
      }));
      // Não pendura a ordem.
      await userClient.rpc("pay_update_payment_order_status", {
        p_order_id: orderRow.id,
        p_new_status: "failed",
        p_actor_role: "system",
        p_expected_from_status: "pending",
        p_reason: charge.error ?? "charge falhou",
        p_metadata: {},
      });
      return json({ error: charge.error ?? "charge falhou", order_id: orderRow.id }, 502);
    }

    // 5. Vincula provider + pending → waiting_payment.
    const { error: setErr } = await userClient.rpc("pay_set_order_provider", {
      p_order_id: orderRow.id,
      p_provider_name: "mercadopago",
      p_provider_payment_id: charge.provider_payment_id,
      p_provider_checkout_url: charge.checkout_url ?? null,
      p_metadata: { mp_status: charge.status },
    });
    if (setErr) {
      return json({
        error: `set_provider: ${setErr.message}`,
        order_id: orderRow.id,
      }, 500);
    }

    // 5b. Cartão tokenizado: o /v1/payments processa NA HORA (status já volta
    //     approved/rejected). Não dá pra depender do webhook p/ creditar — em
    //     sandbox/sem webhook configurado a ordem ficaria presa em
    //     waiting_payment e o saldo nunca apareceria. Então, quando o cartão
    //     volta `approved`, aplicamos a confirmação aqui mesmo via a MESMA RPC
    //     do webhook (idempotente: o webhook real depois vira no-op).
    let syncedPaid = false;
    if (isCardToken && charge.status === "approved") {
      const { error: applyErr } = await svc.rpc("pay_webhook_apply_event", {
        p_provider_name: "mercadopago",
        p_provider_payment_id: charge.provider_payment_id,
        p_provider_event_id: `sync:${charge.provider_payment_id}:approved`,
        p_event_type: "charge.paid",
        p_raw_payload: {
          id: charge.provider_payment_id,
          status: "approved",
          source: "charge_sync",
        },
        p_normalized_payload: { status: "approved", event_type: "charge.paid" },
        p_external_reference: reference,
      });
      if (applyErr) {
        // Não falha a cobrança (o cartão JÁ foi aprovado no MP). Loga p/ o
        // webhook reconciliar; o cliente vê o status pelo poll.
        console.error("sync apply_event falhou:", applyErr.message);
      } else {
        syncedPaid = true;
      }
    }

    return json({
      ok: true,
      order_id: orderRow.id,
      status: syncedPaid ? "paid" : "waiting_payment",
      provider_payment_id: charge.provider_payment_id,
      // status cru do MP (cartão volta approved/rejected/in_process na hora)
      provider_status: charge.status ?? null,
      status_detail: (charge as { status_detail?: string }).status_detail ?? null,
      pix_qr_base64: charge.pix_qr_base64 ?? null,
      pix_copy_paste: charge.pix_copy_paste ?? null,
      checkout_url: charge.checkout_url ?? null,
      expires_at: charge.expires_at ?? null,
    });
  } catch (e) {
    return json({
      error: e instanceof Error ? e.message : "erro interno",
    }, 500);
  }
});
