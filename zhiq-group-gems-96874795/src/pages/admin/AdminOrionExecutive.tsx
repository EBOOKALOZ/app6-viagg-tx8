/**
 * /admin/orion-executive — ORION Executive AI · CEO Copilot (ORION-AI-30)
 *
 * O cérebro executivo: consulta TODOS os módulos ORION, consolida a
 * inteligência em Executive Score + CEO Intelligence Index (CII), CEO
 * Daily Brief, Decision Matrix e Executive Chat. Analisa/correlaciona/
 * prioriza — nunca executa, nunca inventa (declara lacunas). Read-only.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Gem, Loader2, Sparkles, ListChecks, MessageSquare, TrendingUp, Send } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const PRIO: Record<string, string> = {
  critica: "bg-red-600 text-white", alta: "bg-orange-100 text-orange-700", media: "bg-amber-100 text-amber-700", baixa: "bg-emerald-100 text-emerald-700",
};
const ciiColor = (s: number) => s >= 75 ? "text-emerald-300" : s >= 55 ? "text-amber-300" : "text-red-300";
const brl = (v: any) => v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR")}`;

type Aba = "resumo" | "decisoes" | "oportunidades" | "chat";

export default function AdminOrionExecutive() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-executive"], queryFn: () => rpc("executive_dashboard"), refetchInterval: 60000,
  });

  const score = dash?.score || {};
  const cii = dash?.cii || {};
  const brief = dash?.brief || {};
  const fusion = dash?.fusion || {};
  const decisoes = (dash?.decisoes || []) as any[];
  const riscos = (dash?.riscos || []) as any[];
  const oportunidades = (dash?.oportunidades || []) as any[];
  const roi = dash?.roi || {};

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("executive_summary");
      const r = await orionAiText("executive_copilot", `Tipo: ${tipo}\nInteligência executiva consolidada: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 750 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const perguntar = async () => {
    if (!pergunta.trim()) return;
    setOcupado(true); setResposta("");
    try {
      const ctx = await rpc("executive_summary");
      const r = await orionAiText("executive_copilot",
        `Pergunta do administrador: "${pergunta}"\n\nContexto consolidado (evidências): ${JSON.stringify(ctx)}`,
        { promptKey: "executive.chat", maxTokens: 700 });
      setResposta(r.ok ? String(r.texto) : `IA indisponível (${r.error})`);
    } finally { setOcupado(false); }
  };

  const fusionCards: [string, any][] = [
    ["Growth", fusion.growth], ["Trust", fusion.trust], ["Marketplace", fusion.conversao],
    ["Sales", fusion.sales], ["Customer", fusion.customer_health], ["Logistics", fusion.logistics],
    ["Sustainability", fusion.sustainability], ["Innovation", fusion.innovation],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER — CII em destaque */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0b1220] via-[#1e293b] to-[#0b1220] p-6 text-white shadow-xl ring-1 ring-amber-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/30">
              <Gem className="h-8 w-8 text-amber-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Executive AI · CEO Copilot</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-30 · consulta todos os módulos · analisa e recomenda, nunca executa
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-amber-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200/70">CEO Intelligence Index</p>
              <p className={`text-4xl font-black ${ciiColor(cii.cii)}`}>{cii.cii ?? "—"}</p>
              <p className="text-[11px] font-bold text-amber-200/80">{cii.classificacao} · {cii.tendencia}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Executive Score", score.executive_score], ["Confiança", `${cii.confianca ?? 0}%`],
              ["Receita", brl(brief.receita)], ["Conversão", `${brief.conversao_pct ?? 0}%`],
              ["Situação", brief.situacao], ["IA cache", `${brief.ia_cache_pct ?? 0}%`]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
          {cii.prioridade_maxima && (
            <div className="mt-4 rounded-2xl bg-amber-500/10 p-3 ring-1 ring-amber-500/20">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">🎯 Prioridade máxima</span>
              <p className="text-sm font-bold text-white">{cii.prioridade_maxima}</p>
              <p className="text-[11px] text-amber-200/70">{cii.motivo}</p>
            </div>
          )}
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Sparkles, "Resumo executivo"], ["decisoes", ListChecks, `Decision Matrix${decisoes.length ? ` (${decisoes.length})` : ""}`],
             ["oportunidades", TrendingUp, "Riscos & Oportunidades"], ["chat", MessageSquare, "CEO Chat"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#1e293b] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>}

        {/* RESUMO */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["executive.briefing", "CEO Daily Brief"], ["executive.strategy", "Estratégia"],
                  ["executive.priority", "Prioridades"], ["executive.roi", "ROI"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-slate-100">{narrativa}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Data Fusion — scores dos módulos consultados</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {fusionCards.map(([l, v]) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-xl font-black text-zinc-800">{v ?? "—"}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Componentes do Executive Score</h3>
              <div className="flex flex-wrap gap-1">
                {Object.entries((score.componentes || {}) as Record<string, any>).map(([k, v]: any) => (
                  <span key={k} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${v?.status === "declarado" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                    {k.replaceAll("_", " ")}: {v?.valor ?? "declarado"}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* DECISION MATRIX */}
        {aba === "decisoes" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!decisoes.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">Sem decisões. O motor roda de hora em hora (tick :05).</div>
            ) : decisoes.map((d: any, i: number) => (
              <div key={i} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg">{d.classificacao}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${PRIO[d.prioridade] || ""}`}>{d.prioridade}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{d.categoria}</span>
                  <p className="min-w-0 flex-1 truncate font-black text-zinc-800">{d.titulo}</p>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">{d.motivo}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {[["impacto", d.impacto], ["urgência", d.urgencia], ["ROI", d.roi], ["risco", d.risco]].map(([l, v]: any) => v != null && (
                    <span key={l} className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">{l}: {v}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* RISCOS & OPORTUNIDADES */}
        {aba === "oportunidades" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-red-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-red-700">🚨 Risk Center ({riscos.length})</h3>
              {!riscos.length ? <p className="text-xs text-zinc-400">Nenhum risco crítico.</p> : riscos.map((r: any, i: number) => (
                <div key={i} className="mb-1.5 flex items-center gap-2">
                  <span>{r.classificacao}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{r.titulo}</span>
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">{r.risco}</span>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-emerald-700">💡 Opportunity Center ({oportunidades.length})</h3>
              {!oportunidades.length ? <p className="text-xs text-zinc-400">Sem oportunidades.</p> : oportunidades.map((o: any, i: number) => (
                <div key={i} className="mb-1.5 flex items-center gap-2">
                  <span>{o.classificacao}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{o.titulo}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">{o.impacto}</span>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm md:col-span-2">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Executive ROI</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[["Receita total", brl(roi.receita_total)], ["Receita atribuída", brl(roi.receita_atribuida)],
                  ["IA custo (US$)", roi.ia_custo_total_usd], ["Economia cache", roi.ia_economia_cache]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-base font-black text-zinc-800">{String(v ?? 0)}</p>
                  </div>
                ))}
              </div>
              {roi.roi_ia_qualitativo && <p className="mt-2 text-[11px] text-emerald-600">{roi.roi_ia_qualitativo}</p>}
            </div>
          </div>
        )}

        {/* CEO CHAT */}
        {aba === "chat" && !isLoading && (
          <div className="mt-4 space-y-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-xs text-zinc-500">Pergunte ao CEO Copilot — ele responde consultando todos os módulos, só com evidências.</p>
              <div className="flex flex-wrap gap-2">
                {["Como está a empresa?", "Onde investir?", "Qual cidade crescerá?", "Qual IA gera maior retorno?"].map((q) => (
                  <button key={q} onClick={() => setPergunta(q)} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200">{q}</button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input value={pergunta} onChange={(e) => setPergunta(e.target.value)} onKeyDown={(e) => e.key === "Enter" && perguntar()}
                  placeholder="Pergunte ao CEO Copilot…"
                  className="flex-1 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-slate-400" />
                <button onClick={perguntar} disabled={ocupado || !pergunta.trim()}
                  className="flex items-center gap-1 rounded-2xl bg-[#1e293b] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
                  {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Perguntar
                </button>
              </div>
              {resposta && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm text-zinc-800 ring-1 ring-slate-100">{resposta}</p>}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Executive AI · CEO Copilot v1.0 · ORION-AI-30 · Executive Score + CEO Intelligence Index + Decision Matrix + Chat ·
          read-only · analisa/recomenda, nunca executa · tick :05 · IA só via Gateway + Prompt Registry
        </p>
      </div>
    </div>
  );
}
