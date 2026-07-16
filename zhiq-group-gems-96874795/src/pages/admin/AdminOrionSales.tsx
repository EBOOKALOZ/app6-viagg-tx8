/**
 * /admin/orion-sales — ORION Sales AI (ORION-AI-25)
 *
 * Centro Inteligente de Vendas: converte interesse em venda. Funil,
 * oportunidades com Sales Opportunity Score (0-100 explicável),
 * conversão por categoria e recuperação de carrinho. Analisa e
 * RECOMENDA — nunca fecha venda. Read-only. IA via Gateway + Registry.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { HandCoins, Loader2, Sparkles, Filter, Target, RotateCcw } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const brl = (v: any) => v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR")}`;
const EST: Record<string, string> = {
  pronto_para_fechar: "bg-emerald-600 text-white", negociacao: "bg-amber-100 text-amber-700", interesse: "bg-sky-100 text-sky-700",
};
const scoreColor = (s: number) => s >= 70 ? "text-emerald-600" : s >= 45 ? "text-amber-600" : "text-sky-600";

type Aba = "visao" | "oportunidades" | "conversao" | "recuperacao";

export default function AdminOrionSales() {
  const [aba, setAba] = useState<Aba>("visao");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-sales"], queryFn: () => rpc("sales_dashboard"), refetchInterval: 60000,
  });

  const score = dash?.score || {};
  const funil = dash?.funil || {};
  const etapas = (funil.etapas || {}) as Record<string, any>;
  const oportunidades = (dash?.oportunidades || []) as any[];
  const conversao = dash?.conversao || {};
  const recuperacao = dash?.recuperacao || {};

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("sales_summary");
      const r = await orionAiText("sales", `Tipo: ${tipo}\nDados comerciais reais: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 600 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const kpis: [string, any][] = [
    ["Sales Score", score.sales_score], ["Leads quentes", score.leads_quentes],
    ["Pipeline", brl(score.valor_pipeline)], ["Conversão 30d", `${score.conversao_30d_pct ?? 0}%`],
    ["Intenções ativas", etapas.intencao_ativa], ["Compras 30d", etapas.compra_paga],
  ];

  const funnelStages: [string, any][] = [
    ["Visitantes", etapas.visitantes], ["Interesse", etapas.interesse],
    ["Intenção ativa", etapas.intencao_ativa], ["Convertido", etapas.convertido], ["Compra paga", etapas.compra_paga],
  ];
  const maxStage = Math.max(1, ...funnelStages.map(([, v]) => Number(v) || 0));

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#052e24] via-[#047857] to-[#052e24] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <HandCoins className="h-8 w-8 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Sales AI</h1>
              <p className="text-sm text-emerald-200/80">
                ORION-AI-25 · converte interesse em venda · Sales Opportunity Score · recomenda, nunca fecha
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">Sales Score</p>
              <p className="text-3xl font-black">{score.sales_score ?? "—"}</p>
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
          {([["visao", Sparkles, "Pipeline"], ["oportunidades", Target, `Oportunidades${oportunidades.length ? ` (${oportunidades.length})` : ""}`],
             ["conversao", Filter, "Conversão"], ["recuperacao", RotateCcw, "Recuperação"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#047857] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>}

        {/* PIPELINE / VISÃO */}
        {aba === "visao" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["sales.summary", "Panorama"], ["sales.pipeline", "Funil"],
                  ["sales.opportunity", "Oportunidades"], ["sales.conversion", "Conversão"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-emerald-200 hover:bg-emerald-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-emerald-100">{narrativa}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-black text-zinc-700">Funil de vendas (30d)</h3>
              <div className="space-y-2">
                {funnelStages.map(([l, v]) => (
                  <div key={l} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-xs font-bold text-zinc-500">{l}</span>
                    <div className="h-6 flex-1 rounded-lg bg-slate-100">
                      <div className="flex h-6 items-center rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-2 text-[11px] font-black text-white"
                        style={{ width: `${Math.max(8, (Number(v) || 0) * 100 / maxStage)}%` }}>{String(v ?? 0)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">
                Interesse→conversão: {funil.taxa_interesse_para_conversao_pct ?? "—"}% · componentes: {Object.entries((score.componentes || {}) as Record<string, any>).map(([k, v]) => `${k} ${v}`).join(" · ")}
              </p>
            </div>
          </div>
        )}

        {/* OPORTUNIDADES */}
        {aba === "oportunidades" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!oportunidades.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">
                Sem oportunidades. O motor pontua de hora em hora (tick :43).
              </div>
            ) : oportunidades.map((o: any, i: number) => (
              <div key={i} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black ${scoreColor(o.score)} bg-slate-50`}>{o.score}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black text-zinc-800">{o.vertical}{o.cidade ? ` · ${o.cidade}` : ""} <span className="text-zinc-400">({o.tipo})</span></p>
                    <p className="truncate text-[11px] text-zinc-500">{o.motivo}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${EST[o.estagio] || ""}`}>{o.estagio?.replaceAll("_", " ")}</span>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700">~ {brl(o.valor_estimado)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries((o.fatores || {}) as Record<string, any>).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">{k.replaceAll("_", " ")}: {v}</span>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-center text-[11px] text-zinc-400">
              Sales Opportunity Score (0-100) prioriza os leads mais promissores. O Sales AI <b>recomenda</b> — o fechamento é humano.
            </p>
          </div>
        )}

        {/* CONVERSÃO */}
        {aba === "conversao" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Conversão por vertical (30d)</h3>
              {((conversao.por_vertical || []) as any[]).map((v: any) => (
                <div key={v.vertical} className="mb-1.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-xs font-semibold text-zinc-600">{v.vertical}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{v.convertido}/{v.total}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${Number(v.taxa_pct) >= 50 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{v.taxa_pct ?? 0}%</span>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Conversão por cidade (30d)</h3>
              {Object.entries((conversao.por_cidade || {}) as Record<string, any>).map(([k, v]) => (
                <div key={k} className="mb-1.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-xs font-semibold text-zinc-600">{k}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">{v}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RECUPERAÇÃO */}
        {aba === "recuperacao" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[["Carrinhos abertos", recuperacao.carrinhos_abertos], ["Com itens", recuperacao.com_itens],
                ["Valor em aberto", brl(recuperacao.valor_em_aberto)]].map(([l, v]: any) => (
                <div key={l} className="rounded-2xl border border-zinc-100 bg-white p-3 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-lg font-black text-zinc-800">{String(v)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-amber-100 bg-amber-50/50 p-4 text-xs text-amber-700">
              {recuperacao.nota}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Sales AI v1.0 · ORION-AI-25 · funil + Sales Opportunity Score + recuperação · read-only ·
          recomenda, nunca fecha venda · tick :43 · IA só via Gateway + Prompt Registry
        </p>
      </div>
    </div>
  );
}
