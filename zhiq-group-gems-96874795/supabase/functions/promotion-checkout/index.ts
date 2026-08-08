/**
 * promotion-checkout
 * Cria preferência de Checkout Pro no Mercado Pago para compra de pacote de promoção.
 * Armazena o registro em promotion_purchases (status=pending).
 * Retorna checkout_url para redirecionar o anunciante.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { resolveMpGateway } from "../_shared/mp-gateway-resolver.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req.headers.get("Origin"), {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  const ANON        = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Authorization obrigatório" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const svc = createClient(SUPABASE_URL, SERVICE);

  // Obtém usuário autenticado
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Não autenticado" }, 401);

  // Parse body
  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json({ error: "body inválido" }, 400); }

  const {
    listing_module = "travel",
    package_id,
    package_name,
    period_days,
    amount_brl,
  } = input as {
    listing_module?: string;
    package_id?: string;
    package_name: string;
    period_days: number;
    amount_brl: number;
  };

  if (!package_name || !period_days || !amount_brl) {
    return json({ error: "package_name, period_days e amount_brl são obrigatórios" }, 400);
  }

  // Carrega credenciais do gateway ativo (mesmo padrão de payments-charge:
  // FASE 1 — config por ambiente → env vars → legado payment_gateways)
  const resolved = await resolveMpGateway(svc);
  if (!resolved.ok) return json({ error: "Gateway MP não configurado" }, 500);

  const creds = resolved.gw.credentials as { access_token: string };
  const sandbox = resolved.gw.sandbox;

  // Cria registro de compra (pending)
  const { data: purchase, error: purchaseErr } = await svc
    .from("promotion_purchases")
    .insert({
      advertiser_user_id: user.id,
      listing_module,
      package_id: package_id ?? null,
      package_name,
      period_days,
      amount_brl,
      status: "pending",
    })
    .select("id")
    .single();

  if (purchaseErr || !purchase) {
    console.error("[promotion-checkout] insert purchase:", purchaseErr);
    return json({ error: "Erro ao registrar compra" }, 500);
  }

  const purchaseId     = purchase.id as string;
  const externalRef    = `promotion:${purchaseId}`;
  const notificationUrl = `${SUPABASE_URL}/functions/v1/promotion-payment-webhook`;
  const backUrl        = "https://viagg-tx8.com.br/viagens";

  // Cria preferência Checkout Pro no MP
  const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": purchaseId,
    },
    body: JSON.stringify({
      items: [{
        title: `${package_name} — ${period_days} dias de promoção`,
        quantity: 1,
        unit_price: Number(Number(amount_brl).toFixed(2)),
        currency_id: "BRL",
      }],
      external_reference: externalRef,
      payer: { email: user.email },
      notification_url: notificationUrl,
      back_urls: {
        success: backUrl,
        failure: backUrl,
        pending: backUrl,
      },
      auto_return: "approved",
    }),
  });

  if (!mpRes.ok) {
    const errText = await mpRes.text();
    console.error("[promotion-checkout] MP error:", mpRes.status, errText);
    return json({ error: `Erro Mercado Pago: ${mpRes.status}` }, 500);
  }

  const mpData = await mpRes.json() as Record<string, unknown>;
  const checkoutUrl = sandbox
    ? (mpData.sandbox_init_point as string) ?? (mpData.init_point as string)
    : (mpData.init_point as string);

  // Salva preference_id
  await svc
    .from("promotion_purchases")
    .update({ mp_preference_id: String(mpData.id ?? "") })
    .eq("id", purchaseId);

  return json({ checkout_url: checkoutUrl, purchase_id: purchaseId });
});
