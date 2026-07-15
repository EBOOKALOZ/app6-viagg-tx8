/**
 * /admin/orion-operations — ORION Operations AI (ORION-AI-13)
 *
 * COO AI: missões operacionais geradas dos ACHADOS REAIS dos módulos
 * certificados (nada recalculado), priorizadas com justificativa/
 * dados/confiança, ciclo de execução auditado (iniciar→concluir com
 * resultado/impacto/ROI) e arquivamento automático quando a condição
 * normaliza. Narrativas via Gateway v3 + Prompt Registry.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import {
  Briefcase, Loader2, RefreshCw, Play, CheckCircle2, XCircle, Sparkles, Send,
  Map as MapIcon, ListChecks, PlusCircle,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const CLS: Record<string, string> = {
  critica: "bg-red-600 text-white", alta: "bg-orange-100 text-orange-700",
  media: "bg-amber-100 text-amber-700", baixa: "bg-sky-100 text-sky-700",
  oportunidade: "bg-emerald-100 text-emerald-700",
};
const ST: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-700", em_execucao: "bg-sky-100 text-sky-700",
  concluida: "bg-emerald-100 text-emerald-700", cancelada: "bg-zinc-100 text-zinc-500",
  arquivada: "bg-zinc-100 text-zinc-400",
};

type Aba = "fila" | "mapa" | "execucao" | "coo";

export default function AdminOrionOperations() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("fila");
  const [ocupado, setOcupado] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-operations"], queryFn: () => rpc("operations_dashboard"), refetchInterval: 30000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["orion-operations"] });

  const score = dash?.score || {};
  const exec = dash?.execucao || {};
  const porStatus = (exec.por_status || {}) as Record<string, number>;
  const missoes = (dash?.missoes || []) as any[];

  const gerar = async () => {
    setOcupado("gerar");
    try { const r = await rpc("operations_missions_gerar"); refresh();
      alert(`Motor de Decisão: ${r.novas} nova(s) missão(ões), ${r.arquivadas_auto} arquivada(s) automaticamente.`); }
    catch (e: any) { alert("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const acao = async (m: any, a: "iniciar" | "concluir" | "cancelar") => {
    let resultado: string | null = null, impacto: string | null = null, roi: string | null = null;
    if (a === "concluir") {
      resultado = window.prompt("Resultado (auditado):"); if (!resultado) return;
      impacto = window.prompt("Impacto obtido:"); roi = window.prompt("ROI obtido (opcional):");
    }
    if (a === "cancelar") { resultado = window.prompt("Motivo do cancelamento:"); if (!resultado) return; }
    setOcupado(m.id);
    try { await rpc("operations_mission_atualizar", { p_id: m.id, p_acao: a, p_resultado: resultado, p_impacto: impacto, p_roi: roi }); refresh(); }
    catch (e: any) { alert("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const criarManual = async () => {
    const titulo = window.prompt("Título da missão:"); if (!titulo) return;
    const area = window.prompt("Área (marketplace/mobilidade/financeiro/growth/...):", "operacao") || "operacao";
    const cls = window.prompt("Classificação (critica/alta/media/baixa/oportunidade):", "media") || "media";
    setOcupado("criar");
    try { await rpc("operations_mission_criar", { p_titulo: titulo, p_area: area, p_classificacao: cls }); refresh(); }
    catch (e: any) { alert("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const perguntar = async (texto?: string) => {
    const q = texto || pergunta; if (!q.trim()) return;
    setOcupado("coo"); setResposta("");
    try {
      const ctx = await rpc("operations_summary");
      const r = await orionAiText("operations",
        `Pergunta de coordenação: ${q}\nEstado operacional real: ${JSON.stringify(ctx)}`,
        { promptKey: "operations.executive", maxTokens: 650 });
      setResposta(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } catch (e: any) { setResposta("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* CENTRO OPERACIONAL */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0a1f0d] via-[#14532d] to-[#0a1f0d] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Briefcase className="h-8 w-8 text-lime-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Operations AI</h1>
              <p className="text-sm text-lime-200/80">
                ORION-AI-13 · COO AI: achados reais → missões priorizadas · execução auditada
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <button onClick={gerar} disabled={!!ocupado}
              className="flex items-center gap-2 rounded-xl bg-lime-400 px-4 py-2.5 text-sm font-black text-[#0a1f0d] hover:brightness-110 disabled:opacity-50">
              {ocupado === "gerar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Rodar Motor de Decisão
            </button>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-lime-200/70">Execution Score</p>
              <p className="text-3xl font-black">{score.execution_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Pendentes", porStatus.pendente], ["Em execução", porStatus.em_execucao],
              ["Concluídas", porStatus.concluida], ["Arquivadas auto", porStatus.arquivada],
              ["Tempo médio (h)", exec.tempo_medio_resolucao_h ?? "—"],
              ["Penalidade score", score.penalidade_missoes_pendentes]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-lime-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["fila", ListChecks, "Fila de Prioridades"], ["mapa", MapIcon, "Mapa Operacional"],
             ["execucao", CheckCircle2, "Execução & Resultados"], ["coo", Sparkles, "COO AI"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#14532d] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
          <button onClick={criarManual} disabled={!!ocupado}
            className="ml-auto flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-50">
            <PlusCircle className="h-4 w-4" /> Missão manual
          </button>
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-lime-600" /></div>}

        {/* FILA */}
        {aba === "fila" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!missoes.filter((m) => ["pendente", "em_execucao"].includes(m.status)).length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">
                🎉 Nenhuma missão pendente — operação em dia.
              </div>
            ) : missoes.filter((m) => ["pendente", "em_execucao"].includes(m.status)).map((m: any) => (
              <div key={m.id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-black text-white">P{m.prioridade}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${CLS[m.classificacao] || ""}`}>{m.classificacao}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${ST[m.status]}`}>{m.status.replace("_", " ")}</span>
                  <p className="min-w-0 flex-1 font-bold">{m.titulo}</p>
                  {m.status === "pendente" && (
                    <button onClick={() => acao(m, "iniciar")} disabled={ocupado === m.id}
                      className="flex items-center gap-1 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                      <Play className="h-3.5 w-3.5" /> Iniciar
                    </button>
                  )}
                  {m.status === "em_execucao" && (
                    <button onClick={() => acao(m, "concluir")} disabled={ocupado === m.id}
                      className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Concluir
                    </button>
                  )}
                  <button onClick={() => acao(m, "cancelar")} disabled={ocupado === m.id}
                    className="flex items-center gap-1 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                    <XCircle className="h-3.5 w-3.5" /> Cancelar
                  </button>
                </div>
                <p className="mt-1 text-xs text-zinc-600">{m.descricao}</p>
                <p className="mt-1 text-[11px] text-zinc-400">
                  {m.area}{m.cidade && ` · 📍 ${m.cidade}`} · objetivo: {m.objetivo || "—"} ·
                  impacto: {m.impacto_esperado || "—"} · urgência: {m.urgencia || "—"} ·
                  esforço: {m.tempo_estimado || "—"} · confiança {Math.round(Number(m.confianca || 0) * 100)}%
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400">📋 {m.justificativa}</p>
              </div>
            ))}
          </div>
        )}

        {/* MAPA */}
        {aba === "mapa" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">Prioridade operacional por cidade (Growth + missões)</h3>
            {!((dash?.mapa || []) as any[]).length ? (
              <p className="p-6 text-center text-sm text-zinc-400">Sem cidades pontuadas ainda (Growth).</p>
            ) : ((dash?.mapa || []) as any[]).map((c: any) => (
              <div key={c.cidade} className="mb-1.5 flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-xs font-bold capitalize text-zinc-700">📍 {c.cidade}{c.uf ? ` — ${c.uf}` : ""}</p>
                <span className="text-[10px] text-zinc-400">growth {c.growth_score}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${c.missoes_pendentes > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {c.missoes_pendentes} missão(ões)
                </span>
                {c.prioridade_operacional > 0 && (
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-black text-white">P{c.prioridade_operacional}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* EXECUÇÃO */}
        {aba === "execucao" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">Concluídas (resultado · impacto · ROI)</h3>
            {!((exec.concluidas_recentes || []) as any[]).length ? (
              <p className="p-6 text-center text-sm text-zinc-400">Nenhuma missão concluída ainda.</p>
            ) : ((exec.concluidas_recentes || []) as any[]).map((c: any, i: number) => (
              <div key={i} className="mb-2 rounded-2xl bg-emerald-50 p-3">
                <p className="text-sm font-bold text-zinc-800">✅ {c.titulo}</p>
                <p className="text-xs text-zinc-600">Resultado: {c.resultado} {c.impacto && `· Impacto: ${c.impacto}`} {c.roi && `· ROI: ${c.roi}`}</p>
                <p className="text-[10px] text-zinc-400">{new Date(c.quando).toLocaleString("pt-BR")}</p>
              </div>
            ))}
            <p className="mt-2 text-[11px] text-zinc-400">
              Histórico completo: {JSON.stringify(porStatus)} · tempo médio de resolução: {exec.tempo_medio_resolucao_h ?? "—"}h
            </p>
          </div>
        )}

        {/* COO AI */}
        {aba === "coo" && (
          <div className="mt-4 rounded-3xl border border-lime-200 bg-lime-50/50 p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {["Monte meu plano de hoje", "Resumo executivo", "Resumo operacional", "Resumo financeiro",
                "Resumo comercial", "Resumo marketplace", "Resumo mobilidade", "Resumo da IA"].map((q) => (
                <button key={q} onClick={() => perguntar(q)} disabled={!!ocupado}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-lime-200 hover:bg-lime-100 disabled:opacity-50">
                  {q}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={pergunta} onChange={(e) => setPergunta(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && perguntar()}
                placeholder="Pergunte ao COO qualquer coordenação…"
                className="h-10 min-w-0 flex-1 rounded-xl border border-lime-200 bg-white px-3 text-sm" />
              <button onClick={() => perguntar()} disabled={!!ocupado}
                className="flex h-10 items-center gap-1 rounded-xl bg-[#14532d] px-4 text-sm font-black text-white disabled:opacity-50">
                {ocupado === "coo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            {resposta && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-lime-100">{resposta}</p>}
            <p className="mt-2 text-[10px] text-zinc-400">Prompt Registry: operations.executive · via Gateway v3.</p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Operations AI v1.0 · ORION-AI-13 · Executive Operations · missões nascem dos achados reais,
          arquivam sozinhas quando a condição normaliza · aprovação humana sempre · tudo auditado
        </p>
      </div>
    </div>
  );
}
