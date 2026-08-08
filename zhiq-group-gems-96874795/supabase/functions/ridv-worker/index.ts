/**
 * ridv-worker — motor da RIDV AI V2.0 (ORION-AI-02).
 *
 * Processa no SERVIDOR os anúncios presos em 'pending_ai_analysis':
 *   fila (ridv_worker_fila) → análise de texto com IA → veredito
 *   aplicado via ridv_worker_aplicar (aprovado entra no ar, bloqueado
 *   some, ambíguo vai à revisão manual) + auditoria + eventos ORION.
 *
 * É disparado por: trigger AFTER INSERT das tabelas de anúncio
 * (pg_net), cron de 5 min (backstop) e botão do painel /admin/ridv.
 * IA: consome o ORION AI Gateway (ORION-AI-00) — nunca chama
 * provedor direto; modelo/custo/auditoria são do gateway.
 * Fail-safe: IA indisponível (ex.: sem créditos) → manual_review.
 * Concorrência: ridv_worker_aplicar só transiciona quem ainda está
 * pendente — invocações simultâneas não duplicam decisão.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

type TextVerdict = {
  decisao: "aprovada" | "revisao" | "bloqueada";
  confianca: number;
  categoria_violacao: string;
  motivo: string;
};

async function analisar(payload: string): Promise<{ verdict: TextVerdict; modelo: string }> {
  // ORION AI Gateway decide provedor/modelo, aplica cache/rate/retry e audita
  const resp = await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/orion-ai-gateway`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      module: "ridv",
      task: "moderation",
      prompt_key: "ridv.moderacao.texto",  // Prompt Registry oficial (ORION CORE)
      prompt: `=== ANÚNCIO PARA ANÁLISE ===\n${payload}`,
      max_tokens: 350,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!data?.ok) throw new Error(String(data?.error || `gateway ${resp.status}`));

  const text: string = data.texto ?? "";
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  return {
    verdict: {
      decisao: ["aprovada", "revisao", "bloqueada"].includes(parsed.decisao) ? parsed.decisao : "revisao",
      confianca: Math.max(0, Math.min(100, Number(parsed.confianca) || 0)),
      categoria_violacao: String(parsed.categoria_violacao ?? "outro"),
      motivo: String(parsed.motivo ?? "").slice(0, 300),
    },
    modelo: `${data.provider}/${data.model}`,
  };
}

Deno.serve(async (req) => {
  const CORS = getCorsHeaders(req.headers.get("Origin"), {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: fila, error: filaErr } = await svc.rpc("ridv_worker_fila", { p_limite: 10 });
  if (filaErr) return json({ ok: false, error: filaErr.message }, 500);

  const itens = (fila || []) as Record<string, unknown>[];
  const resultados: Record<string, unknown>[] = [];
  let iaIndisponivel = false;   // 1ª falha de IA (ex.: sem créditos) evita chamadas inúteis no lote

  for (const item of itens) {
    const t0 = Date.now();
    let verdict: TextVerdict;
    let modelo = "orion-ai-gateway";

    if (iaIndisponivel) {
      verdict = {
        decisao: "revisao", confianca: 0, categoria_violacao: "indisponivel",
        motivo: "IA de moderação indisponível — encaminhado para revisão manual",
      };
    } else {
      try {
        const r = await analisar(
          `Categoria do Módulo: ${item.tabela}\nTítulo: ${item.titulo ?? ""}\n` +
          `Descrição: ${item.descricao ?? ""}\nCidade: ${item.cidade ?? "Não informada"}\n` +
          `Preço informado: ${item.preco ?? "Não informado"}`,
        );
        verdict = r.verdict;
        modelo = r.modelo;
      } catch (e) {
        iaIndisponivel = true;
        verdict = {
          decisao: "revisao", confianca: 0, categoria_violacao: "indisponivel",
          motivo: `IA de moderação indisponível (${String(e).slice(0, 120)}) — revisão manual`,
        };
      }
    }

    const status =
      verdict.decisao === "aprovada" && verdict.confianca >= 85 ? "approved"
      : verdict.decisao === "bloqueada" && verdict.confianca >= 85 ? "blocked"
      : "manual_review";

    const { data: aplicado, error: aplicarErr } = await svc.rpc("ridv_worker_aplicar", {
      p_tabela: item.tabela,
      p_id: item.id,
      p_status: status,
      p_verdict: verdict.decisao,
      p_confianca: verdict.confianca,
      p_motivo: verdict.motivo,
      p_categoria_violacao: verdict.categoria_violacao,
      p_tempo_ms: Date.now() - t0,
      p_modelo: modelo,
    });

    resultados.push({
      tabela: item.tabela, id: item.id, status,
      confianca: verdict.confianca,
      aplicado: aplicarErr ? `ERRO: ${aplicarErr.message}` : aplicado,
    });
  }

  return json({ ok: true, processados: resultados.length, ia_disponivel: !iaIndisponivel, resultados });
});
