/**
 * cyber-defense-engine — motor da ORION Cyber Defense AI (ORION-AI-40).
 *
 * Executa a deteccao INCREMENTAL de ameacas: chama a RPC oficial
 *   detect_security_threats() (SECURITY DEFINER), que varre apenas o
 *   que e NOVO desde o watermark (orion_cyber_state) — nunca reprocessa
 *   o historico completo — e registra eventos + alertas + estatisticas,
 *   sempre com evidencia. NAO executa acoes criticas: apenas detecta e
 *   recomenda; bloqueios seguem politica/aprovacao via RPCs proprias.
 *
 * Disparo: POST simples (manual/scheduler externo); o pg_cron
 *   'orion_cyber_tick' roda a cada 1 minuto no banco e garante
 *   continuidade mesmo sem a edge. Idempotente: rodar N vezes no mesmo
 *   minuto nao duplica eventos (dedupe_key/ON CONFLICT).
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
    const { data, error } = await supabase.rpc("detect_security_threats", { p_trace: trace });
    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, engine: "cyber-defense-engine", resultado: data });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
