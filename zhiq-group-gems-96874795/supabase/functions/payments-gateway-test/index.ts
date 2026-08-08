/**
 * payments-gateway-test — valida a conexão com o Mercado Pago (FASE 1).
 *
 * Admin-only (verify_jwt=false no config.toml, então a guarda é manual:
 * exige Authorization + mp_is_admin()).
 *
 * Body: { environment?: "sandbox" | "production", gateway_id?: string }
 *  - environment ausente → usa o ambiente ativo (mp_gateway_config) ou o
 *    legado payment_gateways (compat com a tela antiga, que manda gateway_id).
 *
 * Relatório de checks:
 *  - credentials  → access_token presente + tipo (TEST-/APP_USR-)
 *  - environment  → coerência token × ambiente (TEST- em produção = alerta)
 *  - auth         → GET /users/me (token válido, conta, site)
 *  - user_id      → confere com o User ID configurado (se houver)
 *  - permissions  → GET /v1/payment_methods (escopo de pagamentos)
 *  - webhook      → URL configurada + alcançável + secret presente
 *
 * Resultado gravado na auditoria via mp_log_connection_test.
 * Mantém no topo os campos legados (ok, nickname, token_kind, site, mode)
 * que a tela antiga AdminMercadoPagoSecrets espera.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { resolveMpGateway } from "../_shared/mp-gateway-resolver.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const MP_API = "https://api.mercadopago.com";

interface Check {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

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
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, error: "Authorization obrigatório" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const svc = createClient(SUPABASE_URL, SERVICE);

  // Guarda de admin.
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ ok: false, error: "Não autenticado" }, 401);
  let isAdmin = false;
  try {
    const { data } = await userClient.rpc("mp_is_admin");
    isAdmin = data === true;
  } catch (_e) { /* RPC ausente → fallback abaixo */ }
  if (!isAdmin) {
    const { data: roleRow } = await svc
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    isAdmin = !!roleRow;
  }
  if (!isAdmin) return json({ ok: false, error: "Apenas administradores" }, 403);

  let input: Record<string, unknown> = {};
  try { input = await req.json(); } catch { /* body opcional */ }
  const reqEnv = input.environment === "production" || input.environment === "sandbox"
    ? input.environment as "sandbox" | "production"
    : undefined;

  const resolved = await resolveMpGateway(svc, { environment: reqEnv });
  if (!resolved.ok) {
    await svc.rpc("mp_log_connection_test", {
      p_environment: reqEnv ?? null,
      p_success: false,
      p_details: { error: resolved.error },
    }).then(() => {}, () => {});
    return json({ ok: false, error: resolved.error, checks: [] });
  }
  const gw = resolved.gw;
  const creds = gw.credentials;
  const checks: Check[] = [];

  // 1. Credenciais presentes + tipo do token.
  const token = creds.access_token ?? "";
  const tokenKind = token.startsWith("TEST-")
    ? "TEST"
    : token.startsWith("APP_USR-")
    ? "APP_USR"
    : "desconhecido";
  checks.push({
    id: "credentials",
    label: "Access Token",
    status: token ? "pass" : "fail",
    detail: token
      ? `presente (${tokenKind}) · fonte: ${gw.source}`
      : "access_token ausente",
  });

  // 2. Coerência token × ambiente.
  if (gw.environment === "production" && tokenKind === "TEST") {
    checks.push({
      id: "environment",
      label: "Ambiente",
      status: "fail",
      detail: "Ambiente PRODUÇÃO com token TEST- (sandbox). Cobranças reais falharão.",
    });
  } else if (gw.environment === "sandbox" && tokenKind === "APP_USR") {
    checks.push({
      id: "environment",
      label: "Ambiente",
      status: "warn",
      detail: "Ambiente SANDBOX com token APP_USR-. Se não for de conta de teste, há risco de cobrança REAL.",
    });
  } else {
    checks.push({
      id: "environment",
      label: "Ambiente",
      status: "pass",
      detail: `${gw.environment} com token ${tokenKind}`,
    });
  }

  // 3. Autenticação: GET /users/me.
  let nickname: string | null = null;
  let site: string | null = null;
  let mpUserId: string | null = null;
  try {
    const r = await fetch(`${MP_API}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await r.json().catch(() => ({}));
    if (r.ok) {
      nickname = (body.nickname as string) ?? null;
      site = (body.site_id as string) ?? null;
      mpUserId = body.id != null ? String(body.id) : null;
      checks.push({
        id: "auth",
        label: "Autenticação (GET /users/me)",
        status: "pass",
        detail: `conta ${nickname ?? "?"} · site ${site ?? "?"} · user_id ${mpUserId ?? "?"}`,
      });
    } else {
      checks.push({
        id: "auth",
        label: "Autenticação (GET /users/me)",
        status: "fail",
        detail: `HTTP ${r.status}: ${JSON.stringify(body?.message ?? body).slice(0, 200)}`,
      });
    }
  } catch (e) {
    checks.push({
      id: "auth",
      label: "Autenticação (GET /users/me)",
      status: "fail",
      detail: `API MP inacessível: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  // 4. User ID configurado confere com a conta do token.
  if (creds.user_id) {
    checks.push({
      id: "user_id",
      label: "User ID",
      status: mpUserId && creds.user_id === mpUserId ? "pass" : "warn",
      detail: mpUserId
        ? (creds.user_id === mpUserId
          ? `confere (${mpUserId})`
          : `configurado ${creds.user_id} ≠ conta do token ${mpUserId}`)
        : "não foi possível confirmar (auth falhou)",
    });
  }

  // 5. Permissões: GET /v1/payment_methods.
  try {
    const r = await fetch(`${MP_API}/v1/payment_methods`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await r.json().catch(() => []);
    checks.push({
      id: "permissions",
      label: "Permissões (payment_methods)",
      status: r.ok ? "pass" : "fail",
      detail: r.ok
        ? `${Array.isArray(body) ? body.length : 0} métodos de pagamento disponíveis`
        : `HTTP ${r.status}`,
    });
  } catch (e) {
    checks.push({
      id: "permissions",
      label: "Permissões (payment_methods)",
      status: "fail",
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // 6. Webhook: URL configurada, alcançável, secret presente.
  if (gw.webhook_url) {
    let reachable = false;
    let detail = gw.webhook_url;
    try {
      const r = await fetch(gw.webhook_url, { method: "OPTIONS" });
      reachable = r.status < 500;
      detail += ` · HTTP ${r.status}`;
    } catch (e) {
      detail += ` · inalcançável: ${e instanceof Error ? e.message : String(e)}`;
    }
    checks.push({
      id: "webhook_url",
      label: "Webhook URL",
      status: reachable ? "pass" : "fail",
      detail,
    });
  } else {
    checks.push({
      id: "webhook_url",
      label: "Webhook URL",
      status: "warn",
      detail: "não configurada — pagamentos assíncronos (PIX/Checkout Pro) não confirmarão sozinhos",
    });
  }
  checks.push({
    id: "webhook_secret",
    label: "Webhook Secret",
    status: creds.webhook_secret ? "pass" : "warn",
    detail: creds.webhook_secret
      ? "presente (HMAC ativo no payments-webhook)"
      : "ausente — payments-webhook rejeitará notificações",
  });

  // 7. Campos complementares (informativo).
  const optional: string[] = [];
  if (!creds.public_key) optional.push("public_key");
  if (!creds.client_id) optional.push("client_id");
  if (!creds.client_secret) optional.push("client_secret");
  if (!creds.application_id) optional.push("application_id");
  if (optional.length) {
    checks.push({
      id: "optional_fields",
      label: "Campos complementares",
      status: "warn",
      detail: `ausentes: ${optional.join(", ")}`,
    });
  }

  const failed = checks.filter((c) => c.status === "fail");
  const ok = failed.length === 0;

  // Auditoria (best-effort — não derruba o teste se a migration não rodou).
  await svc.rpc("mp_log_connection_test", {
    p_environment: gw.environment,
    p_success: ok,
    p_details: {
      source: gw.source,
      token_kind: tokenKind,
      account: nickname,
      site,
      checks: checks.map((c) => ({ id: c.id, status: c.status })),
      tested_by: user.id,
    },
  }).then(() => {}, () => {});

  return json({
    // campos legados (tela AdminMercadoPagoSecrets)
    ok,
    nickname,
    site,
    token_kind: tokenKind,
    mode: gw.environment,
    warning: ok ? undefined : failed.map((c) => c.detail).join(" | "),
    // relatório detalhado (tela nova)
    environment: gw.environment,
    source: gw.source,
    checks,
    tested_at: new Date().toISOString(),
  });
});
