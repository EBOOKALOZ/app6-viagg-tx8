/**
 * /admin/orion-execution — ORION Execution Orchestrator (ORION-AI-08)
 *
 * Executor de workflows autorizados: recebe ações aprovadas dos módulos
 * superiores e as executa chamando SOMENTE as RPCs oficiais (nunca
 * lógica paralela). Aprovação humana configurável, dependências entre
 * workflows, idempotência, retry→DLQ, rollback, instrumentação AI-09.
 * Narrativas via Gateway v3 + Prompt Registry.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import {
  Workflow, Loader2, Play, CheckCircle2, XCircle, RotateCcw, Zap, Sparkles, ListChecks, AlertOctagon,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const ST: Record<string, string> = {
  aguardando_aprovacao: "bg-purple-100 text-purple-700", agendada: "bg-sky-100 text-sky-700",
  em_execucao: "bg-amber-100 text-amber-700", concluida: "bg-emerald-100 text-emerald-700",
  falha: "bg-orange-100 text-orange-700", dlq: "bg-red-100 text-red-700", cancelada: "bg-zinc-100 text-zinc-500",
};
const TIPO_LABEL: Record<string, string> = {
  iniciar_campanha: "Iniciar campanha", enviar_pacote_motor: "Enviar pacote ao Motor",
  executar_divulgacao: "Executar divulgação (Dispatcher)", notificacao: "Notificação",
};

type Aba = "central" | "fila" | "historico" | "falhas";

export default function AdminOrionExecution() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("central");
  const [ocupado, setOcupado] = useState("");
  const [narrativa, setNarrativa] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-execution"], queryFn: () => rpc("execution_dashboard"), refetchInterval: 20000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["orion-execution"] });

  const score = dash?.score || {};
  const tempos = score.tempos?.por_status || {};
  const fila = (dash?.fila || []) as any[];

  const acao = async (id: string, fn: () => Promise<any>) => {
    setOcupado(id);
    try { await fn(); refresh(); }
    catch (e: any) { alert("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const gerarPropostas = () => acao("gerar", async () => {
    const r = await rpc("execution_gerar");
    alert(`Orquestrador propôs ${r.propostas} workflow(s) das fontes oficiais (aguardando aprovação).`);
  });
  const rodar = () => acao("run", async () => {
    const r = await rpc("execution_run", { p_limite: 10 });
    alert(`Executor: ${r.processadas} workflow(s) processado(s).`);
  });

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado("narr"); setNarrativa("");
    try {
      const ctx = await rpc("execution_summary");
      const r = await orionAiText("execution", `Tipo: ${tipo}\nEstado real: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 500 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(""); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        <div className="rounded-3xl bg-gradient-to-r from-[#0b132b] via-[#1c2541] to-[#0b132b] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Workflow className="h-8 w-8 text-cyan-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Execution Orchestrator</h1>
              <p className="text-sm text-cyan-200/80">
                ORION-AI-08 · executa workflows autorizados via RPCs oficiais · aprovação humana + dependências
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={gerarPropostas} disabled={!!ocupado}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-black text-white ring-1 ring-white/20 hover:bg-white/20 disabled:opacity-50">
                {ocupado === "gerar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
                Propor
              </button>
              <button onClick={rodar} disabled={!!ocupado}
                className="flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-[#0b132b] hover:brightness-110 disabled:opacity-50">
                {ocupado === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Executar fila
              </button>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200/70">Execution Score</p>
              <p className="text-3xl font-black">{score.execution_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[["Aguard. aprovação", tempos.aguardando_aprovacao], ["Agendadas", tempos.agendada],
              ["Em execução", tempos.em_execucao], ["Concluídas", tempos.concluida],
              ["Falhas", tempos.falha], ["DLQ", tempos.dlq],
              ["Taxa sucesso", score.taxa_sucesso_pct != null ? `${score.taxa_sucesso_pct}%` : "—"]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-cyan-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["central", Sparkles, "Central"], ["fila", ListChecks, "Fila & Aprovações"],
             ["historico", CheckCircle2, "Histórico"], ["falhas", AlertOctagon, "Falhas & DLQ"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#1c2541] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-cyan-500" /></div>}

        {/* CENTRAL */}
        {aba === "central" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["execution.summary", "Resumo"], ["execution.daily", "Diário"],
                  ["execution.performance", "Performance"], ["execution.insights", "Insights"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={!!ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-50">
                    {ocupado === "narr" ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-sm text-zinc-800">{narrativa}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm text-xs text-zinc-500">
              <p><b>Tempos:</b> médio {score.tempos?.tempo_medio_ms ?? "—"}ms · máx {score.tempos?.tempo_max_ms ?? "—"}ms · mín {score.tempos?.tempo_min_ms ?? "—"}ms</p>
              <p className="mt-1"><b>Aprovação automática:</b> {String(dash?.auto_aprovar)} · <b>fórmula do score:</b> {score.formula}</p>
              <p className="mt-1 text-zinc-400">
                Workflows suportados hoje: iniciar/agendar campanha, enviar pacote ao Motor, executar divulgação (Dispatcher),
                notificação. Postagem física no WhatsApp = worker GLM humano/integração (sem lógica paralela).
              </p>
            </div>
          </div>
        )}

        {/* FILA */}
        {aba === "fila" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!fila.filter((e) => !["concluida", "cancelada"].includes(e.status)).length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">
                🎉 Nenhum workflow pendente. Clique em "Propor" para o orquestrador buscar ações nas fontes oficiais.
              </div>
            ) : fila.filter((e) => !["concluida", "cancelada"].includes(e.status)).map((e: any) => (
              <div key={e.id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-black text-white">P{e.prioridade}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${ST[e.status]}`}>{e.status.replaceAll("_", " ")}</span>
                  <p className="min-w-0 flex-1 font-bold">{TIPO_LABEL[e.tipo] || e.tipo}</p>
                  <span className="text-[10px] text-zinc-400">{e.origem}</span>
                  {e.status === "aguardando_aprovacao" && (
                    <>
                      <button onClick={() => acao(e.id, () => rpc("execution_aprovar", { p_id: e.id, p_acao: "aprovar" }))}
                        disabled={ocupado === e.id}
                        className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar
                      </button>
                      <button onClick={() => acao(e.id, () => rpc("execution_aprovar", { p_id: e.id, p_acao: "cancelar" }))}
                        disabled={ocupado === e.id}
                        className="flex items-center gap-1 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                        <XCircle className="h-3.5 w-3.5" /> Recusar
                      </button>
                    </>
                  )}
                  {["agendada", "falha"].includes(e.status) && (
                    <button onClick={() => acao(e.id, () => rpc("execution_run", { p_limite: 3 }))} disabled={ocupado === e.id}
                      className="flex items-center gap-1 rounded-xl bg-cyan-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                      <Play className="h-3.5 w-3.5" /> Executar
                    </button>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  trace {String(e.trace_id).slice(0, 8)} · agendado {new Date(e.agendado_para).toLocaleString("pt-BR")}
                  {e.dependencias?.length > 0 && ` · depende de ${e.dependencias.length} workflow(s)`}
                  {e.tentativas > 0 && ` · tentativas ${e.tentativas}`}
                  {e.rollback_acao && ` · rollback: ${e.rollback_acao}`}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* HISTÓRICO */}
        {aba === "historico" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            {!((dash?.historico || []) as any[]).length ? (
              <p className="p-6 text-center text-sm text-zinc-400">Nenhum workflow concluído ainda.</p>
            ) : ((dash?.historico || []) as any[]).map((h: any) => (
              <div key={h.id} className="mb-2 rounded-2xl bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${ST[h.status]}`}>{h.status}</span>
                  <p className="min-w-0 flex-1 text-sm font-bold text-zinc-800">{TIPO_LABEL[h.tipo] || h.tipo}</p>
                  {h.duracao_ms != null && <span className="text-[10px] text-zinc-400">{h.duracao_ms}ms</span>}
                  {h.status === "concluida" && h.tipo === "iniciar_campanha" && (
                    <button onClick={() => acao(h.id, () => rpc("execution_rollback", { p_id: h.id }))}
                      disabled={ocupado === h.id}
                      className="flex items-center gap-1 rounded-xl bg-zinc-700 px-2.5 py-1 text-[11px] font-black text-white disabled:opacity-50">
                      <RotateCcw className="h-3 w-3" /> Rollback
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-zinc-400">
                  {h.origem} · trace {String(h.trace_id).slice(0, 8)} · {h.concluido_em && new Date(h.concluido_em).toLocaleString("pt-BR")}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* FALHAS */}
        {aba === "falhas" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <button onClick={() => narrar("execution.failure", "falhas")} disabled={!!ocupado}
              className="mb-3 flex items-center gap-1 rounded-xl bg-[#1c2541] px-3 py-2 text-xs font-black text-white disabled:opacity-50">
              <Sparkles className="h-3.5 w-3.5" /> Analisar falhas (IA)
            </button>
            {narrativa && aba === "falhas" && <p className="mb-3 whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-sm text-zinc-800">{narrativa}</p>}
            {!((dash?.falhas || []) as any[]).length ? (
              <p className="p-6 text-center text-sm text-zinc-400">✅ Nenhuma falha ou item em DLQ.</p>
            ) : ((dash?.falhas || []) as any[]).map((f: any) => (
              <div key={f.id} className="mb-2 rounded-2xl border border-zinc-100 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${ST[f.status]}`}>{f.status}</span>
                  <p className="min-w-0 flex-1 text-sm font-bold text-zinc-800">{TIPO_LABEL[f.tipo] || f.tipo}</p>
                  <span className="text-[10px] text-zinc-400">tentativas {f.tentativas}</span>
                </div>
                <p className="mt-1 text-[11px] text-red-500">{f.erro}</p>
                {f.proxima_tentativa && <p className="text-[10px] text-zinc-400">próxima tentativa: {new Date(f.proxima_tentativa).toLocaleString("pt-BR")}</p>}
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Execution Orchestrator v1.0 · ORION-AI-08 · workflows autorizados via RPCs oficiais · dependências ·
          idempotência · retry→DLQ · rollback · instrumenta o AI-09 · aprovação humana configurável
        </p>
      </div>
    </div>
  );
}
