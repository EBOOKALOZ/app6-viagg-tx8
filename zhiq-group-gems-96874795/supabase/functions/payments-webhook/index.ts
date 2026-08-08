import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { mpGetPaymentStatus, mpStatusToEvent, mpValidateWebhook, type MpCreds } from "./mp.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req.headers.get("Origin"), {
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-signature, x-request-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  }
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const url = new URL(req.url);
  const seg = url.pathname.split("/").filter(Boolean);
  const provider = seg[seg.length - 1] === "payments-webhook" ? "mercadopago" : seg[seg.length - 1];
  if (provider !== "mercadopago") return json({ error: `provider ${provider} não suportado` }, 400);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(SUPABASE_URL, SERVICE);

  const rawBody = await req.text();
  const signature = req.headers.get("x-signature");
  const requestId = req.headers.get("x-request-id");

  const { data: gw, error: gwErr } = await svc
    .from("payment_gateways").select("provider_code, credentials, is_active")
    .eq("provider_code", "mercadopago").eq("is_active", true).limit(1).maybeSingle();
  if (gwErr || !gw) return json({ error: "gateway mercadopago inativo/inexistente" }, 400);
  const creds = gw.credentials as MpCreds;

  const v = await mpValidateWebhook(creds?.webhook_secret, rawBody, signature, requestId);
  if (!v.valid) return json({ error: v.error ?? "assinatura inválida" }, 401);

  const dataId = v.data_id;
  if (!dataId) return json({ ok: true, ignored: "sem data.id" }, 200);
  if (!String(v.topic).startsWith("payment")) return json({ ok: true, ignored_topic: v.topic }, 200);

  const st = await mpGetPaymentStatus(creds, dataId);
  const eventType = mpStatusToEvent(st.status);
  const extRef = (st.raw?.external_reference as string | undefined) ?? null;
  const providerEventId = String((v.raw?.id as string | number | undefined) ?? `${dataId}:${st.status}`);

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
      p_external_reference: extRef,
    });
    if (!error) return json({ ok: true, result: data }, 200);
    lastErr = error;
    const code = (error as { code?: string }).code;
    if (code !== "40001") break;
    attempt++;
    await sleep(150 * 2 ** attempt);
  }
  const code = (lastErr as { code?: string })?.code;
  if (code === "23514") return json({ ok: false, terminal: lastErr?.message }, 200);
  return json({ error: lastErr?.message ?? "falha ao aplicar" }, 500);
});
