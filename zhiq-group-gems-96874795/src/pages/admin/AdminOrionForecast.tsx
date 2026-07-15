/**
 * /admin/orion-forecast — ORION Demand Forecast AI (ORION-AI-16)
 *
 * Prevê demanda multi-horizonte (pedidos, receita, motoboys) SEMPRE
 * com confiança + erro estimado + base de dados declarados. Valida
 * previsto×realizado (accuracy) com snapshots imutáveis. Nunca
 * inventa nem esconde limitação. Narrativas via Gateway + Registry.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { TrendingUp, Loader2, Sparkles, Target, MapPin, Gauge, History as HistoryIcon } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};
const fmt = (v: any) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Aba = "central" | "previsoes" | "accuracy" | "recomendacoes" | "mapa" | "historico";

export default function AdminOrionForecast() {
  const [aba, setAba] = useState<Aba>("central");
  const [ocupado, setOcupado] = useState("");
  const [narrativa, setNarrativa] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-forecast"], queryFn: () => rpc("forecast_dashboard"), refetchInterval: 60000,
  });

  const score = dash?.score || {};
  const pred = dash?.predictions || {};
  const acc = dash?.accuracy || {};
  const ped = pred.pedidos || {};
  const rec = pred.receita || {};

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado("narr"); setNarrativa("");
    try {
      const ctx = await rpc("forecast_summary");
      const r = await orionAiText("forecast", `Tipo: ${tipo}\nDados reais: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 550 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(""); }
  };

  const ABAS: [Aba, any, string][] = [
    ["central", Sparkles, "Central"], ["previsoes", TrendingUp, "Previsões"],
    ["accuracy", Target, "Previsto × Realizado"], ["recomendacoes", Gauge, "Recomendações"],
    ["mapa", MapPin, "Mapa de Demanda"], ["historico", HistoryIcon, "Histórico"],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        <div className="rounded-3xl bg-gradient-to-r from-[#052e2e] via-[#0d5757] to-[#052e2e] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <TrendingUp className="h-8 w-8 text-teal-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Demand Forecast AI</h1>
              <p className="text-sm text-teal-200/80">
                ORION-AI-16 · previsão de demanda · toda projeção com confiança + erro + base declarados
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-200/70">Forecast Score</p>
              <p className="text-3xl font-black">{score.forecast_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Pedidos 24h", ped.h24], ["Receita 24h", fmt(rec.h24)], ["Pedidos 30d", ped.d30],
              ["Motoboys 24h", pred.motoboys_necessarios_h24], ["Confiança", pred.confianca],
              ["Erro estimado", pred.erro_estimado]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-teal-200/70">{l}</p>
                <p className="truncate text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-teal-200/60">Base: {pred.base_dados} · modelo {pred.modelo_versao}</p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {ABAS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold ${aba === k ? "bg-[#0d5757] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-500" /></div>}

        {/* CENTRAL */}
        {aba === "central" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-teal-200 bg-teal-50/50 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["forecast.executive", "Executivo"], ["forecast.summary", "Tendências"],
                  ["forecast.operations", "Operacional"], ["forecast.finance", "Financeiro"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={!!ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-teal-200 hover:bg-teal-100 disabled:opacity-50">
                    {ocupado === "narr" ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-teal-100">{narrativa}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Componentes do Forecast Score</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {Object.entries((score.componentes || {}) as Record<string, any>).map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{k.replaceAll("_", " ")}</p>
                    <p className="text-lg font-black text-zinc-800">{v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">{score.formula}</p>
            </div>
          </div>
        )}

        {/* PREVISÕES */}
        {aba === "previsoes" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Pedidos previstos <span className="text-[10px] font-normal text-zinc-400">(conf. {pred.confianca} · {pred.erro_estimado})</span></h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[["24h", ped.h24], ["7 dias", ped.d7], ["30 dias", ped.d30], ["90 dias", ped.d90], ["12 meses", ped.m12]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-lg font-black text-zinc-800">{v ?? "—"}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Receita prevista</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[["24h", rec.h24], ["7 dias", rec.d7], ["30 dias", rec.d30], ["90 dias", rec.d90], ["12 meses", rec.m12]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-sm font-black text-zinc-800">{fmt(v)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-amber-100 bg-amber-50/40 p-4 text-xs text-zinc-600">
              <p>🚕 Corridas: {pred.corridas?.status}</p>
              <p className="mt-1">📦 Entregas: {pred.entregas?.status}</p>
              <p className="mt-1">👷 Motoboys 24h: <b>{pred.motoboys_necessarios_h24}</b> — {pred.nota_motoboys}</p>
              <p className="mt-1 text-zinc-400">Fator dia-da-semana (amanhã): ×{pred.fator_dia_semana_amanha}</p>
            </div>
          </div>
        )}

        {/* ACCURACY */}
        {aba === "accuracy" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs text-zinc-500">
              MAE: <b>{acc.mae ?? "—"}</b> · MAPE: <b>{acc.mape_pct != null ? `${acc.mape_pct}%` : "—"}</b> ·
              amostras: {acc.amostras ?? 0}
            </p>
            {!((acc.comparacoes || []) as any[]).length ? (
              <p className="p-6 text-center text-sm text-zinc-400">{acc.nota}</p>
            ) : ((acc.comparacoes || []) as any[]).map((c: any, i: number) => (
              <div key={i} className="mb-1.5 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-3 text-xs">
                <span className="font-bold">{c.para_data}</span>
                <span>{c.metrica}: previsto <b>{c.previsto}</b> · realizado <b>{c.realizado}</b></span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-black ${Number(c.erro_pct) <= 30 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  erro {c.erro_pct ?? "—"}%
                </span>
              </div>
            ))}
          </div>
        )}

        {/* RECOMENDAÇÕES */}
        {aba === "recomendacoes" && !isLoading && (
          <div className="mt-4 space-y-2">
            {(((dash?.recomendacoes || {}).recomendacoes || []) as any[]).map((r: any, i: number) => (
              <div key={i} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <p className="text-sm font-bold">{r.acao.replaceAll("_", " ")}
                  <span className="ml-2 text-[10px] text-zinc-400">confiança {r.confianca}</span></p>
                <p className="mt-1 text-xs text-zinc-600">🎯 {r.objetivo} · 📈 {r.impacto_esperado}</p>
                <p className="mt-0.5 text-[11px] text-zinc-400">dados: {r.dados_utilizados} · {r.justificativa}</p>
              </div>
            ))}
          </div>
        )}

        {/* MAPA */}
        {aba === "mapa" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            {((dash?.mapa || []) as any[]).map((c: any) => (
              <div key={c.cidade} className="mb-1.5 flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-xs font-bold capitalize text-zinc-700">📍 {c.cidade}{c.uf ? ` — ${c.uf}` : ""}</p>
                <span className="text-[10px] text-zinc-400">growth {c.growth_score} · {c.anuncios} anúncios · {c.grupos} grupos</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${c.demanda_relativa === "alta" ? "bg-emerald-100 text-emerald-700" : c.demanda_relativa === "média" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-500"}`}>
                  demanda {c.demanda_relativa}
                </span>
              </div>
            ))}
            <p className="mt-2 text-[11px] text-zinc-400">
              {(((dash?.mapa || [])[0] || {}) as any).confianca}
            </p>
          </div>
        )}

        {/* HISTÓRICO */}
        {aba === "historico" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            {!((dash?.historico || []) as any[]).length ? (
              <p className="p-6 text-center text-sm text-zinc-400">O snapshot diário constrói o histórico de previsões (validação futura).</p>
            ) : ((dash?.historico || []) as any[]).map((h: any, i: number) => (
              <p key={i} className="text-xs text-zinc-600">
                <b>{h.metrica}</b> {h.horizonte} → {h.previsto} para {h.para_data}
                <span className="text-zinc-400"> · conf. {h.confianca} · {h.erro_estimado} · {h.modelo_versao} · {new Date(h.criado_em).toLocaleString("pt-BR")}</span>
              </p>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Demand Forecast AI v1.0 · ORION-AI-16 · toda previsão declara confiança + erro + base ·
          snapshots imutáveis validam previsto×realizado · nunca inventa, nunca esconde limitação
        </p>
      </div>
    </div>
  );
}
