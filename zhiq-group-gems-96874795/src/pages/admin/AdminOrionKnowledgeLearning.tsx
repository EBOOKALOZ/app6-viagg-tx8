/**
 * /admin/orion-knowledge-learning — ORION Knowledge & Learning AI (ORION-AI-31)
 *
 * Camada de APRENDIZADO do ecossistema: consolida o conhecimento acumulado por
 * todos os módulos a partir do event bus real (orion_eventos) — lições com
 * evidência, padrões/tendências e Learning Score. Read-only; nunca inventa.
 * (Distinto do AI-14 Strategy e do AI-34 Knowledge Graph.)
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GraduationCap, Loader2, Gauge, BookOpen, Activity, Radio } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const lsColor = (s: number) => s >= 80 ? "text-emerald-300" : s >= 60 ? "text-lime-300" : s >= 40 ? "text-amber-300" : "text-orange-300";
const CAT: Record<string, string> = {
  atividade: "bg-sky-100 text-sky-700", tendencia: "bg-amber-100 text-amber-700",
  feedback: "bg-emerald-100 text-emerald-700", cobertura: "bg-fuchsia-100 text-fuchsia-700", manual: "bg-slate-200 text-slate-700",
};
const TREND: Record<string, string> = { crescente: "text-emerald-600", decrescente: "text-red-600", estavel: "text-slate-500" };

type Aba = "resumo" | "conhecimento" | "padroes" | "eventos";

export default function AdminOrionKnowledgeLearning() {
  const [aba, setAba] = useState<Aba>("resumo");

  const { data: dash, isLoading } = useQuery({ queryKey: ["orion-learning"], queryFn: () => rpc("learning_dashboard"), refetchInterval: 60000 });

  const score = dash?.score || {};
  const comp = score.componentes || {};
  const kb = (dash?.knowledge_base || []) as any[];
  const patterns = dash?.patterns || {};
  const ei = dash?.event_intelligence || {};
  const metrics = dash?.metrics || {};
  const maxDia = Math.max(...(ei.por_dia || []).map((d: any) => Number(d.eventos) || 0), 1);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0f1f13] via-[#14401f] to-[#0f1f13] p-6 text-white shadow-xl ring-1 ring-emerald-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <GraduationCap className="h-8 w-8 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Knowledge & Learning AI</h1>
              <p className="text-sm text-slate-300/80">ORION-AI-31 · aprendizado consolidado do ecossistema · só evidência, nunca inventa</p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-emerald-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">Learning Score</p>
              <p className={`text-4xl font-black ${lsColor(score.learning_score)}`}>{score.learning_score ?? "—"}</p>
              <p className="text-[11px] font-bold text-emerald-200/80">{score.classificacao} · {score.tendencia}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Eventos", score.eventos_total], ["Tipos", score.tipos_ativos], ["Origens", score.origens_ativas],
              ["Diversidade", comp.diversidade], ["Cobertura", comp.cobertura], ["Feedback", comp.feedback]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Gauge, "Visão Geral"], ["conhecimento", BookOpen, `Base de Conhecimento${kb.length ? ` (${kb.length})` : ""}`],
             ["padroes", Activity, "Padrões & Tendências"], ["eventos", Radio, "Event Intelligence"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#14401f] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Componentes do Learning Score</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[["Diversidade", comp.diversidade], ["Cobertura", comp.cobertura], ["Volume 7d", comp.volume_7d],
                  ["Base conhec.", comp.base_conhecimento], ["Feedback", comp.feedback]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, Number(v) || 0)}%` }} /></div>
                    <p className="mt-1 text-sm font-black text-zinc-800">{v ?? 0}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[["Snapshots", metrics.snapshots], ["Lições", metrics.licoes], ["Padrões", metrics.padroes]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm"><p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p><p className="text-2xl font-black text-emerald-700">{String(v ?? 0)}</p></div>
              ))}
            </div>
            <div className="rounded-2xl bg-emerald-50 p-3 text-[11px] text-emerald-700">
              🎓 Aprende do event bus real (orion_eventos, {Number(metrics.eventos_fonte || 0).toLocaleString("pt-BR")} eventos de todos os módulos) — cada lição/padrão com evidência. Não altera nenhum módulo.
            </div>
          </div>
        )}

        {/* BASE DE CONHECIMENTO */}
        {aba === "conhecimento" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!kb.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">Sem lições. O motor roda de hora em hora (tick :37).</div>
            ) : kb.map((l: any, i: number) => (
              <div key={i} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${CAT[l.categoria] || "bg-zinc-100 text-zinc-600"}`}>{l.categoria}</span>
                  <p className="min-w-0 flex-1 font-bold text-zinc-800">{l.licao}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">conf {l.confianca}</span>
                </div>
                <pre className="mt-1 overflow-auto rounded-xl bg-slate-900 p-2 text-[10px] text-emerald-200">{JSON.stringify(l.evidencia, null, 0)}</pre>
              </div>
            ))}
          </div>
        )}

        {/* PADRÕES */}
        {aba === "padroes" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-emerald-700">📈 Crescentes</h3>
              {(patterns.crescentes || []).slice(0, 15).map((p: any, i: number) => (
                <div key={i} className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-600">{p.tipo}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">7d: {p.freq_7d}</span>
                  <span className={`text-[10px] font-black ${TREND.crescente}`}>+{p.variacao_pct}%</span>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-red-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-red-700">📉 Decrescentes</h3>
              {!(patterns.decrescentes || []).length ? <p className="text-xs text-zinc-400">Nenhum.</p> : (patterns.decrescentes || []).slice(0, 15).map((p: any, i: number) => (
                <div key={i} className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-600">{p.tipo}</span>
                  <span className={`text-[10px] font-black ${TREND.decrescente}`}>{p.variacao_pct}%</span>
                </div>
              ))}
              <h3 className="mb-2 mt-3 text-sm font-black text-zinc-700">🔝 Mais frequentes</h3>
              {(patterns.top_frequentes || []).map((p: any, i: number) => (
                <div key={i} className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-600">{p.tipo}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">{p.freq_total}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EVENT INTELLIGENCE */}
        {aba === "eventos" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-black text-zinc-700">Eventos por dia (14d) · total {Number(ei.total || 0).toLocaleString("pt-BR")}</h3>
              <div className="flex items-end gap-1" style={{ height: 140 }}>
                {(ei.por_dia || []).map((d: any, i: number) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div className="w-full rounded-t bg-emerald-500" style={{ height: `${Math.max(3, (Number(d.eventos) / maxDia) * 110)}px` }} title={`${d.eventos}`} />
                    <p className="text-[8px] text-zinc-400">{String(d.dia).slice(5)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Módulos mais ativos (origem dos eventos)</h3>
              {(ei.por_origem || []).map((o: any, i: number) => (
                <div key={i} className="mb-1 flex items-center gap-2">
                  <span className="w-5 text-[10px] font-black text-zinc-400">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{o.origem}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">{Number(o.eventos).toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Knowledge & Learning AI v1.0 · ORION-AI-31 · Learning Score + base de conhecimento + padrões ·
          read-only · só evidência · consolida orion_eventos (todos os módulos) · tick :37 · IA só via Gateway
        </p>
      </div>
    </div>
  );
}
