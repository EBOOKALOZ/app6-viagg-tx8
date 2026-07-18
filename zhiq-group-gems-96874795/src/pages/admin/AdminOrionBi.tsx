/**
 * /admin/orion-bi — ORION Business Intelligence AI (ORION-AI-54)
 *
 * DW executivo: facts+KPIs+insights+forecasts com evidencia, so dados REAIS.
 * REUSA o AI-22 (le orion_bi_kpis — rota /admin/orion-business-intelligence e
 * dele) e o AI-52 (custos). KPI com valor NULL = DECLARADO (pre-lancamento).
 * Sem PII (regra AI-48): apenas agregados.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { LineChart, Loader2, Sparkles, Gauge, Lightbulb, TrendingUp, Bell, Play, Database } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};
const fmt = (v: any, u?: string) => v == null ? "—" : `${Number(v).toLocaleString("pt-BR")}${u === "%" ? "%" : u === "BRL" ? "" : ""}`;

type Aba = "resumo" | "kpis" | "dominios" | "insights" | "forecast" | "alertas";
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
    <h3 className="mb-2 text-sm font-black text-zinc-700">{title}</h3>{children}
  </div>
);
const TIPO: Record<string, string> = {
  gargalo: "bg-red-100 text-red-700", risco: "bg-red-100 text-red-700",
  oportunidade: "bg-emerald-100 text-emerald-700", tendencia: "bg-sky-100 text-sky-700",
  recomendacao: "bg-amber-100 text-amber-700",
};

export default function AdminOrionBi() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");
  const [msg, setMsg] = useState("");

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-bi54"], queryFn: () => rpc("biz_dashboard"), refetchInterval: 60000,
  });
  const scores = dash?.scores || {};
  const facts = (dash?.facts || []) as any[];
  const kpis = (dash?.kpis || []) as any[];
  const insights = (dash?.insights || []) as any[];
  const forecasts = (dash?.forecasts || []) as any[];
  const alerts = (dash?.alerts || []) as any[];
  const stats = (dash?.statistics || []) as any[];
  const dominios = Array.from(new Set(facts.map((f) => f.dominio)));

  const narrar = async (promptKey: string, rotulo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("biz_summary");
      const r = await orionAiText("business_intelligence", `Pedido: ${rotulo}\nDados reais: ${JSON.stringify(ctx)}`, { promptKey, maxTokens: 700 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponivel (${r.error}).`);
    } finally { setOcupado(false); }
  };
  const rodar = async () => {
    setOcupado(true); setMsg("");
    try { const r = await rpc("run_bi_check", { p_trace: `painel_${Date.now()}` }); setMsg(`✓ DW atualizado: ${r.facts} facts, ${r.kpis} KPIs, ${r.insights} insights.`); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); } finally { setOcupado(false); }
  };

  const TABS: [Aba, any, string][] = [
    ["resumo", Sparkles, "Resumo Executivo"], ["kpis", Gauge, "KPIs"], ["dominios", Database, "Dominios (DW)"],
    ["insights", Lightbulb, `Insights${insights.filter((i) => i.status === "aberto").length ? ` (${insights.filter((i) => i.status === "aberto").length})` : ""}`],
    ["forecast", TrendingUp, "Forecast"], ["alertas", Bell, "Alertas & Historico"],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
        <div className="rounded-3xl bg-gradient-to-r from-[#0a1420] via-[#0e7490] to-[#0a1420] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <LineChart className="h-8 w-8 text-cyan-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">ORION Business Intelligence AI</h1>
                <span className="rounded-full bg-cyan-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ring-cyan-300/40">Business Intelligence</span>
              </div>
              <p className="text-sm text-cyan-200/80">
                ORION-AI-54 · DW executivo · so dados REAIS · reusa AI-22 e AI-52 · KPI nulo = declarado (pre-lancamento) · sem PII
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200/70">Business Perf. (BPS)</p>
              <p className="text-3xl font-black">{scores.bps ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["BI Score (BIS)", scores.bis], ["Growth (MGS)", scores.mgs], ["Financeiro (FHS)", scores.fhs],
              ["Marketing (MPS)", scores.mps], ["Engajamento (UES)", scores.ues],
              ["Receita paga (BRL)", stats[0]?.receita_dia_brl]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-cyan-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {TABS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#0e7490] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
          <button onClick={rodar} disabled={ocupado}
            className="ml-auto flex items-center gap-2 rounded-full bg-cyan-700 px-4 py-2 text-sm font-black text-white shadow hover:bg-cyan-800 disabled:opacity-50">
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Consolidar agora
          </button>
        </div>
        {msg && <p className="mt-2 text-[12px] font-bold text-zinc-600">{msg}</p>}
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-cyan-600" /></div>}

        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-cyan-200 bg-cyan-50/40 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["executive.dashboard", "Briefing executivo"], ["business.summary", "Saude do negocio"],
                  ["business.insight", "Analisar insights"], ["business.recommendation", "Priorizar decisoes"],
                  ["business.kpi", "Explicar KPIs"], ["business.forecast", "Explicar forecast"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l)} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-cyan-200 hover:bg-cyan-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-cyan-100">{narrativa}</p>}
            </div>
            <Card title="Insights prioritarios (com evidencia)">
              {insights.filter((i) => i.status === "aberto").slice(0, 5).map((i: any) => (
                <div key={i.id} className="mb-2 rounded-2xl bg-slate-50/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-cyan-700 px-2 py-0.5 text-[10px] font-black text-white">P{i.prioridade}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${TIPO[i.tipo] || ""}`}>{i.tipo}</span>
                    <span className="min-w-0 flex-1 text-sm font-semibold text-zinc-700">{i.titulo}</span>
                  </div>
                  {i.detalhe && <p className="mt-1 text-[11px] text-zinc-500">➜ {i.detalhe}</p>}
                </div>
              ))}
            </Card>
          </div>
        )}

        {aba === "kpis" && !isLoading && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kpis.map((k: any) => (
              <div key={k.kpi} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase text-zinc-400">{k.kpi.replace(/_/g, " ")}</p>
                <p className={`text-2xl font-black ${k.valor == null ? "text-zinc-300" : "text-cyan-800"}`}>
                  {k.valor == null ? "declarado" : `${fmt(k.valor)}${k.unidade === "%" ? "%" : k.unidade === "BRL" ? " R$" : ""}`}
                </p>
                <p className="mt-1 text-[10px] text-zinc-400">{k.metodologia}</p>
              </div>
            ))}
          </div>
        )}

        {aba === "dominios" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {dominios.map((d) => (
              <Card key={d} title={`📊 ${d}`}>
                {facts.filter((f) => f.dominio === d).map((f: any) => (
                  <div key={f.chave} className="mb-1 flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-zinc-600">{f.chave.replace(/_/g, " ")}</span>
                    <span className="font-black text-zinc-800">{fmt(f.valor)} <span className="text-[9px] font-normal text-zinc-400">{f.unidade}</span></span>
                  </div>
                ))}
              </Card>
            ))}
          </div>
        )}

        {aba === "insights" && !isLoading && (
          <div className="mt-4 space-y-2">
            {insights.map((i: any) => (
              <div key={i.id} className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-cyan-700 px-2 py-0.5 text-[10px] font-black text-white">P{i.prioridade}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${TIPO[i.tipo] || ""}`}>{i.tipo}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${i.status === "aberto" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{i.status}</span>
                  <span className="ml-auto text-[10px] text-zinc-400">{String(i.atualizado_em).slice(0, 16).replace("T", " ")}</span>
                </div>
                <p className="mt-1 text-sm font-semibold text-zinc-700">{i.titulo}</p>
                {i.detalhe && <p className="text-[11px] text-zinc-500">➜ {i.detalhe}</p>}
              </div>
            ))}
          </div>
        )}

        {aba === "forecast" && !isLoading && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {forecasts.map((f: any, idx: number) => (
              <div key={idx} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                <p className="text-[10px] font-bold uppercase text-zinc-400">{f.kpi.replace(/_/g, " ")} · {f.horizonte_dias}d</p>
                <p className="text-xl font-black text-cyan-800">{fmt(f.valor_projetado)}</p>
                <p className="mt-1 text-[9px] text-zinc-400">{f.base?.metodo}</p>
              </div>
            ))}
            <p className="col-span-full text-[11px] text-amber-600">Historico curto — sazonalidade/crescimento DECLARADOS; projecoes amadurecem com o tempo.</p>
          </div>
        )}

        {aba === "alertas" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card title="Alertas (14d)">
              {!alerts.length ? <p className="text-xs text-zinc-400">Nenhum alerta.</p> : alerts.map((a: any) => (
                <div key={a.id} className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${a.severidade === "alta" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{a.severidade}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-700">{a.alerta}</span>
                </div>
              ))}
            </Card>
            <Card title="Historico de scores">
              {stats.slice(0, 10).map((s: any) => (
                <div key={s.data} className="mb-1 flex items-center gap-2 text-xs">
                  <span className="font-mono text-zinc-400">{s.data}</span>
                  <span className="ml-auto text-zinc-600">BIS {s.bis} · MGS {s.mgs} · FHS {s.fhs} · UES {s.ues}</span>
                </div>
              ))}
              <p className="mt-2 text-[11px] text-zinc-400">Suite: <code className="rounded bg-zinc-100 px-1">SELECT biz_selftest()</code> — 13 checks (COMANDO TESTE).</p>
            </Card>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Business Intelligence AI v1.0 · ORION-AI-54 · DW executivo (facts/KPIs/insights/forecasts) · reusa AI-22 (orion_bi_kpis) e AI-52 (custos) ·
          BIS/MGS/FHS/MPS/UES/BPS explicaveis · so dados reais, lacunas declaradas · sem PII (AI-48) · tick 5 min · IA so via Gateway
        </p>
      </div>
    </div>
  );
}
