/**
 * shc-executor — porta de entrada oficial do motor ASHC v2.1 (ETAPA 3/4).
 *
 * Único caminho de execução exposto ao painel: valida o chamador
 * (has_permission('shc:run'), que já embute is_admin()) e invoca a RPC
 * shc_run_module_audit (SECURITY DEFINER, EXECUTE restrito a service_role)
 * com service role. A execução é server-side e ATÔMICA no banco: fechar o
 * navegador, expirar a sessão ou abortar a request não deixa run órfão —
 * ou a transação inteira conclui, ou reverte por completo.
 *
 * FAIL CLOSED: payload inválido, auth ausente, permissão negada ou erro da
 * RPC ⇒ nenhuma escrita e resposta de erro explícita. Nunca aprova por
 * omissão (a própria RPC reprova execuções sem evidência).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

interface EvidenceCheck {
  name: string;
  status: "passed" | "warning" | "failed";
  severity?: string;
  agent?: string;
  evidence?: string;
}

interface ExecutorPayload {
  slug: string;
  evidence?: {
    version?: string;
    branch?: string;
    commit_hash?: string;
    executed_by?: string;
    evidence_summary?: string;
    tables?: string[];
    rpcs?: string[];
    checks?: EvidenceCheck[];
    agents?: string[];
  };
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 200);

function validate(body: unknown): { ok: true; payload: ExecutorPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "payload ausente" };
  const b = body as Record<string, unknown>;
  if (typeof b.slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(b.slug)) {
    return { ok: false, error: "slug inválido (esperado kebab-case)" };
  }
  const ev = (b.evidence ?? {}) as Record<string, unknown>;
  if (typeof ev !== "object" || Array.isArray(ev)) return { ok: false, error: "evidence inválido" };
  for (const k of ["version", "branch", "commit_hash", "executed_by", "evidence_summary"]) {
    if (ev[k] !== undefined && typeof ev[k] !== "string") return { ok: false, error: `evidence.${k} deve ser string` };
  }
  for (const k of ["tables", "rpcs", "agents"]) {
    if (ev[k] !== undefined && !isStringArray(ev[k])) return { ok: false, error: `evidence.${k} deve ser string[]` };
  }
  if (ev.checks !== undefined) {
    if (!Array.isArray(ev.checks)) return { ok: false, error: "evidence.checks deve ser array" };
    for (const c of ev.checks as Record<string, unknown>[]) {
      if (!c || typeof c.name !== "string" || !c.name.trim()) return { ok: false, error: "check sem name" };
      if (!["passed", "warning", "failed"].includes(String(c.status))) {
        return { ok: false, error: `check '${c.name}': status deve ser passed|warning|failed` };
      }
      if (c.evidence !== undefined && typeof c.evidence !== "string") {
        return { ok: false, error: `check '${c.name}': evidence deve ser string` };
      }
    }
  }
  return { ok: true, payload: { slug: b.slug, evidence: ev as ExecutorPayload["evidence"] } };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "método não suportado" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ ok: false, error: "env ausente" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, error: "não autenticado" }, 401);

  // Cliente no contexto do chamador: valida sessão e permissão via RLS/RBAC.
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ ok: false, error: "sessão inválida" }, 401);

  const { data: allowed, error: permErr } = await userClient.rpc("has_permission", {
    p_permission: "shc:run",
  });
  if (permErr) return json({ ok: false, error: `verificação de permissão falhou: ${permErr.message}` }, 500);
  if (allowed !== true) return json({ ok: false, error: "permissão negada (requer shc:run ou admin)" }, 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "JSON inválido" }, 400);
  }
  const v = validate(body);
  if (!v.ok) return json({ ok: false, error: v.error }, 422);

  const evidence = {
    ...v.payload.evidence,
    executed_by: v.payload.evidence?.executed_by ?? userData.user.email ?? userData.user.id,
  };

  const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await serviceClient.rpc("shc_run_module_audit", {
    p_slug: v.payload.slug,
    p_evidence: evidence,
  });
  if (error) return json({ ok: false, error: error.message }, 500);

  const result = data as { success?: boolean; error?: string } | null;
  if (!result?.success) {
    const notFound = typeof result?.error === "string" && result.error.startsWith("module_not_found");
    return json({ ok: false, ...result }, notFound ? 404 : 422);
  }
  return json({ ok: true, ...result });
});
