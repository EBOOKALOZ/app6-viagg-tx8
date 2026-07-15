/**
 * /admin/orion-conversion — Conversion & Attribution AI (ORION-AI-09)
 *
 * Revenue Intelligence: funil real, 5 modelos de atribuição
 * comparáveis (provados matematicamente), ROI/CAC/LTV com fontes
 * citadas e confiança declarada. Apenas observa e atribui — nunca
 * toca ledger/pagamentos. Zeros por falta de instrumentação são
 * lacuna de medição declarada, nunca maquiada.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Coins, Loader2, Sparkles, Filter, GitCompare, MapPin, Megaphone } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const fmt = (v: any) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Aba = "executive" | "funil" | "atribuicao" | "kpis" | "cidades" | "campanhas";

export default function AdminOrionConversion() {
  const [aba, setAba] = useState<Aba>("executive");
  const [ocupado, setOcupado] = useState("");
  const [narrativa, setNarrativa] = useState("");
  const [comparacao, setComparacao] = useState<any>(null);

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-conversion"], queryFn: () => rpc("conversion_dashboard"), refetchInterval: 60000,
  });

  const funil = dash?.funil || {};
  const roi = dash?.roi || {};
  const cac = dash?.cac || {};
  const ltv = dash?.ltv || {};

  const gerar = async (promptKey: string, ctx: any, tipo: string) => {
    setOcupado("narr"); setNarrativa("");
    try {
      const r = await orionAiText("conversion", `Tipo: ${tipo}\nDados reais: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 550 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(""); }
  };

  const compararModelos = async () => {
    setOcupado("comp");
    try { setComparacao((await rpc("conversion_ai"))?.comparacao_modelos); }
    catch (e: any) { alert("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const ABAS: [Aba, any, string][] = [
    ["executive", Sparkles, "Executive"], ["funil", Filter, "Funil"],
    ["atribuicao", GitCompare, "Atribuição (5 modelos)"], ["kpis", Coins, "ROI · CAC · LTV"],
    ["cidades", MapPin, "Cidades"], ["campanhas", Megaphone, "Campanhas"],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        <div className="rounded-3xl bg-gradient-to-r from-[#3b2f00] via-[#846a00] to-[#3b2f00] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Coins className="h-8 w-8 text-yellow-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">Conversion & Attribution AI</h1>
              <p className="text-sm text-yellow-200/80">
                ORION-AI-09 · Revenue Intelligence · toda receita com atribuição, toda métrica com fonte
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Receita total", fmt(roi.receita_total)], ["Via campanhas", fmt(roi.receita_atribuida_campanhas)],
              ["Orgânica/direta", fmt(roi.receita_organica_direta)],
              ["LTV médio", fmt(ltv.ltv_medio)], ["Recompra", `${ltv.recompra_pct ?? 0}%`],
              ["Touchpoints", dash?.touchpoints_total]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-yellow-200/70">{l}</p>
                <p className="truncate text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {ABAS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold ${aba === k ? "bg-[#846a00] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-yellow-600" /></div>}

        {/* EXECUTIVE */}
        {aba === "executive" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-yellow-200 bg-yellow-50/50 p-4 shadow-sm">
            <button onClick={async () => gerar("conversion.executive", await rpc("conversion_summary"), "executivo")}
              disabled={!!ocupado}
              className="flex items-center gap-1 rounded-xl bg-[#846a00] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
              {ocupado === "narr" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              De onde vem a receita? (IA)
            </button>
            {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-yellow-100">{narrativa}</p>}
            <p className="mt-3 text-[11px] text-zinc-500">
              Regras: nunca recalcula financeiro · nunca toca ledger · zeros de instrumentação são declarados ·
              instrumentação de cliques: chame <code>conversion_track()</code> nos pontos de jornada (adoção incremental).
            </p>
          </div>
        )}

        {/* FUNIL */}
        {aba === "funil" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <div className="space-y-1.5">
              {[["Views (GLM)", funil.views], ["Cliques (GLM)", funil.cliques],
                ["Publicações em grupos", funil.publicacoes], ["Cadastros", funil.cadastros],
                ["Contatos", funil.contatos], ["Pedidos", funil.pedidos],
                ["Pagamentos", funil.pagamentos], ["Receita", fmt(funil.receita)]].map(([l, v]: any, i, arr) => {
                const max = Math.max(...arr.slice(0, 7).map((x: any) => Number(x[1]) || 0), 1);
                const w = typeof v === "number" ? Math.max(4, (v / max) * 100) : 100;
                return (
                  <div key={l} className="flex items-center gap-2">
                    <p className="w-44 shrink-0 text-xs font-bold text-zinc-600">{l}</p>
                    <div className="h-5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                      <div className="flex h-full items-center rounded-full bg-yellow-500 px-2 text-[10px] font-black text-white"
                        style={{ width: `${w}%` }}>{String(v ?? 0)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-zinc-400">{funil.nota} · fontes: {funil.fontes}</p>
            <button onClick={() => gerar("conversion.funnel", funil, "funil")} disabled={!!ocupado}
              className="mt-3 flex items-center gap-1 rounded-xl bg-[#846a00] px-3 py-2 text-xs font-black text-white disabled:opacity-50">
              <Sparkles className="h-3.5 w-3.5" /> Onde o funil vaza? (IA)
            </button>
            {narrativa && aba === "funil" && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-yellow-50 p-3 text-sm text-zinc-800">{narrativa}</p>}
          </div>
        )}

        {/* ATRIBUIÇÃO */}
        {aba === "atribuicao" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs text-zinc-500">
              5 modelos, mesma receita — compare como cada um distribui. Janela: 30 dias antes do pagamento.
              Sem toques de campanha, a receita é <b>orgânica/direta</b> (nunca inventamos origem).
            </p>
            <button onClick={compararModelos} disabled={!!ocupado}
              className="flex items-center gap-1 rounded-xl bg-[#846a00] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
              {ocupado === "comp" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCompare className="h-4 w-4" />}
              Comparar os 5 modelos
            </button>
            {comparacao && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {Object.entries(comparacao as Record<string, any>).map(([modelo, aloc]) => (
                  <div key={modelo} className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase text-zinc-500">{modelo.replace("_", " ")}</p>
                    {Object.entries((aloc || {}) as Record<string, any>).map(([k, v]) => (
                      <p key={k} className="mt-1 truncate text-[11px] text-zinc-600">
                        {k === "organico_direto" ? "🌱 orgânico/direto" : `📣 ${k.slice(0, 17)}…`}: <b>{fmt(v)}</b>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* KPIs */}
        {aba === "kpis" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black text-zinc-700">ROI de divulgação</h3>
              <p className="mt-2 text-2xl font-black text-zinc-800">{roi.roi_campanhas != null ? `${roi.roi_campanhas}%` : "—"}</p>
              <p className="text-xs text-zinc-500">Investimento: {fmt(roi.investimento_divulgacao)} ·
                atribuída: {fmt(roi.receita_atribuida_campanhas)}</p>
              <p className="mt-1 text-[10px] text-zinc-400">{roi.nota} · modelo: {roi.modelo_padrao}</p>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black text-zinc-700">CAC (proxy declarado)</h3>
              <p className="mt-2 text-2xl font-black text-zinc-800">{cac.cac_proxy != null ? fmt(cac.cac_proxy) : "—"}</p>
              <p className="text-xs text-zinc-500">{fmt(cac.investimento_promocao_90d)} ÷ {cac.novos_usuarios_90d} novos usuários (90d)</p>
              <p className="mt-1 text-[10px] text-zinc-400">{cac.fonte} · confiança: {cac.confianca}</p>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black text-zinc-700">LTV</h3>
              <p className="mt-2 text-2xl font-black text-zinc-800">{fmt(ltv.ltv_medio)}</p>
              <p className="text-xs text-zinc-500">Ticket {fmt(ltv.ticket_medio)} · recompra {ltv.recompra_pct}% ·
                lifetime {ltv.lifetime_medio_dias}d · {ltv.pagadores} pagador(es)</p>
              <p className="mt-1 text-[10px] text-zinc-400">{ltv.fonte}</p>
            </div>
            <div className="md:col-span-3">
              <button onClick={() => gerar("conversion.roi", { roi, cac, ltv }, "roi")} disabled={!!ocupado}
                className="flex items-center gap-1 rounded-xl bg-[#846a00] px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                <Sparkles className="h-3.5 w-3.5" /> Interpretar ROI/CAC/LTV (IA)
              </button>
              {narrativa && aba === "kpis" && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-yellow-50 p-3 text-sm text-zinc-800">{narrativa}</p>}
            </div>
          </div>
        )}

        {/* CIDADES */}
        {aba === "cidades" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            {((dash?.cidades || []) as any[]).map((c: any) => (
              <div key={c.cidade} className="mb-1.5 flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-xs font-bold capitalize text-zinc-700">📍 {c.cidade}{c.uf ? ` — ${c.uf}` : ""}</p>
                <span className="text-[10px] text-zinc-400">growth {c.growth_score}</span>
                <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-black text-yellow-700">
                  {c.publicacoes} publicações · {c.contatos} contatos
                </span>
              </div>
            ))}
            <p className="mt-2 text-[11px] text-zinc-400">
              {(((dash?.cidades || [])[0] || {}) as any).nota_receita}
            </p>
          </div>
        )}

        {/* CAMPANHAS */}
        {aba === "campanhas" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            {!((dash?.campanhas || []) as any[]).length ? (
              <p className="p-6 text-center text-sm text-zinc-400">Nenhuma campanha ainda.</p>
            ) : ((dash?.campanhas || []) as any[]).map((c: any, i: number) => (
              <div key={i} className="mb-2 rounded-2xl border border-zinc-100 p-3">
                <p className="text-sm font-bold text-zinc-800">{c.campanha} <span className="text-[10px] text-zinc-400">({c.status})</span></p>
                <p className="text-[11px] text-zinc-500">
                  📍 {c.cidade} · {c.publicacoes} publicações · orçamento previsto R$ {c.orcamento_previsto ?? "—"}
                  {c.metricas?.ctr_pct != null && ` · CTR ${c.metricas.ctr_pct}%`}
                </p>
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          Conversion & Attribution AI v2.0 · ORION-AI-09 · Revenue Intelligence · 5 modelos de atribuição provados ·
          nunca recalcula financeiro · lacunas de medição sempre declaradas
        </p>
      </div>
    </div>
  );
}
