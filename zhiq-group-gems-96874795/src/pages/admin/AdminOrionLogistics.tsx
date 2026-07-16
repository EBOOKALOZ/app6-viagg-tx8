/**
 * /admin/orion-logistics — ORION Logistics AI (ORION-AI-27)
 *
 * Centro Inteligente de Operações Logísticas: entregas, fretes, viagens,
 * motoboys. Logistics Score + Logistics Opportunity Score por cidade,
 * heatmap, cobertura e recomendações estratégicas. Analisa/prevê/otimiza/
 * RECOMENDA — nunca despacha (execução via Dispatcher/Automation).
 * Read-only. IA via Gateway + Prompt Registry.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Truck, Loader2, Sparkles, MapPin, Bike, Lightbulb } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const SINAL: Record<string, string> = {
  alta_oportunidade: "bg-orange-100 text-orange-700", falta_entregadores: "bg-red-600 text-white",
  equilibrado: "bg-emerald-100 text-emerald-700", baixa_demanda: "bg-zinc-100 text-zinc-500",
};
const TEMP: Record<string, string> = { quente: "bg-red-500", morna: "bg-amber-400", fria: "bg-sky-300" };
const oppColor = (s: number) => s >= 60 ? "text-orange-600" : s >= 40 ? "text-amber-600" : "text-emerald-600";

type Aba = "visao" | "cidades" | "motoboys" | "recomendacoes";

export default function AdminOrionLogistics() {
  const [aba, setAba] = useState<Aba>("visao");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-logistics"], queryFn: () => rpc("logistics_dashboard"), refetchInterval: 60000,
  });

  const score = dash?.score || {};
  const metrics = dash?.metrics || {};
  const heatmap = (dash?.heatmap?.cidades || []) as any[];
  const cidades = (dash?.scores_cidade || []) as any[];
  const motoboys = dash?.motoboys || {};
  const cobertura = dash?.cobertura || {};
  const ft = dash?.fretes_viagens || {};
  const recs = (dash?.recomendacoes || []) as any[];

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("logistics_summary");
      const r = await orionAiText("logistics", `Tipo: ${tipo}\nDados logísticos reais: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 600 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const kpis: [string, any][] = [
    ["Logistics Score", score.logistics_score], ["Cidades", metrics.cidades],
    ["Motoboys online", metrics.motoboys_online], ["Cadastrados", metrics.motoboys_cadastrados],
    ["Fretes", metrics.fretes], ["Corridas", metrics.corridas],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0a1f3b] via-[#0e7490] to-[#0a1f3b] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Truck className="h-8 w-8 text-cyan-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Logistics AI</h1>
              <p className="text-sm text-cyan-200/80">
                ORION-AI-27 · operações logísticas · Logistics Opportunity Score · recomenda, nunca despacha
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200/70">Logistics Score</p>
              <p className="text-3xl font-black">{score.logistics_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {kpis.map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-cyan-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["visao", Sparkles, "Visão geral"], ["cidades", MapPin, `Cidades${cidades.length ? ` (${cidades.length})` : ""}`],
             ["motoboys", Bike, "Motoboys / Fretes"], ["recomendacoes", Lightbulb, `Recomendações${recs.length ? ` (${recs.length})` : ""}`]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#0e7490] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-cyan-500" /></div>}

        {/* VISÃO GERAL + HEATMAP */}
        {aba === "visao" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-cyan-200 bg-cyan-50/50 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["logistics.summary", "Panorama"], ["logistics.coverage", "Cobertura"],
                  ["logistics.balance", "Equilíbrio"], ["logistics.recommendation", "Estratégia"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-cyan-200 hover:bg-cyan-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-cyan-100">{narrativa}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Heatmap logístico (por cidade)</h3>
              <div className="space-y-1.5">
                {heatmap.map((c: any) => (
                  <div key={c.cidade} className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2">
                    <span className={`h-3 w-3 rounded-full ${TEMP[c.temperatura] || "bg-zinc-300"}`} title={c.temperatura} />
                    <span className="min-w-0 flex-1 font-bold text-zinc-700">{c.cidade}</span>
                    <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-black text-cyan-700">demanda {c.demanda}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">online {c.motoboys_online}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SINAL[c.sinal] || "bg-zinc-100"}`}>{c.sinal?.replaceAll("_", " ")}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">{dash?.heatmap?.nota}</p>
            </div>
          </div>
        )}

        {/* CIDADES (Logistics Opportunity Score) */}
        {aba === "cidades" && !isLoading && (
          <div className="mt-4 space-y-2">
            {cidades.map((c: any) => (
              <div key={c.cidade} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-sm font-black ${oppColor(c.opportunity_score)}`}>{c.opportunity_score}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black text-zinc-800">{c.cidade}{c.uf ? `/${c.uf}` : ""}</p>
                    <p className="truncate text-[11px] text-zinc-500">{c.recomendacao}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${SINAL[c.sinal] || ""}`}>{c.sinal?.replaceAll("_", " ")}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">saúde {c.logistics_score}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700">demanda {c.demanda}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">online {c.motoboys_online}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">confiança {c.confianca}%</span>
                </div>
              </div>
            ))}
            <p className="text-center text-[11px] text-zinc-400">
              Logistics Opportunity Score (0-100) = demanda + escassez de entregadores + crescimento. Onde captar/expandir.
            </p>
          </div>
        )}

        {/* MOTOBOYS / FRETES / VIAGENS */}
        {aba === "motoboys" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Entregadores (oferta)</h3>
              <div className="grid grid-cols-2 gap-2">
                {[["Cadastrados", motoboys.cadastrados], ["Aprovados", motoboys.aprovados],
                  ["Online agora", motoboys.online_agora], ["Presenças", motoboys.presencas]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-lg font-black text-zinc-800">{String(v ?? 0)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-amber-600">{motoboys.nota}</p>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Fretes · Viagens · Corridas</h3>
              <div className="grid grid-cols-2 gap-2">
                {[["Fretes (anúncios)", ft.fretes?.anuncios], ["Fretes demanda 30d", ft.fretes?.demanda_30d],
                  ["Viagens (anúncios)", ft.viagens?.anuncios], ["Viagens demanda 30d", ft.viagens?.demanda_30d],
                  ["Corridas (public)", ft.corridas?.public_rides], ["Cidades c/ demanda", cobertura.cidades_com_demanda]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-lg font-black text-zinc-800">{String(v ?? 0)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-amber-600">{cobertura.nota}</p>
            </div>
          </div>
        )}

        {/* RECOMENDAÇÕES */}
        {aba === "recomendacoes" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!recs.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">
                Sem recomendações. O motor roda de hora em hora (tick :27).
              </div>
            ) : recs.map((r: any, i: number) => (
              <div key={i} className="rounded-3xl border border-cyan-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{r.tipo}</span>
                  <p className="min-w-0 flex-1 font-black text-zinc-800">{r.titulo}</p>
                  <span className="rounded-full bg-orange-600 px-2.5 py-1 text-[10px] font-black text-white">score {r.score}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">conf {r.confianca}%</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">{r.motivo}</p>
              </div>
            ))}
            <p className="text-center text-[11px] text-zinc-400">
              O Logistics AI <b>recomenda</b> captação/expansão/reposicionamento — a execução segue Dispatcher/Automation. Nunca despacha.
            </p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Logistics AI v1.0 · ORION-AI-27 · Logistics Opportunity Score + heatmap + cobertura · read-only ·
          recomenda, nunca despacha · tick :27 · IA só via Gateway + Prompt Registry
        </p>
      </div>
    </div>
  );
}
