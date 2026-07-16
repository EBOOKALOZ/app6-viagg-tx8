/**
 * /admin/orion-trust — ORION Trust & Reputation AI (ORION-AI-20)
 *
 * Camada oficial de confiança: Trust Score EXPLICÁVEL (fatores
 * ponderados) por comprador/conta/lojista/anúncio, alertas de risco e
 * ranking. Não bloqueia — recomenda. Read-only sobre as fontes; só o
 * motor atualiza o score. IA só via Gateway + Prompt Registry.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { ShieldCheck, Loader2, Sparkles, Trophy, AlertTriangle } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const SEV: Record<string, string> = {
  alta: "bg-red-600 text-white", media: "bg-amber-100 text-amber-700", baixa: "bg-sky-100 text-sky-700",
};
const scoreColor = (s: number) => s >= 70 ? "text-emerald-600" : s >= 45 ? "text-amber-600" : "text-red-600";

type Aba = "visao" | "rankings" | "alertas";

export default function AdminOrionTrust() {
  const [aba, setAba] = useState<Aba>("visao");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-trust"], queryFn: () => rpc("trust_dashboard"), refetchInterval: 60000,
  });

  const score = dash?.score || {};
  const metrics = dash?.metrics || {};
  const timeline = (dash?.timeline || []) as any[];
  const alertas = (dash?.alertas || []) as any[];
  const rankings: [string, any[]][] = [
    ["Compradores", dash?.ranking_buyers || []], ["Lojistas", dash?.ranking_merchants || []],
    ["Anúncios", dash?.ranking_listings || []], ["Contas", dash?.ranking_accounts || []],
  ];
  const medioPorTipo = (score.trust_medio_por_tipo || {}) as Record<string, any>;

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("trust_summary");
      const r = await orionAiText("trust", `Tipo: ${tipo}\nDados reais de confiança: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 550 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const kpis: [string, any][] = [
    ["Trust médio", score.trust_medio_geral], ["Entidades", score.entidades_avaliadas],
    ["Alertas 14d", score.alertas_abertos_14d], ["Snapshots", metrics.snapshots],
    ["Pagamentos", metrics.fontes?.pagamentos], ["Anúncios", metrics.fontes?.anuncios],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0b1e3b] via-[#1e3a8a] to-[#0b1e3b] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <ShieldCheck className="h-8 w-8 text-indigo-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Trust &amp; Reputation AI</h1>
              <p className="text-sm text-indigo-200/80">
                ORION-AI-20 · confiança explicável · recomenda, nunca bloqueia
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-200/70">Trust médio</p>
              <p className="text-3xl font-black">{score.trust_medio_geral ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {kpis.map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-indigo-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["visao", Sparkles, "Visão geral"], ["rankings", Trophy, "Rankings"],
             ["alertas", AlertTriangle, `Alertas${alertas.length ? ` (${alertas.length})` : ""}`]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#1e3a8a] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "visao" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["trust.executive", "Resumo executivo"], ["trust.alerts", "Alertas"],
                  ["trust.summary", "Panorama"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-indigo-200 hover:bg-indigo-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-indigo-100">{narrativa}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Trust médio por entidade</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(medioPorTipo).map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{k}</p>
                    <p className={`text-2xl font-black ${scoreColor(Number(v))}`}>{v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">{score.formula}</p>
              {score.cobertura?.avaliacoes_denuncias && (
                <p className="mt-1 text-[10px] text-amber-600">
                  Cobertura: avaliações/denúncias — {score.cobertura.avaliacoes_denuncias}; entrega — {score.cobertura?.delivery?.status}
                </p>
              )}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Evolução (trust médio por dia)</h3>
              {!timeline.length ? (
                <p className="text-xs text-zinc-400">Sem histórico ainda — snapshots acumulam a cada dia (tick :48).</p>
              ) : (
                <div className="flex items-end gap-1.5">
                  {timeline.map((t: any) => (
                    <div key={t.dia} className="flex flex-1 flex-col items-center gap-1">
                      <div className="w-full rounded-t bg-indigo-500" style={{ height: `${Math.max(4, (t.trust_medio || 0) * 0.8)}px` }} title={`${t.dia}: ${t.trust_medio}`} />
                      <span className="text-[8px] text-zinc-400">{String(t.dia).slice(5)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* RANKINGS */}
        {aba === "rankings" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {rankings.map(([label, arr]) => (
              <div key={label} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">{label} <span className="text-zinc-400">({arr.length})</span></h3>
                {!arr.length ? (
                  <p className="text-xs text-zinc-400">Sem dados.</p>
                ) : arr.slice(0, 10).map((r: any) => (
                  <div key={r.entidade_id} className="mb-1.5 flex items-center gap-2">
                    <span className={`w-8 text-right text-sm font-black ${scoreColor(r.score)}`}>{r.score}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-500">{r.entidade_id}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-bold text-zinc-400">conf {r.confianca}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ALERTAS */}
        {aba === "alertas" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!alertas.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">
                🛡️ Nenhum alerta de risco. O motor roda de hora em hora (tick :48).
              </div>
            ) : alertas.map((a: any, i: number) => (
              <div key={i} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${SEV[a.severidade] || ""}`}>{a.severidade}</span>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{a.tipo_risco}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{a.entidade_tipo}</span>
                  <span className="ml-auto rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-black text-white">risco {a.score_risco}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-700">{a.motivo}</p>
                <p className="mt-0.5 font-mono text-[10px] text-zinc-300">{a.entidade_id}</p>
              </div>
            ))}
            <p className="text-center text-[11px] text-zinc-400">
              O ORION Trust AI <b>recomenda</b> ação humana — <b>nunca bloqueia automaticamente</b>. Toda decisão é explicável.
            </p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Trust &amp; Reputation AI v1.0 · ORION-AI-20 · score explicável (fatores ponderados) · read-only ·
          só o motor atualiza · recomenda, não bloqueia · tick :48 · IA só via Gateway + Prompt Registry
        </p>
      </div>
    </div>
  );
}
