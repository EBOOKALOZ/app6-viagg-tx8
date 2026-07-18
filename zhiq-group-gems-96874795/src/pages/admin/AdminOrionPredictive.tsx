/**
 * /admin/orion-predictive — ORION Predictive Intelligence AI (ORION-AI-55)
 *
 * Predictive Center: previsoes EXPLICAVEIS (modelo/confianca/margem/fatores)
 * sobre series reais; churn/comportamento por usuario (heuristica c/ evidencia,
 * sem PII); simulador what-if; acuracia por BACKTEST (MAE). REUSA AI-16/52/54.
 * Serie curta = confianca baixa DECLARADA — nunca inventa.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Sparkles, Loader2, TrendingUp, Users, FlaskConical, Target, Play, CircleGauge } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};
const CL: Record<string, string> = {
  critico: "bg-red-700 text-white", alto: "bg-red-600 text-white", medio: "bg-amber-100 text-amber-700",
  baixo: "bg-sky-100 text-sky-700", muito_baixo: "bg-emerald-100 text-emerald-700",
};
type Aba = "resumo" | "previsoes" | "churn" | "simulador" | "precisao";
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
    <h3 className="mb-2 text-sm font-black text-zinc-700">{title}</h3>{children}
  </div>
);

export default function AdminOrionPredictive() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");
  const [msg, setMsg] = useState("");
  const [mkt, setMkt] = useState(20);
  const [motos, setMotos] = useState(5);
  const [simRes, setSimRes] = useState<any>(null);

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-predictive"], queryFn: () => rpc("predict_dashboard"), refetchInterval: 60000,
  });
  const stats = (dash?.statistics || []) as any[];
  const sc = stats[0] || {};
  const churn = (dash?.churn || []) as any[];
  const comportamento = (dash?.comportamento || []) as any[];
  const trends = (dash?.trends || []) as any[];
  const alerts = (dash?.alerts || []) as any[];
  const accuracy = (dash?.accuracy || []) as any[];
  const dominio = (d: string) => ((dash?.[d] || []) as any[]);

  const narrar = async (promptKey: string, rotulo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("predict_summary");
      const r = await orionAiText("predictive_intelligence", `Pedido: ${rotulo}\nDados: ${JSON.stringify(ctx)}`, { promptKey, maxTokens: 700 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponivel (${r.error}).`);
    } finally { setOcupado(false); }
  };
  const rodar = async () => {
    setOcupado(true); setMsg("");
    try { const r = await rpc("run_predict_check", { p_trace: `painel_${Date.now()}` }); setMsg(`✓ ${r.previsoes} previsoes, ${r.usuarios_pontuados} usuarios pontuados.`); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); } finally { setOcupado(false); }
  };
  const simular = async () => {
    setOcupado(true); setSimRes(null);
    try { const r = await rpc("simulate_future", { p_cenario: { marketing_pct: mkt, motoboys_extras: motos } }); setSimRes(r.resultado); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); } finally { setOcupado(false); }
  };

  const TABS: [Aba, any, string][] = [
    ["resumo", Sparkles, "Resumo Executivo"], ["previsoes", TrendingUp, "Previsoes"],
    ["churn", Users, `Churn & Comportamento${churn.filter((c) => ["alto", "critico"].includes(c.classe)).length ? ` (${churn.filter((c) => ["alto", "critico"].includes(c.classe)).length})` : ""}`],
    ["simulador", FlaskConical, "Simulador"], ["precisao", Target, "Precisao dos Modelos"],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
        <div className="rounded-3xl bg-gradient-to-r from-[#160b24] via-[#7e22ce] to-[#160b24] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <CircleGauge className="h-8 w-8 text-purple-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">ORION Predictive Intelligence AI</h1>
                <span className="rounded-full bg-purple-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ring-purple-300/40">Predictive</span>
              </div>
              <p className="text-sm text-purple-200/80">
                ORION-AI-55 · previsoes explicaveis sobre dados reais · reusa AI-16/52/54 · serie curta = confianca declarada · sem PII
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-200/70">Predictive Score (PIS)</p>
              <p className="text-3xl font-black">{sc.pis ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Acuracia (PAS)", sc.pas], ["Confianca (PCS)", sc.pcs], ["MAE 1d", sc.mae_1d ?? "aguarda historico"],
              ["Previsoes hoje", sc.previsoes], ["Usuarios pontuados", sc.usuarios_pontuados],
              ["Churn alto/critico", churn.filter((c) => ["alto", "critico"].includes(c.classe)).length]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-purple-200/70">{l}</p>
                <p className="truncate text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {TABS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#7e22ce] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
          <button onClick={rodar} disabled={ocupado}
            className="ml-auto flex items-center gap-2 rounded-full bg-purple-700 px-4 py-2 text-sm font-black text-white shadow hover:bg-purple-800 disabled:opacity-50">
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Prever agora
          </button>
        </div>
        {msg && <p className="mt-2 text-[12px] font-bold text-zinc-600">{msg}</p>}
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-purple-600" /></div>}

        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-purple-200 bg-purple-50/40 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["predict.summary", "Resumo das previsoes"], ["predict.forecast", "Explicar modelo"],
                  ["predict.churn", "Plano de retencao"], ["predict.simulation", "Interpretar simulacao"],
                  ["predict.accuracy", "Avaliar acuracia"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l)} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-purple-200 hover:bg-purple-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-purple-100">{narrativa}</p>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Tendencias (variacao real)">
                {trends.map((t: any) => (
                  <div key={t.dedupe_key} className="mb-1.5 flex items-center gap-2 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${t.direcao === "alta" ? "bg-emerald-100 text-emerald-700" : t.direcao === "queda" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>{t.direcao}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-700">{t.descricao}</span>
                  </div>
                ))}
              </Card>
              <Card title="Alertas preditivos (14d)">
                {!alerts.length ? <p className="text-xs text-zinc-400">Nenhum alerta.</p> : alerts.map((a: any) => (
                  <div key={a.id} className="mb-1.5 flex items-center gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${a.severidade === "critica" ? "bg-red-700 text-white" : "bg-amber-100 text-amber-700"}`}>{a.severidade}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-700">{a.alerta}</span>
                  </div>
                ))}
              </Card>
            </div>
          </div>
        )}

        {aba === "previsoes" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {["crescimento", "receita", "demanda", "expansao", "financeiro", "capacidade"].map((d) => (
              <Card key={d} title={`🔮 ${d}`}>
                {dominio(d).map((f: any, i: number) => (
                  <div key={i} className="mb-1 flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-zinc-600">{f.alvo.replace(/_/g, " ")} · {f.horizonte_dias}d</span>
                    <span className="font-black text-zinc-800">{Number(f.valor_projetado).toLocaleString("pt-BR")}</span>
                    <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold text-purple-700">conf {f.confianca}</span>
                  </div>
                ))}
                {!dominio(d).length && <p className="text-xs text-zinc-400">Sem previsoes.</p>}
              </Card>
            ))}
            <p className="col-span-full text-[11px] text-amber-600">Modelo: regressao linear sobre series reais · margem de erro por tamanho da serie · clima/feriados/CEP/bairro DECLARADOS (sem dados).</p>
          </div>
        )}

        {aba === "churn" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card title="Risco de churn por usuario (sem PII)">
              {churn.map((c: any, i: number) => (
                <div key={i} className="mb-1.5 rounded-2xl bg-slate-50/60 p-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-[10px] text-zinc-400">{c.user}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${CL[c.classe] || ""}`}>{c.classe}</span>
                    <span className="font-black text-zinc-700">{c.prob}%</span>
                    <span className="ml-auto text-[10px] text-zinc-400">inativo {c.fatores?.dias_inativo}d · {c.fatores?.cliques_30d} cliques</span>
                  </div>
                  <p className="text-[10px] text-emerald-700">➜ {c.rec}</p>
                </div>
              ))}
            </Card>
            <Card title="Predicao comportamental">
              {comportamento.map((c: any, i: number) => (
                <div key={i} className="mb-1 flex items-center gap-2 text-xs">
                  <span className="font-mono text-[10px] text-zinc-400">{c.user}</span>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{c.tipo}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${CL[c.classe] || ""}`}>{c.classe}</span>
                  <span className="ml-auto font-black text-zinc-700">{c.prob}%</span>
                </div>
              ))}
            </Card>
          </div>
        )}

        {aba === "simulador" && !isLoading && (
          <div className="mt-4 space-y-4">
            <Card title="What-if: simule um cenario">
              <div className="flex flex-wrap items-end gap-4">
                <label className="text-xs font-bold text-zinc-600">Marketing +%
                  <input type="number" value={mkt} onChange={(e) => setMkt(Number(e.target.value))}
                    className="mt-1 block w-24 rounded-2xl border border-zinc-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-bold text-zinc-600">Motoboys extras
                  <input type="number" value={motos} onChange={(e) => setMotos(Number(e.target.value))}
                    className="mt-1 block w-24 rounded-2xl border border-zinc-200 px-3 py-2 text-sm" />
                </label>
                <button onClick={simular} disabled={ocupado}
                  className="rounded-full bg-purple-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                  {ocupado ? "…" : "Simular"}
                </button>
              </div>
              {simRes && (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[["Cliques 30d", simRes.cliques_projetados_30d], ["Receita 30d (R$)", simRes.receita_projetada_30d_brl],
                    ["Corridas/dia extras", simRes.capacidade_corridas_dia_extra]].map(([l, v]: any) => (
                    <div key={l} className="rounded-2xl bg-purple-50 p-3 text-center">
                      <p className="text-[10px] font-bold uppercase text-purple-400">{l}</p>
                      <p className="text-xl font-black text-purple-800">{String(v)}</p>
                    </div>
                  ))}
                  <p className="col-span-full text-[10px] text-zinc-400">{simRes.modelo} · {simRes.nota}</p>
                </div>
              )}
            </Card>
            <Card title="Simulacoes anteriores (log imutavel)">
              {(dash?.simulations || []).map((s: any) => (
                <div key={s.id} className="mb-1 flex items-center gap-2 text-[11px]">
                  <span className="font-mono text-zinc-400">{String(s.criado_em).slice(5, 16).replace("T", " ")}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-600">{JSON.stringify(s.cenario)}</span>
                </div>
              ))}
            </Card>
          </div>
        )}

        {aba === "precisao" && !isLoading && (
          <div className="mt-4 space-y-3">
            <Card title="Backtest previsto x realizado (MAE)">
              {!accuracy.length ? (
                <p className="py-4 text-center text-sm text-zinc-400">Aguardando historico — o backtest compara cada previsao de 1 dia com o realizado do dia seguinte, automaticamente.</p>
              ) : accuracy.map((a: any, i: number) => (
                <div key={i} className="mb-1 flex items-center gap-2 text-xs">
                  <span className="font-mono text-zinc-400">{a.alvo_data}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-600">{a.alvo}</span>
                  <span className="text-zinc-500">prev {Number(a.previsto).toFixed(1)} · real {Number(a.realizado).toFixed(1)}</span>
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-black text-purple-700">erro {Number(a.erro_abs).toFixed(1)}</span>
                </div>
              ))}
            </Card>
            <p className="text-[11px] text-zinc-400">Suite: <code className="rounded bg-zinc-100 px-1">SELECT predict_selftest()</code> — 14 checks (COMANDO TESTE). PAS cresce conforme o MAE cai com historico real.</p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Predictive Intelligence AI v1.0 · ORION-AI-55 · previsoes explicaveis (modelo/confianca/margem/fatores) · backtest MAE ·
          churn/comportamento com evidencia · simulador what-if (elasticidades declaradas) · reusa AI-16/52/54 · tick 10 min · IA so via Gateway
        </p>
      </div>
    </div>
  );
}
