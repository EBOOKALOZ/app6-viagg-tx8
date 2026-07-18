/**
 * /admin/orion-auction-intelligence — ORION Auction Intelligence & Market Analytics (ORION-AI-67)
 *
 * Centro analítico READ-ONLY do ecossistema de leilões. Data-driven: computa só
 * dados reais e DECLARA base estatística insuficiente quando o volume é baixo
 * (nº de registros + nível de confiança em toda saída via `_auditoria`).
 * Não altera leilões/lances/comissões/créditos — função exclusivamente analítica.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Gavel, Loader2, Gauge, TrendingUp, Zap, BarChart3, Map, Sparkles } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const brl = (v: any) => v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
const CONF: Record<string, string> = {
  alta: "bg-emerald-100 text-emerald-700", media: "bg-lime-100 text-lime-700",
  baixa: "bg-amber-100 text-amber-700", muito_baixa: "bg-orange-100 text-orange-700", insuficiente: "bg-red-100 text-red-700",
};

function AuditBadge({ audit }: { audit: any }) {
  if (!audit) return null;
  const label = audit.confianca_label || "—";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${CONF[label] || "bg-slate-100 text-slate-600"}`}>
      {audit.base_estatistica_suficiente ? "✓" : "⚠"} {label} · n={audit.registros_utilizados} · conf {audit.nivel_confianca}
    </span>
  );
}

type Aba = "resumo" | "mercado" | "lances" | "bi" | "heatmap" | "reco";

export default function AdminOrionAuctionIntelligence() {
  const [aba, setAba] = useState<Aba>("resumo");

  const { data: sum, isLoading } = useQuery({ queryKey: ["auction-intel-sum"], queryFn: () => rpc("auction_intel_summary"), refetchInterval: 60000 });
  const { data: score } = useQuery({ queryKey: ["auction-intel-score"], queryFn: () => rpc("auction_intel_score") });

  const market = sum?.market || {};
  const bids = sum?.bids || {};
  const price = sum?.price || {};
  const bi = sum?.bi || {};
  const rankings = sum?.rankings || {};
  const heatmap = sum?.heatmap || {};
  const predict = sum?.predict || {};
  const seller = sum?.seller_reco || {};
  const vol = sum?.volumes || {};

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#1a1206] via-[#3a2a0e] to-[#1a1206] p-6 text-white shadow-xl ring-1 ring-amber-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/30">
              <Gavel className="h-8 w-8 text-amber-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Auction Intelligence & Market Analytics</h1>
              <p className="text-sm text-slate-300/80">ORION-AI-67 · analítico read-only · data-driven · nunca inventa estatística</p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-amber-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200/70">Analytics Score</p>
              <p className="text-4xl font-black text-amber-300">{score?.analytics_score ?? "—"}</p>
              <p className="text-[11px] font-bold text-amber-200/80">read-only {score?.read_only_compliance ? "✓" : "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Leilões", vol.leiloes], ["Lances", vol.lances], ["Settlements", vol.settlements], ["Comissões", vol.comissoes]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* BANNER de prontidão de dados */}
        {score?.aviso_dados && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
            ⚠ {score.aviso_dados} <span className="font-normal">(data readiness {score.data_readiness_score}/100)</span>
          </div>
        )}

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Gauge, "Visão Geral"], ["mercado", TrendingUp, "Mercado & Preço"], ["lances", Zap, "Lances & Predição"],
             ["bi", BarChart3, "BI & Rankings"], ["heatmap", Map, "Heat Map"], ["reco", Sparkles, "Recomendações"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#3a2a0e] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Ticket médio nacional", brl(market.ticket_medio_nacional)], ["Taxa de conversão", `${market.taxa_conversao_pct ?? 0}%`],
                ["Índice de liquidez", `${market.indice_liquidez_pct ?? 0}%`], ["GMV", brl(bi.gmv)]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-xl font-black text-amber-700">{v}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-zinc-700">Auditoria da análise de mercado</h3>
                <AuditBadge audit={market._auditoria} />
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">{market._auditoria?.aviso || "Base adequada."}</p>
              <p className="mt-1 text-[10px] text-zinc-400">Fonte: {market._auditoria?.fonte} · última atualização: {market._auditoria?.ultima_atualizacao ? String(market._auditoria.ultima_atualizacao).slice(0, 19).replace("T", " ") : "—"}</p>
            </div>
          </div>
        )}

        {/* MERCADO & PREÇO */}
        {aba === "mercado" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-black text-zinc-700">Market Intelligence</h3><AuditBadge audit={market._auditoria} /></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[["Ticket nacional", brl(market.ticket_medio_nacional)], ["Valor médio arremate", brl(market.valor_medio_arremataco)],
                  ["Receita nacional", brl(market.receita_nacional)], ["Conversão", `${market.taxa_conversao_pct ?? 0}%`], ["Liquidez", `${market.indice_liquidez_pct ?? 0}%`]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center"><p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p><p className="text-base font-black text-zinc-800">{v}</p></div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-black text-zinc-700">Price Intelligence</h3><AuditBadge audit={price._auditoria} /></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[["Preço inicial médio", brl(price.preco_inicial_medio)], ["Preço final médio", brl(price.preco_final_medio)],
                  ["Valorização média", `${price.valorizacao_media_pct ?? 0}%`], ["Incremento médio", brl(price.incremento_medio_configurado)]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center"><p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p><p className="text-base font-black text-zinc-800">{v}</p></div>
                ))}
              </div>
              {price.faixa_abertura_sugerida && (
                <p className="mt-2 text-[11px] text-zinc-500">Faixa de abertura sugerida: {brl(price.faixa_abertura_sugerida.min)} – {brl(price.faixa_abertura_sugerida.max)} (mediana {brl(price.faixa_abertura_sugerida.mediana)})</p>
              )}
              {price.nota && <p className="mt-1 text-[11px] text-amber-600">⚠ {price.nota}</p>}
            </div>
          </div>
        )}

        {/* LANCES & PREDIÇÃO */}
        {aba === "lances" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-black text-zinc-700">Bid Intelligence</h3><AuditBadge audit={bids._auditoria} /></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[["Média lances/leilão", bids.media_lances_por_leilao], ["Participantes médio", bids.participantes_medio],
                  ["% com vencedor", `${bids.pct_encerrados_com_vencedor ?? 0}%`], ["% sem vencedor", `${bids.pct_sem_vencedor ?? 0}%`],
                  ["Horário pico", bids.horario_maior_atividade], ["Dia pico", bids.dia_semana_maior_atividade]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center"><p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p><p className="text-sm font-black text-zinc-800">{String(v ?? "—")}</p></div>
                ))}
              </div>
              {bids.nota_lances && <p className="mt-2 text-[11px] text-red-600">⚠ {bids.nota_lances}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-black text-zinc-700">Predição</h3><AuditBadge audit={predict._auditoria} /></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[["Prob. venda", `${predict.probabilidade_venda_pct ?? 0}%`], ["Risco sem vencedor", `${predict.risco_encerrar_sem_vencedor_pct ?? 0}%`],
                  ["Chance receber lances", `${predict.chance_receber_lances_pct ?? 0}%`], ["Valor provável", brl(predict.valor_provavel_arremataco)],
                  ["Divulgação", predict.necessidade_divulgacao]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center"><p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p><p className="text-sm font-black text-zinc-800">{String(v ?? "—")}</p></div>
                ))}
              </div>
              {predict._auditoria?.aviso && <p className="mt-2 text-[11px] text-amber-600">⚠ {predict._auditoria.aviso}</p>}
            </div>
          </div>
        )}

        {/* BI & RANKINGS */}
        {aba === "bi" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["GMV", brl(bi.gmv)], ["Receita comissões", brl(bi.receita_comissoes)], ["Arremataç. com vencedor", bi.quantidade_arremataco], ["Sem vencedor", bi.quantidade_sem_vencedor]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm"><p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p><p className="text-xl font-black text-amber-700">{String(v ?? 0)}</p></div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🏆 Produtos mais disputados</h3>
              {(rankings.produtos_mais_disputados || []).map((p: any, i: number) => (
                <div key={i} className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{p.titulo}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">{p.lances} lances</span>
                </div>
              ))}
              <h3 className="mb-2 mt-3 text-sm font-black text-zinc-700">🗺️ Estados com mais leilões</h3>
              {(rankings.estados_maior_receita || []).map((e: any, i: number) => (
                <div key={i} className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{e.estado || "(sem)"}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{e.leiloes} leilões</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* HEAT MAP */}
        {aba === "heatmap" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Leilões por estado</h3>
              {Object.entries(heatmap.leiloes_por_estado || {}).map(([s, n]: any) => (
                <div key={s} className="mb-1 flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{s}</span><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">{n}</span></div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Leilões por cidade</h3>
              {Object.entries(heatmap.leiloes_por_cidade || {}).map(([c, n]: any) => (
                <div key={c} className="mb-1 flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{c}</span><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">{n}</span></div>
              ))}
              <p className="mt-2 text-[11px] text-amber-600">⚠ {heatmap.nota}</p>
            </div>
          </div>
        )}

        {/* RECOMENDAÇÕES */}
        {aba === "reco" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-black text-zinc-700">Recomendações ao vendedor</h3><AuditBadge audit={seller._auditoria} /></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[["Preço inicial sugerido", brl(seller.melhor_preco_inicial_sugerido)], ["Incremento sugerido", brl(seller.melhor_incremento_sugerido)],
                ["Duração sugerida", `${seller.melhor_duracao_dias ?? "—"} dias`], ["Prob. sucesso", `${seller.probabilidade_sucesso_pct ?? 0}%`]].map(([l, v]: any) => (
                <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center"><p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p><p className="text-sm font-black text-zinc-800">{v}</p></div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-amber-700">Pacote de divulgação: {seller.necessidade_pacote_divulgacao}</p>
            <p className="mt-1 text-[11px] text-zinc-400">Horário/dia ideais: {seller.melhor_horario}</p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Auction Intelligence & Market Analytics v2.0 · ORION-AI-67 · read-only · data-driven ·
          toda saída com auditoria (n registros + confiança) · nunca inventa estatística · MV refresh :29
        </p>
      </div>
    </div>
  );
}
