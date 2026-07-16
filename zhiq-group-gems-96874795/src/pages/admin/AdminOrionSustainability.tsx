/**
 * /admin/orion-sustainability — ORION Sustainability AI (ORION-AI-28)
 *
 * Centro de Sustentabilidade em 3 pilares (Ambiental/Econômico/Social).
 * Sustainability Score (Amb 30% + Eco 40% + Soc 30%), Opportunity Score
 * e o VIAGG Impact Index (VII) por cidade. Mede impacto com dados REAIS,
 * declara lacunas, NUNCA inventa nem executa. Read-only. IA via Gateway.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Leaf, Loader2, Sparkles, Layers, MapPin, ListChecks } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const PILAR: Record<string, { emoji: string; bar: string; chipBg: string; chipTx: string }> = {
  ambiental: { emoji: "🌱", bar: "bg-emerald-500", chipBg: "bg-emerald-100", chipTx: "text-emerald-700" },
  economico: { emoji: "💰", bar: "bg-amber-500", chipBg: "bg-amber-100", chipTx: "text-amber-700" },
  social: { emoji: "👥", bar: "bg-sky-500", chipBg: "bg-sky-100", chipTx: "text-sky-700" },
};
const scoreColor = (s: number) => s >= 70 ? "text-emerald-600" : s >= 45 ? "text-amber-600" : "text-red-600";

type Aba = "visao" | "pilares" | "cidades" | "indicadores";

export default function AdminOrionSustainability() {
  const [aba, setAba] = useState<Aba>("visao");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-sustainability"], queryFn: () => rpc("sustainability_dashboard"), refetchInterval: 60000,
  });

  const score = dash?.score || {};
  const metrics = dash?.metrics || {};
  const amb = dash?.ambiental || {};
  const eco = dash?.economico || {};
  const soc = dash?.social || {};
  const indicadores = dash?.indicadores || {};
  const cidades = (dash?.cidades_vii || []) as any[];

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("sustainability_summary");
      const r = await orionAiText("sustainability", `Tipo: ${tipo}\nIndicadores reais: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 650 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const pilares: [string, number][] = [
    ["ambiental", score.ambiental], ["economico", score.economico], ["social", score.social],
  ];

  const kpis: [string, any][] = [
    ["Sustainability", score.sustainability_score], ["VII nacional", score.vii],
    ["Receita gerada", eco.receita_gerada != null ? `R$ ${Number(eco.receita_gerada).toLocaleString("pt-BR")}` : "—"],
    ["Novos lojistas", soc.novos_lojistas_30d], ["Cache IA", `${eco.ia_cache_hit_pct ?? 0}%`],
    ["Indic. reais", metrics.indicadores_reais],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#052e16] via-[#15803d] to-[#052e16] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Leaf className="h-8 w-8 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Sustainability AI</h1>
              <p className="text-sm text-emerald-200/80">
                ORION-AI-28 · impacto real em 3 pilares · VIAGG Impact Index · nunca inventa, nunca executa
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">Sustainability</p>
              <p className="text-3xl font-black">{score.sustainability_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {kpis.map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["visao", Sparkles, "Visão geral"], ["pilares", Layers, "Pilares"],
             ["cidades", MapPin, `Cidades / VII${cidades.length ? ` (${cidades.length})` : ""}`], ["indicadores", ListChecks, "Indicadores"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#15803d] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "visao" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["sustainability.summary", "Panorama"], ["sustainability.score", "Score / VII"],
                  ["sustainability.economic", "Econômico"], ["sustainability.social", "Social"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-emerald-200 hover:bg-emerald-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-emerald-100">{narrativa}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-black text-zinc-700">Pilares (peso: Ambiental 30% · Econômico 40% · Social 30%)</h3>
              <div className="space-y-3">
                {pilares.map(([p, v]) => (
                  <div key={p} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-sm font-bold capitalize text-zinc-600">{PILAR[p]?.emoji} {p}</span>
                    <div className="h-5 flex-1 rounded-lg bg-slate-100">
                      <div className={`flex h-5 items-center justify-end rounded-lg ${PILAR[p]?.bar} px-2 text-[11px] font-black text-white`}
                        style={{ width: `${Math.max(6, Number(v) || 0)}%` }}>{v}</div>
                    </div>
                  </div>
                ))}
              </div>
              {score.recomendacao && <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs text-zinc-600">💡 {score.recomendacao}</p>}
            </div>
            <div className="rounded-3xl border border-amber-100 bg-amber-50/40 p-4 text-xs text-amber-700 shadow-sm">
              <b>Honestidade:</b> {metrics.indicadores_declarados ?? 0} indicador(es) estão <b>DECLARADOS</b> (renda de motoboys, km otimizados)
              por falta de dados de entrega — nunca estimados artificialmente. {metrics.indicadores_reais ?? 0} indicadores são reais.
            </div>
          </div>
        )}

        {/* PILARES */}
        {aba === "pilares" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[["🌱 Ambiental", amb, score.ambiental, PILAR.ambiental], ["💰 Econômico", eco, score.economico, PILAR.economico], ["👥 Social", soc, score.social, PILAR.social]].map(([titulo, data, sc, cls]: any) => (
              <div key={titulo} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-black text-zinc-700">{titulo}</h3>
                  <span className={`rounded-full ${cls.chipBg} px-2.5 py-1 text-sm font-black ${cls.chipTx}`}>{sc}</span>
                </div>
                <div className="space-y-1">
                  {Object.entries(data as Record<string, any>).filter(([k, v]) => !["declarado", "modulos", "nota"].includes(k) && typeof v !== "object").map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-zinc-500">{k.replaceAll("_", " ")}</span>
                      <span className="font-black text-zinc-800">{String(v)}</span>
                    </div>
                  ))}
                </div>
                {data.declarado && (
                  <div className="mt-2 rounded-2xl bg-amber-50 p-2 text-[10px] text-amber-700">
                    <b>Declarado:</b> {Object.entries(data.declarado as Record<string, any>).filter(([k]) => k !== "nota").map(([k]) => k.replaceAll("_", " ")).join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* CIDADES / VII */}
        {aba === "cidades" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!cidades.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">Sem cidades ainda.</div>
            ) : cidades.map((c: any) => (
              <div key={c.cidade} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`flex h-11 w-11 flex-col items-center justify-center rounded-xl bg-emerald-50 text-sm font-black ${scoreColor(c.vii)}`}>
                    {c.vii}<span className="text-[7px] font-bold text-zinc-400">VII</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black text-zinc-800">{c.cidade}</p>
                    <p className="truncate text-[11px] text-zinc-500">{c.recomendacao}</p>
                  </div>
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-700">oport {c.opportunity_score}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">💰 {c.economico}</span>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">👥 {c.social}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">🌱 {c.ambiental}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">confiança {c.confianca}%</span>
                </div>
              </div>
            ))}
            <p className="text-center text-[11px] text-zinc-400">
              VIAGG Impact Index (VII) = 0,4·econômico + 0,3·social + 0,3·ambiental por cidade. Onde a plataforma mais transforma a economia local.
            </p>
          </div>
        )}

        {/* INDICADORES */}
        {aba === "indicadores" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {["ambiental", "economico", "social"].map((p) => (
              <div key={p} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black capitalize text-zinc-700">{PILAR[p]?.emoji} {p}</h3>
                {((indicadores[p] || []) as any[]).map((i: any) => (
                  <div key={i.chave} className="mb-1.5 flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${i.status === "real" ? "bg-emerald-500" : "bg-amber-400"}`} title={i.status} />
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-600">{i.chave.replaceAll("_", " ")}</span>
                    <span className="text-xs font-black text-zinc-800">{i.valor != null ? `${i.valor}${i.unidade === "%" ? "%" : ""}` : "declarado"}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Sustainability AI v1.0 · ORION-AI-28 · 3 pilares + VIAGG Impact Index · dados reais, declara lacunas · read-only ·
          nunca executa · tick :31 · IA só via Gateway + Prompt Registry
        </p>
      </div>
    </div>
  );
}
