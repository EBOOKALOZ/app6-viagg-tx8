/**
 * promotion-payment-webhook
 * Recebe notificações do Mercado Pago para pagamentos de promoção.
 * Quando aprovado:
 *  1. Atualiza promotion_purchases → status = "paid"
 *  2. Seta is_promoted = true em todos os anúncios publicados do anunciante
 *  3. Envia e-mail de recibo ao anunciante via Resend
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import {
  mpValidateSignatureHeader,
  resolveMpGateway,
} from "../_shared/mp-gateway-resolver.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
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

  const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
  const SERVICE       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_KEY    = Deno.env.get("RESEND_API_KEY") ?? "";
  const EMAIL_FROM    = Deno.env.get("EMAIL_FROM") ?? "Viagg-TX8 <noreply@viagg-tx8.com.br>";

  const svc = createClient(SUPABASE_URL, SERVICE);

  // Parse MP webhook (raw primeiro, p/ validação HMAC opcional)
  const rawBody = await req.text();
  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody); } catch { return json({ ok: true }); }

  // MP notifica com topic="payment" ou action="payment.updated"
  const topic      = (body.topic ?? body.type) as string | undefined;
  const resourceId = ((body.data as Record<string, unknown>)?.id ?? body.resource) as string | undefined;

  if (!resourceId || (topic !== "payment" && body.action !== "payment.updated")) {
    return json({ ok: true }); // ignora outros eventos
  }

  // Carrega credenciais MP (FASE 1: config por ambiente → env → legado).
  // Obs.: a query antiga usava colunas legadas provider/sandbox que não
  // existem no schema atual (provider_code/mode) — o resolver corrige isso.
  const resolved = await resolveMpGateway(svc);
  if (!resolved.ok) return json({ ok: false, error: "gateway not found" });

  const creds = resolved.gw.credentials as { access_token: string };

  // Validação HMAC oportunista: se houver webhook_secret configurado E o MP
  // mandou x-signature, valida; assinatura inválida → 401 (MP para de
  // reenviar). Sem secret/assinatura mantém o comportamento anterior — a
  // autenticidade continua garantida pelo GET /v1/payments abaixo.
  const signature = req.headers.get("x-signature");
  if (resolved.gw.credentials.webhook_secret && signature) {
    const urlDataId = new URL(req.url).searchParams.get("data.id");
    const v = await mpValidateSignatureHeader(
      resolved.gw.credentials.webhook_secret,
      rawBody,
      signature,
      req.headers.get("x-request-id"),
      urlDataId,
    );
    if (!v.valid) return json({ ok: false, error: v.error }, 401);
  }

  // Busca status real do pagamento no MP
  const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${resourceId}`, {
    headers: { Authorization: `Bearer ${creds.access_token}` },
  });
  if (!mpRes.ok) return json({ ok: false, error: "mp fetch failed" });

  const payment = await mpRes.json() as Record<string, unknown>;
  const extRef   = (payment.external_reference as string) ?? "";

  // Só processa referências de promoção
  if (!extRef.startsWith("promotion:")) return json({ ok: true });

  const purchaseId = extRef.replace("promotion:", "");
  const mpStatus   = (payment.status as string) ?? "";

  // Pagamento recusado/cancelado
  if (["rejected", "cancelled", "refunded", "charged_back"].includes(mpStatus)) {
    await svc.from("promotion_purchases" as never)
      .update({ status: "cancelled", mp_payment_id: String(payment.id ?? "") })
      .eq("id", purchaseId);
    return json({ ok: true });
  }

  if (mpStatus !== "approved") return json({ ok: true });

  // Busca dados da compra
  const { data: purchase } = await svc
    .from("promotion_purchases" as never)
    .select("*")
    .eq("id", purchaseId)
    .maybeSingle();

  if (!purchase || purchase.status === "paid") return json({ ok: true }); // idempotente

  const now      = new Date();
  const startsAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + (purchase.period_days as number) * 24 * 60 * 60 * 1000).toISOString();
  const expiresFormatted = new Date(expiresAt).toLocaleDateString("pt-BR");

  // 1. Atualiza purchase → paid
  await svc.from("promotion_purchases" as never).update({
    status:       "paid",
    mp_payment_id: String(payment.id ?? ""),
    starts_at:    startsAt,
    expires_at:   expiresAt,
  }).eq("id", purchaseId);

  // 2. Seta is_promoted = true em todos os anúncios publicados do anunciante no módulo
  const module = (purchase.listing_module as string) ?? "travel";
  if (module === "travel") {
    // VIAGENS: promove os pacotes publicados até o fim do período do pacote.
    // (is_promoted/promoted_until versionados em 20260723_travel_promocao_
    //  divulgacao_oficial.sql — a leitura respeita promoted_until > now().)
    await svc.from("travel_listings" as never)
      .update({ is_promoted: true, promoted_until: expiresAt })
      .eq("owner_user_id", purchase.advertiser_user_id)
      .eq("visibility_status", "published");
  } else if (module === "freight") {
    // FRETES: promove anúncios + rotas + veículos da frota do transportador
    // até o fim do período do pacote (Rota Premium / Veículo Premium / Empresa Premium).
    await svc.from("freight_listings" as never)
      .update({ is_promoted: true, promoted_until: expiresAt })
      .eq("owner_user_id", purchase.advertiser_user_id)
      .eq("visibility_status", "published");
    await svc.from("freight_routes" as never)
      .update({ is_promoted: true, promoted_until: expiresAt })
      .eq("owner_user_id", purchase.advertiser_user_id)
      .eq("is_active", true);
    await svc.from("freight_fleet_vehicles" as never)
      .update({ is_promoted: true, promoted_until: expiresAt })
      .eq("owner_user_id", purchase.advertiser_user_id)
      .eq("is_active", true);
  }
  // Outros módulos podem ser adicionados aqui

  // 3. Envia e-mail de recibo ao anunciante
  if (!RESEND_KEY) return json({ ok: true });

  // Obtém e-mail do anunciante
  const { data: authData } = await svc.auth.admin.getUserById(purchase.advertiser_user_id as string);
  const email = authData?.user?.email;
  if (!email) return json({ ok: true });

  const amount = Number(purchase.amount_brl).toFixed(2).replace(".", ",");
  const period = purchase.period_days as number;
  const pkgName = purchase.package_name as string;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [email],
      subject: `✅ Promoção ativada — ${pkgName}`,
      html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:sans-serif;">
  <div style="max-width:580px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

    <div style="background:linear-gradient(135deg,#FF6A00,#EE0979);padding:36px 32px;text-align:center;">
      <p style="margin:0 0 8px;color:rgba(255,255,255,.85);font-size:13px;letter-spacing:.08em;text-transform:uppercase;">Viagg-TX8 · Promoções</p>
      <h1 style="margin:0;color:#fff;font-size:26px;font-weight:900;">✅ Promoção Ativada!</h1>
      <p style="margin:10px 0 0;color:rgba(255,255,255,.9);font-size:15px;">Seu anúncio já está sendo impulsionado na plataforma.</p>
    </div>

    <div style="padding:32px;">
      <p style="color:#3f3f46;font-size:15px;margin:0 0 24px;">Olá! Confirmamos o pagamento do seu plano de promoção. Veja os detalhes:</p>

      <div style="background:#f9fafb;border:1px solid #e4e4e7;border-radius:12px;padding:20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;color:#71717a;font-size:14px;">Plano</td>
            <td style="padding:6px 0;color:#18181b;font-size:14px;font-weight:700;text-align:right;">${pkgName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#71717a;font-size:14px;">Período</td>
            <td style="padding:6px 0;color:#18181b;font-size:14px;font-weight:700;text-align:right;">${period} dias</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#71717a;font-size:14px;">Valor pago</td>
            <td style="padding:6px 0;color:#16a34a;font-size:16px;font-weight:900;text-align:right;">R$ ${amount}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#71717a;font-size:14px;">Válido até</td>
            <td style="padding:6px 0;color:#18181b;font-size:14px;font-weight:700;text-align:right;">${expiresFormatted}</td>
          </tr>
        </table>
      </div>

      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;margin-bottom:24px;">
        <p style="margin:0;color:#92400e;font-size:13px;">⚡ Seus anúncios publicados já aparecem com o selo <strong>Promovido</strong> e ganham prioridade nas buscas.</p>
      </div>

      <div style="text-align:center;margin:28px 0 8px;">
        <a href="https://viagg-tx8.com.br/viagens" style="display:inline-block;background:#FF6A00;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 30px;border-radius:10px;">Ver meus anúncios →</a>
      </div>
    </div>

    <div style="background:#f4f4f5;padding:16px;text-align:center;">
      <p style="margin:0;color:#a1a1aa;font-size:12px;">✈️ Viagg-TX8™ · viagg-tx8.com.br · Dúvidas? Fale via WhatsApp na plataforma.</p>
    </div>
  </div>
</body>
</html>`,
    }),
  });

  return json({ ok: true });
});
