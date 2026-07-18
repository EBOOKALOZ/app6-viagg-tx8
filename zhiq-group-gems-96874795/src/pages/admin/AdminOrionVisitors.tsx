/**
 * /admin/orion-visitors — ORION Visitor Intelligence AI (ORION-AI-39)
 *
 * Analisa/compreende/prevê o comportamento dos visitantes (mesmo antes do
 * cadastro), só com dados técnicos/comportamentais reais. Nunca inventa perfil;
 * toda classificação tem evidência. Privacidade: sem PII, só anon_id/cidade/
 * source/timing. VS / VIS / CP + segmentação + funil + predições explicáveis.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Loader2, Gauge, Radar, Route, Layers, TrendingUp } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const vsColor = (s: number) => s >= 70 ? "text-emerald-300" : s >= 45 ? "text-amber-300" : "text-red-300";
const SEG: Record<string, string> = {
  alto_valor: "bg-fuchsia-100 text-fuchsia-700", comprador: "bg-emerald-100 text-emerald-700",
  recorrente: "bg-sky-100 text-sky-700", anunciante: "bg-amber-100 text-amber-700",
  explorador: "bg-teal-100 text-teal-700", indeciso: "bg-slate-200 text-slate-600", novo: "bg-zinc-100 text-zinc-600",
};

type Aba = "resumo" | "origem" | "navegacao" | "funil" | "segmentos" | "predicoes";

export default function AdminOrionVisitors() {
  const [aba, setAba] = useState<Aba>("resumo");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-visitors"], queryFn: () => rpc("visitor_dashboard"), refetchInterval: 45000,
  });

  const score = dash?.score || {};
  const segments = dash?.segments || {};
  const sources = dash?.sources || {};
  const navigation = dash?.navigation || {};
  const funnel = dash?.funnel || {};
  const predictions = dash?.predictions || {};
  const porSource = sources.por_source || {};
  const porCidade = sources.por_cidade || {};

  const funilEtapas: [string, any][] = [
    ["Visitante", funnel.visitante], ["Pesquisa", funnel.pesquisa], ["Produto", funnel.produto],
    ["Contato", funnel.contato], ["Compra", funnel.compra],
  ];
  const funilMax = Math.max(...funilEtapas.map(([, v]) => Number(v) || 0), 1);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0b132b] via-[#1c2541] to-[#0b132b] p-6 text-white shadow-xl ring-1 ring-indigo-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 ring-1 ring-indigo-500/30">
              <Users className="h-8 w-8 text-indigo-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Visitor Intelligence AI</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-39 · comportamento e intenção de visitantes · só evidência, sem PII, respeitando privacidade
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-indigo-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-200/70">Visitor Score médio</p>
              <p className={`text-4xl font-black ${vsColor(score.vs_medio)}`}>{score.vs_medio ?? "—"}</p>
              <p className="text-[11px] font-bold text-indigo-200/80">{score.visitantes_total ?? 0} visitantes</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Online (5min)", score.online_5min], ["Hoje", score.hoje], ["Recorrentes", score.recorrentes],
              ["Novos", score.novos], ["Intent (VIS)", score.vis_medio], ["Conversão (CP)", `${score.cp_medio ?? 0}%`]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Gauge, "Visão Geral"], ["origem", Radar, "Origem & Cidades"], ["navegacao", Route, "Navegação"],
             ["funil", TrendingUp, "Funil"], ["segmentos", Layers, "Segmentação"], ["predicoes", Users, "Predições"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#1c2541] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[["VS médio", score.vs_medio], ["VIS médio", score.vis_medio], ["CP médio", `${score.cp_medio ?? 0}%`],
                ["Logados", score.logados], ["Eventos/visitante", score.eventos_por_visitante], ["Recorrentes", score.recorrentes]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-2xl font-black text-indigo-700">{String(v ?? 0)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Predições agregadas</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[["Prob. compra média", `${predictions.prob_compra_media ?? 0}%`], ["Prob. abandono média", `${predictions.prob_abandono_media ?? 0}%`],
                  ["Prob. retorno média", `${predictions.prob_retorno_media ?? 0}%`], ["Alto valor (CP≥60)", predictions.alto_valor],
                  ["Risco abandono", predictions.risco_abandono]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-lg font-black text-zinc-800">{String(v ?? 0)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-indigo-50 p-3 text-[11px] text-indigo-700">
              🔒 Privacidade: perfis baseados só em comportamento observado (anon_id/cidade/source/timing), sem dados pessoais nem atributos sensíveis.
            </div>
          </div>
        )}

        {/* ORIGEM & CIDADES */}
        {aba === "origem" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Por origem (source de clique)</h3>
              {Object.entries(porSource).map(([s, n]: any) => (
                <div key={s} className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{s}</span>
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700">{n}</span>
                </div>
              ))}
              <p className="mt-2 text-[11px] text-amber-600">⚠ {sources.nota_origem_externa}</p>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Por cidade</h3>
              {Object.entries(porCidade).map(([c, n]: any) => (
                <div key={c} className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{c}</span>
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700">{n}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* NAVEGAÇÃO */}
        {aba === "navegacao" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">Páginas mais visitadas · profundidade média {navigation.profundidade_media ?? 0}</h3>
            {(navigation.paginas_mais_visitadas || []).map((p: any, i: number) => (
              <div key={i} className="mb-1 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-600">{p.page}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{p.visitantes} visit.</span>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700">{p.clicks} cliques</span>
              </div>
            ))}
            <p className="mt-2 text-[11px] text-amber-600">⚠ {navigation.nota_heatmap}</p>
          </div>
        )}

        {/* FUNIL */}
        {aba === "funil" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-black text-zinc-700">Funil de conversão</h3>
            <div className="space-y-2">
              {funilEtapas.map(([l, v]: any, i: number) => (
                <div key={l} className="flex items-center gap-3">
                  <span className="w-24 text-xs font-bold text-zinc-600">{l}</span>
                  <div className="h-7 flex-1 overflow-hidden rounded-lg bg-slate-100">
                    <div className="flex h-full items-center justify-end rounded-lg bg-indigo-500 pr-2 text-[10px] font-black text-white"
                      style={{ width: `${Math.max(8, (Number(v) / funilMax) * 100)}%` }}>{v ?? 0}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-amber-600">⚠ {funnel.nota}</p>
          </div>
        )}

        {/* SEGMENTAÇÃO */}
        {aba === "segmentos" && !isLoading && (
          <div className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(segments).map(([s, n]: any) => (
                <div key={s} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-black ${SEG[s] || "bg-zinc-100 text-zinc-600"}`}>{s}</span>
                  <p className="mt-2 text-3xl font-black text-zinc-800">{n}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-zinc-400">Segmento primário por visitante, baseado em comportamento observado (cliques/dias/conversões/anunciante) — nunca suposição.</p>
          </div>
        )}

        {/* PREDIÇÕES */}
        {aba === "predicoes" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">🔮 Top visitantes por intenção de conversão</h3>
            {(predictions.top_intencao || []).map((v: any, i: number) => (
              <div key={i} className="mb-1 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-black text-white">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-600">{v.visitor}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">VS {v.vs}</span>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700">CP {v.cp}%</span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Visitor Intelligence AI v1.0 · ORION-AI-39 · VS/VIS/CP + segmentação + funil + predições ·
          read-only · só evidência · privacidade sem PII · tick */3 · IA só via Gateway
        </p>
      </div>
    </div>
  );
}
