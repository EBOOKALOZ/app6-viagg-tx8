/**
 * /admin/orion-innovation — ORION Innovation AI (ORION-AI-29)
 *
 * Laboratório permanente de inovação: descobre oportunidades de evolução,
 * Innovation Score (0-100), Innovation Opportunity Matrix (🔥/⭐/💡),
 * Innovation Portfolio priorizado e Roadmap Advisor. Observa e PROPÕE —
 * nunca altera código/banco nem executa. Read-only. IA via Gateway.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Lightbulb, Loader2, Sparkles, LayoutGrid, Flame, Map } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const IOM: Record<string, { cls: string; label: string }> = {
  alta: { cls: "bg-red-600 text-white", label: "🔥 Alta" },
  media: { cls: "bg-amber-100 text-amber-700", label: "⭐ Média" },
  futura: { cls: "bg-sky-100 text-sky-700", label: "💡 Futura" },
};
const ESF: Record<string, string> = { baixo: "bg-emerald-100 text-emerald-700", medio: "bg-amber-100 text-amber-700", alto: "bg-red-100 text-red-700" };
const scoreColor = (s: number) => s >= 75 ? "text-red-600" : s >= 55 ? "text-amber-600" : "text-sky-600";

type Aba = "visao" | "portfolio" | "matriz" | "roadmap";

export default function AdminOrionInnovation() {
  const [aba, setAba] = useState<Aba>("visao");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-innovation"], queryFn: () => rpc("innovation_dashboard"), refetchInterval: 60000,
  });

  const score = dash?.score || {};
  const metrics = dash?.metrics || {};
  const matriz = dash?.matriz || {};
  const roadmap = dash?.roadmap || {};
  const portfolio = (dash?.portfolio || []) as any[];

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("innovation_summary");
      const r = await orionAiText("innovation", `Tipo: ${tipo}\nInnovation Portfolio real: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 650 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const kpis: [string, any][] = [
    ["Innovation Score", score.innovation_score], ["Oportunidades", score.oportunidades],
    ["🔥 Alta prioridade", score.alta_prioridade], ["Score médio", score.score_medio],
    ["Categorias", Object.keys(metrics.por_categoria || {}).length], ["💡 Futuras", (matriz.futura || []).length],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#1e1b4b] via-[#6d28d9] to-[#1e1b4b] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Lightbulb className="h-8 w-8 text-violet-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Innovation AI</h1>
              <p className="text-sm text-violet-200/80">
                ORION-AI-29 · laboratório de inovação · Innovation Portfolio + Roadmap · observa e propõe, nunca executa
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-200/70">Innovation Score</p>
              <p className="text-3xl font-black">{score.innovation_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {kpis.map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-violet-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["visao", Sparkles, "Visão geral"], ["portfolio", LayoutGrid, `Portfolio${portfolio.length ? ` (${portfolio.length})` : ""}`],
             ["matriz", Flame, "Matriz IOM"], ["roadmap", Map, "Roadmap"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#6d28d9] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-violet-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "visao" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-violet-200 bg-violet-50/50 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["innovation.summary", "Panorama"], ["innovation.strategy", "Roadmap / estratégia"],
                  ["innovation.opportunity", "Oportunidades"], ["innovation.market", "Monetização"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-violet-200 hover:bg-violet-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-violet-100">{narrativa}</p>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Matriz IOM (resumo)</h3>
                {["alta", "media", "futura"].map((k) => (
                  <div key={k} className="mb-1.5 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${IOM[k]?.cls}`}>{IOM[k]?.label}</span>
                    <span className="min-w-0 flex-1"></span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black text-zinc-600">{(matriz[k] || []).length}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Componentes do Innovation Score</h3>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries((score.componentes || {}) as Record<string, any>).map(([k, v]) => (
                    <div key={k} className="rounded-2xl bg-slate-50 p-2 text-center">
                      <p className="text-[10px] font-bold uppercase text-zinc-400">{k.replaceAll("_", " ")}</p>
                      <p className="text-base font-black text-zinc-800">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-emerald-100 bg-emerald-50/40 p-4 text-xs text-emerald-800 shadow-sm">
              🧭 <b>Roadmap Advisor:</b> próximo módulo sugerido → <b>{roadmap.proximo_modulo || "—"}</b>. As oportunidades são
              reais — derivadas das lacunas que os próprios módulos ORION declararam + suas saídas. O Innovation AI <b>propõe</b>, nunca implementa.
            </div>
          </div>
        )}

        {/* PORTFOLIO */}
        {aba === "portfolio" && !isLoading && (
          <div className="mt-4 space-y-2">
            {portfolio.map((o: any) => (
              <div key={o.chave} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-sm font-black ${scoreColor(o.innovation_score)}`}>{o.innovation_score}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black text-zinc-800">{o.titulo}</p>
                    <p className="truncate text-[11px] text-zinc-500">{o.descricao}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${IOM[o.iom]?.cls || ""}`}>{IOM[o.iom]?.label}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">{o.categoria}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ESF[o.esforco] || "bg-zinc-100 text-zinc-500"}`}>esforço {o.esforco}</span>
                  {o.fatores && Object.entries(o.fatores as Record<string, any>).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">{k.replaceAll("_", " ")}: {v}</span>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-center text-[11px] text-zinc-400">
              Innovation Score (0-100) = impacto + viabilidade + benefício + receita + custos + alinhamento ORION. Toda proposta aguarda aprovação humana.
            </p>
          </div>
        )}

        {/* MATRIZ IOM */}
        {aba === "matriz" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {["alta", "media", "futura"].map((k) => (
              <div key={k} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className={`mb-2 inline-flex rounded-full px-2.5 py-1 text-xs font-black ${IOM[k]?.cls}`}>{IOM[k]?.label} ({(matriz[k] || []).length})</h3>
                <div className="space-y-1.5">
                  {((matriz[k] || []) as any[]).map((o: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2">
                      <span className={`text-sm font-black ${scoreColor(o.score)}`}>{o.score}</span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{o.titulo}</span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-bold text-zinc-500">{o.categoria}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ROADMAP */}
        {aba === "roadmap" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[["Próximo módulo", roadmap.proximo_modulo], ["Maior retorno", roadmap.maior_retorno], ["Menor esforço", roadmap.menor_custo_esforco]].map(([l, v]: any) => (
                <div key={l} className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-violet-400">{l}</p>
                  <p className="mt-1 text-sm font-black text-zinc-800">{v || "—"}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🎯 Próximo sprint (alta prioridade)</h3>
              {((roadmap.proximo_sprint || []) as any[]).map((o: any, i: number) => (
                <div key={i} className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className={`text-sm font-black ${scoreColor(o.score)}`}>{o.score}</span>
                  <span className="min-w-0 flex-1 truncate font-bold text-zinc-700">{o.titulo}</span>
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">{o.categoria}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ESF[o.esforco] || "bg-zinc-100 text-zinc-500"}`}>esforço {o.esforco}</span>
                </div>
              ))}
              <p className="mt-2 text-[11px] text-zinc-400">{roadmap.nota}</p>
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Innovation AI v1.0 · ORION-AI-29 · Innovation Portfolio + IOM + Roadmap Advisor · read-only ·
          observa e propõe, nunca executa · tick :53 · IA só via Gateway + Prompt Registry
        </p>
      </div>
    </div>
  );
}
