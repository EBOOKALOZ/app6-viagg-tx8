/**
 * security-audit-engine — motor da ORION Security Audit AI (ORION-AI-44).
 *
 * Executa a auditoria de seguranca INCREMENTAL: chama a RPC oficial
 *   run_security_audit() (SECURITY DEFINER), que audita o estado ATUAL da
 *   plataforma (RLS, grants, funcoes, cron, identidade, postura AI-40/41)
 *   com upsert por categoria/dia — nunca reprocessa historico. Toda
 *   conclusao tem evidencia real; lacunas sao declaradas. NUNCA modifica
 *   o ambiente: observa, evidencia e recomenda.
 *
 * Disparo: POST simples (manual/scheduler externo); o pg_cron
 *   'orion_secaudit_tick' roda a cada 15 minutos no banco e garante
 *   continuidade mesmo sem a edge. Idempotente: rodar N vezes no mesmo
 *   dia atualiza os mesmos registros (dedupe por categoria/dia e por
 *   finding), sem duplicar.
 *
 * Seguranca: usa a service role apenas para invocar a RPC guardada;
 *   nao expoe dados; toda escrita passa pelos guards do banco.
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ ok: false, error: "env ausente" }, 500);

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    const trace = `edge_${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 12)}`;
    const { data, error } = await supabase.rpc("run_security_audit", { p_trace: trace });
    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, engine: "security-audit-engine", resultado: data });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
