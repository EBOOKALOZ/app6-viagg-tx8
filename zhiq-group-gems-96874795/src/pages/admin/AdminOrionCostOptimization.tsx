/**
 * /admin/orion-cost-optimization — ORION Cost Optimization AI (ORION-AI-52)
 *
 * Controlador Financeiro Tecnico: custos da plataforma com USO REAL medido
 * (pg sizes, storage.objects, cron) + IA LIDA do AI-37 (nunca recalcula).
 * Custo = uso real x preco unitario CONFIGURADO (declarado/editavel).
 * Recomenda com economia/impacto/risco — NADA e aplicado automaticamente.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Coins, Loader2, Sparkles, PiggyBank, TrendingUp, AlertTriangle, Wallet2, Play } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};
const usd = (v: any) => v == null ? "—" : `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 4 })}`;

type Aba = "resumo" | "custos" | "orcamentos" | "previsoes" | "anomalias" | "recomendacoes";
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
    <h3 className="mb-2 text-sm font-black text-zinc-700">{title}</h3>{children}
  </div>
);

export default function AdminOrionCostOptimization() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");
  const [msg, setMsg] = useState("");

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-cost"], queryFn: () => rpc("cost_dashboard"), refetchInterval: 60000,
  });
  const scores = dash?.scores || {};
  const usage = (dash?.usage_hoje || []) as any[];
  const budgets = (dash?.budgets || []) as any[];
  const forecasts = (dash?.forecasts || []) as any[];
  const anomalies = (dash?.anomalies || []) as any[];
  const recs = (dash?.recommendations || []) as any[];
  const stats = (dash?.statistics || []) as any[];
  const iaMod = (dash?.ia_por_modulo_7d || []) as any[];
  const custoDia = stats[0]?.custo_dia_usd;

  const narrar = async (promptKey: string, rotulo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("cost_summary");
      const r = await orionAiText("cost_optimization", `Pedido: ${rotulo}\nDados reais: ${JSON.stringify(ctx)}`, { promptKey, maxTokens: 700 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponivel (${r.error}).`);
    } finally { setOcupado(false); }
  };
  const rodar = async () => {
    setOcupado(true); setMsg("");
    try { const r = await rpc("run_cost_check", { p_trace: `painel_${Date.now()}` }); setMsg(`✓ Custos atualizados: ${usd(r.custo_dia_usd)}/dia.`); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); } finally { setOcupado(false); }
  };

  const TABS: [Aba, any, string][] = [
    ["resumo", Sparkles, "Resumo"], ["custos", Coins, "Centros de Custo"],
    ["orcamentos", Wallet2, "Orcamentos"], ["previsoes", TrendingUp, "Previsoes"],
    ["anomalias", AlertTriangle, `Anomalias${anomalies.filter((a) => a.status === "aberta").length ? ` (${anomalies.filter((a) => a.status === "aberta").length})` : ""}`],
    ["recomendacoes", PiggyBank, `Recomendacoes${recs.filter((r) => !r.aplicada).length ? ` (${recs.filter((r) => !r.aplicada).length})` : ""}`],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
        <div className="rounded-3xl bg-gradient-to-r from-[#1c1400] via-[#a16207] to-[#1c1400] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Coins className="h-8 w-8 text-amber-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">ORION Cost Optimization AI</h1>
                <span className="rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ring-amber-300/40">Cost</span>
              </div>
              <p className="text-sm text-amber-200/80">
                ORION-AI-52 · custo tecnico da plataforma · uso REAL medido · IA lida do AI-37 · recomenda, NUNCA aplica sozinho
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200/70">Custo hoje</p>
              <p className="text-3xl font-black">{usd(custoDia)}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Otimizacao (COS)", scores.cos], ["Eficiencia (CES)", scores.ces], ["Recursos (RIS)", scores.ris],
              ["Precisao (FAS)", scores.fas], ["Orcamento (BCS)", scores.bcs],
              ["Custo mes", usd(stats[0]?.custo_mes_usd)]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-amber-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {TABS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#a16207] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
          <button onClick={rodar} disabled={ocupado}
            className="ml-auto flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-sm font-black text-white shadow hover:bg-amber-700 disabled:opacity-50">
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Medir agora
          </button>
        </div>
        {msg && <p className="mt-2 text-[12px] font-bold text-zinc-600">{msg}</p>}
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-amber-600" /></div>}

        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["cost.summary", "Resumo de custos"], ["cost.forecast", "Explicar previsoes"], ["cost.optimization", "Otimizar"],
                  ["cost.anomaly", "Anomalias"], ["cost.recommendation", "Plano de economia"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l)} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-amber-200 hover:bg-amber-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-amber-100">{narrativa}</p>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Custo de hoje por servico (medido)">
                {usage.map((u: any) => (
                  <div key={u.servico} className="mb-1.5 flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{u.categoria}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-zinc-700">{u.servico}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${u.fonte === "declarado" ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"}`}>{u.fonte}</span>
                    <span className="font-black text-zinc-800">{usd(u.custo_estimado_usd)}</span>
                  </div>
                ))}
                <p className="mt-2 text-[10px] text-zinc-400">{scores.formula}</p>
              </Card>
              <Card title="Top IAs mais custosas (7d — fonte AI-37/Gateway)">
                {iaMod.map((m: any) => (
                  <div key={m.modulo} className="mb-1 flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-semibold text-zinc-700">{m.modulo}</span>
                    <span className="text-[10px] text-zinc-400">{m.chamadas} ch</span>
                    <span className="font-black text-zinc-800">{usd(m.usd)}</span>
                  </div>
                ))}
              </Card>
            </div>
          </div>
        )}

        {aba === "custos" && !isLoading && (
          <div className="mt-4 space-y-2">
            {(dash?.services || []).map((s: any) => (
              <div key={s.servico} className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm text-sm">
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{s.categoria}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-zinc-700">{s.servico}</span>
                <span className="text-[11px] text-zinc-500">{usd(s.preco_unitario_usd)}/{s.unidade}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${s.fonte === "declarado" ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"}`}>{s.fonte}</span>
              </div>
            ))}
            <p className="text-[11px] text-zinc-400">Precos unitarios sao DECLARADOS (editaveis via SQL); o USO e sempre medido. Novos centros de custo = novo servico.</p>
          </div>
        )}

        {aba === "orcamentos" && !isLoading && (
          <div className="mt-4 space-y-2">
            {budgets.map((b: any) => (
              <div key={b.escopo} className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${b.estourado ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{b.estourado ? "estourado" : "ok"}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-zinc-700">{b.escopo} ({b.periodo})</span>
                  <span className="text-zinc-600">{usd(b.realizado_usd)} / {usd(b.limite_usd)}</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full ${b.estourado ? "bg-red-500" : "bg-amber-500"}`}
                    style={{ width: `${Math.min(100, (Number(b.realizado_usd) / Math.max(0.01, Number(b.limite_usd))) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {aba === "previsoes" && !isLoading && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {forecasts.map((f: any) => (
              <div key={f.horizonte_dias} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                <p className="text-[10px] font-bold uppercase text-zinc-400">{f.horizonte_dias} dias</p>
                <p className="text-xl font-black text-amber-700">{usd(f.custo_projetado_usd)}</p>
                <p className="mt-1 text-[9px] text-zinc-400">media 7d x horizonte</p>
              </div>
            ))}
            <p className="col-span-full text-[11px] text-amber-600">Sazonalidade/crescimento/eventos exigem historico maior — DECLARADO.</p>
          </div>
        )}

        {aba === "anomalias" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!anomalies.length ? <Card title="Anomalias"><p className="py-6 text-center text-sm text-zinc-400">💰 Nenhuma anomalia.</p></Card>
              : anomalies.map((a: any) => (
              <div key={a.id} className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${a.severidade === "critica" ? "bg-red-700 text-white" : "bg-amber-100 text-amber-700"}`}>{a.severidade}</span>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{a.tipo}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${a.status === "aberta" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{a.status}</span>
                  <span className="ml-auto text-[10px] text-zinc-400">{String(a.criado_em).slice(0, 16).replace("T", " ")}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-700">{a.descricao}</p>
              </div>
            ))}
          </div>
        )}

        {aba === "recomendacoes" && !isLoading && (
          <div className="mt-4 space-y-2">
            {recs.map((r: any) => (
              <div key={r.id} className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-amber-600 px-2.5 py-1 text-[10px] font-black text-white">P{r.prioridade}</span>
                  <span className="min-w-0 flex-1 text-sm font-semibold text-zinc-700">{r.titulo}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">economia {usd(r.economia_estimada_usd)}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-500">impacto {r.impacto} · risco {r.risco}{r.aplicada ? " · aplicada" : ""}</p>
              </div>
            ))}
            <p className="text-[11px] text-zinc-400">Suite de testes: <code className="rounded bg-zinc-100 px-1">SELECT cost_selftest()</code> — 12 checks (COMANDO TESTE). Nada e aplicado automaticamente.</p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Cost Optimization AI v1.0 · ORION-AI-52 · uso real medido (pg/storage/cron) · IA lida do AI-37 · precos unitarios declarados ·
          COS/CES/RIS/FAS/BCS explicaveis · forecasts 5 horizontes · nunca expoe credenciais · tick 15 min · IA so via Gateway
        </p>
      </div>
    </div>
  );
}
