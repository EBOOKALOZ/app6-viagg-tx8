/**
 * /admin/orion-marketing — ORION Marketing AI (ORION-AI-23)
 *
 * Cérebro de marketing: segmenta públicos, recomenda campanhas, mede
 * ROI, sugere SEO e faz visitor intelligence — tudo explicável.
 * RECOMENDA e ANALISA; NUNCA envia campanha (execução via Automation
 * AI-21 sob aprovação). Read-only. IA só via Gateway + Prompt Registry.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Megaphone, Loader2, Sparkles, Users, DollarSign, Search, Target } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const brl = (v: any) => v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR")}`;

type Aba = "campanhas" | "segmentos" | "roi" | "seo";

export default function AdminOrionMarketing() {
  const [aba, setAba] = useState<Aba>("campanhas");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-marketing"], queryFn: () => rpc("mkt_dashboard"), refetchInterval: 60000,
  });

  const score = dash?.score || {};
  const segments = (dash?.segments || []) as any[];
  const recs = (dash?.recommendations || []) as any[];
  const roi = dash?.roi || {};
  const visitor = dash?.visitor || {};
  const seo = dash?.seo || {};

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("mkt_summary");
      const r = await orionAiText("marketing", `Tipo: ${tipo}\nDados reais de marketing: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 650 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const kpis: [string, any][] = [
    ["Marketing Score", score.marketing_score], ["Segmentos", score.segmentos_hoje],
    ["Recomendações", score.recomendacoes_hoje], ["Receita atrib.", brl(roi.receita_atribuida)],
    ["Visitantes", visitor.visitantes_unicos], ["Recorrentes", visitor.recorrentes],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#4a0d2e] via-[#be185d] to-[#4a0d2e] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Megaphone className="h-8 w-8 text-pink-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Marketing AI</h1>
              <p className="text-sm text-pink-200/80">
                ORION-AI-23 · campanhas segmentadas explicáveis · recomenda, nunca envia
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-pink-200/70">Marketing Score</p>
              <p className="text-3xl font-black">{score.marketing_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {kpis.map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-pink-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* NARRATIVA IA */}
        <div className="mt-6 rounded-3xl border border-pink-200 bg-pink-50/50 p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {[["marketing.strategy", "Estratégia"], ["marketing.campaign", "Campanhas"],
              ["marketing.segment", "Segmentos"], ["marketing.roi", "ROI"]].map(([pk, l]) => (
              <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-pink-200 hover:bg-pink-100 disabled:opacity-50">
                <Sparkles className="h-3.5 w-3.5" /> {ocupado ? "…" : l}
              </button>
            ))}
          </div>
          {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-pink-100">{narrativa}</p>}
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["campanhas", Target, `Campanhas${recs.length ? ` (${recs.length})` : ""}`], ["segmentos", Users, "Segmentos"],
             ["roi", DollarSign, "ROI"], ["seo", Search, "SEO"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#be185d] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-pink-500" /></div>}

        {/* CAMPANHAS (recomendações) */}
        {aba === "campanhas" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!recs.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">
                Sem recomendações. O motor roda de hora em hora (tick :21).
              </div>
            ) : recs.map((r: any, i: number) => (
              <div key={i} className="rounded-3xl border border-pink-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{r.tipo}</span>
                  <p className="min-w-0 flex-1 font-black text-zinc-800">{r.titulo}</p>
                  <span className="rounded-full bg-pink-600 px-2.5 py-1 text-[10px] font-black text-white">score {r.score}</span>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700">ROI~ {brl(r.roi_estimado)}</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">{r.motivo}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">público: {r.publico_alvo}</span>
                  {((r.canais || []) as string[]).map((c) => (
                    <span key={c} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{c}</span>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-center text-[11px] text-zinc-400">
              O Marketing AI <b>recomenda</b>. A execução é humana ou via Automation AI-21 sob política de aprovação.
            </p>
          </div>
        )}

        {/* SEGMENTOS + VISITOR */}
        {aba === "segmentos" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {segments.map((s: any) => (
                <div key={s.chave} className="flex items-center gap-2 rounded-3xl border border-zinc-100 bg-white p-3 shadow-sm">
                  <span className="rounded-full bg-pink-600 px-2.5 py-1 text-sm font-black text-white">{s.tamanho}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-zinc-800">{s.nome}</p>
                    <p className="truncate text-[11px] text-zinc-400">{s.descricao}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Visitor Intelligence</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[["Únicos", visitor.visitantes_unicos], ["Logados", visitor.logados], ["Anônimos", visitor.anonimos],
                  ["Recorrentes", visitor.recorrentes], ["Novos 7d", visitor.novos_7d]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-lg font-black text-zinc-800">{String(v ?? 0)}</p>
                  </div>
                ))}
              </div>
              {visitor.por_origem && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(visitor.por_origem as Record<string, any>).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{k}: {v}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ROI */}
        {aba === "roi" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[["Receita paga", brl(roi.receita_paga)], ["Receita atribuída", brl(roi.receita_atribuida)],
                ["Touchpoints", roi.touchpoints], ["Conversão", `${roi.conversao_pct ?? 0}%`]].map(([l, v]: any) => (
                <div key={l} className="rounded-2xl border border-zinc-100 bg-white p-3 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-lg font-black text-zinc-800">{String(v)}</p>
                </div>
              ))}
            </div>
            {roi.por_canal && (
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Atribuição por canal / categoria</h3>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(roi.por_canal as Record<string, any>).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{k}: {brl(v)}</span>
                  ))}
                  {Object.entries((roi.por_categoria || {}) as Record<string, any>).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{k}: {v}</span>
                  ))}
                </div>
              </div>
            )}
            {roi.lacunas && (
              <div className="rounded-3xl border border-amber-100 bg-amber-50/50 p-4 text-xs text-amber-700">
                <b>Lacunas declaradas:</b> CAC/CPC/CTR — {roi.lacunas.cac_cpc_ctr}. ROI por campanha — {roi.lacunas.roi_por_campanha}.
              </div>
            )}
          </div>
        )}

        {/* SEO */}
        {aba === "seo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-amber-100 bg-amber-50/50 p-4 text-xs text-amber-700">
              <b>Busca interna:</b> {seo.busca_interna}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Palavras-chave sugeridas (por demanda)</h3>
              <div className="flex flex-wrap gap-2">
                {((seo.palavras_chave_sugeridas || []) as any[]).map((k: any) => (
                  <span key={k.termo} className="rounded-full bg-pink-100 px-3 py-1 text-xs font-black text-pink-700">{k.termo} · {k.demanda}</span>
                ))}
              </div>
              <h4 className="mb-1 mt-3 text-xs font-black text-zinc-500">Cidades-alvo</h4>
              <div className="flex flex-wrap gap-1">
                {((seo.cidades_alvo || []) as string[]).map((c) => (
                  <span key={c} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{c}</span>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-zinc-400">{seo.sugestao}</p>
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Marketing AI v1.0 · ORION-AI-23 · segmentação + campanhas + ROI + SEO + visitor intelligence · read-only ·
          recomenda, nunca envia · tick :21 · IA só via Gateway + Prompt Registry
        </p>
      </div>
    </div>
  );
}
