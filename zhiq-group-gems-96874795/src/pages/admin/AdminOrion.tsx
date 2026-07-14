/**
 * /admin/orion — ORION · Centro Nacional de Operações (Fase 1)
 *
 * Painel executivo do Organismo de Inteligência Territorial:
 *  - Pergunte à ORION (CORE consolida evidências dos motores + confiança)
 *  - Visão Nacional (ranking dos 5.571 municípios IBGE, score explicável)
 *  - Recomendações explicáveis (motivo, indicadores, confiança, riscos) com decisão
 *  - Alertas operacionais reais · Previsão baseline · Simulador estratégico v1
 *  - Núcleo (sistema nervoso: eventos + aprendizado)
 * Visual próprio claro (não herda o tema escuro do admin).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionPerguntar, type OrionResposta } from "@/lib/orion/orionCore";
import {
  Satellite, Brain, Map, Lightbulb, AlertTriangle, FlaskConical, Activity,
  Loader2, Send, Check, XCircle, RefreshCw, TrendingUp,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const CLASSE_BADGE: Record<string, { label: string; cls: string }> = {
  implantacao_imediata: { label: "Implantação Imediata", cls: "bg-red-100 text-red-700" },
  alta_prioridade:      { label: "Alta Prioridade",      cls: "bg-orange-100 text-orange-700" },
  crescimento_acelerado:{ label: "Crescimento Acelerado",cls: "bg-emerald-100 text-emerald-700" },
  consolidacao:         { label: "Consolidação",         cls: "bg-sky-100 text-sky-700" },
  observacao:           { label: "Observação",           cls: "bg-amber-100 text-amber-700" },
  baixa_prioridade:     { label: "Baixa Prioridade",     cls: "bg-zinc-100 text-zinc-500" },
};

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

type Aba = "nacional" | "recomendacoes" | "alertas" | "simulador" | "nucleo";

export default function AdminOrion() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("nacional");

  /* ── Pergunte à ORION (CORE) ── */
  const [pergunta, setPergunta] = useState("");
  const [pensando, setPensando] = useState(false);
  const [core, setCore] = useState<OrionResposta | null>(null);

  const perguntarOrion = async () => {
    const q = pergunta.trim();
    if (!q || pensando) return;
    setPensando(true); setCore(null);
    try { setCore(await orionPerguntar(q)); }
    catch (e: any) { setCore({ resposta: "⚠️ Não consegui consolidar a análise agora: " + (e?.message || ""), confianca: 0, motores: [] }); }
    finally { setPensando(false); }
  };

  /* ── Dados ── */
  const { data: kpis } = useQuery({ queryKey: ["orion-kpis"], queryFn: () => rpc("orion_kpis"), refetchInterval: 60000 });

  const [uf, setUf] = useState<string>("");
  const [busca, setBusca] = useState("");
  const { data: ranking, isLoading: rankLoading } = useQuery({
    queryKey: ["orion-ranking", uf],
    queryFn: () => rpc("orion_ranking", { p_uf: uf || null, p_limite: 200 }),
  });
  const rankingFiltrado = useMemo(() => {
    const rows = (ranking || []) as any[];
    if (!busca.trim()) return rows;
    const b = busca.toLowerCase();
    return rows.filter(r => String(r.nome).toLowerCase().includes(b));
  }, [ranking, busca]);

  const { data: recomendacoes } = useQuery({
    queryKey: ["orion-recs"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("orion_recomendacoes") as any)
        .select("*").order("criado_em", { ascending: false }).limit(60);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: alertas } = useQuery({ queryKey: ["orion-alertas"], queryFn: () => rpc("orion_alertas"), refetchInterval: 60000 });
  const { data: previsao } = useQuery({ queryKey: ["orion-previsao"], queryFn: () => rpc("orion_prever_demanda") });
  const { data: eventos } = useQuery({ queryKey: ["orion-eventos"], queryFn: () => rpc("orion_eventos_recentes", { p_limite: 40 }), refetchInterval: 30000 });
  const { data: evResumo } = useQuery({ queryKey: ["orion-ev-resumo"], queryFn: () => rpc("orion_eventos_resumo") });

  const [gerando, setGerando] = useState(false);
  const gerarAnalises = async () => {
    setGerando(true);
    try {
      const n = await rpc("orion_gerar_recomendacoes");
      qc.invalidateQueries({ queryKey: ["orion-recs"] });
      qc.invalidateQueries({ queryKey: ["orion-kpis"] });
      alert(`ORION gerou ${n} nova(s) recomendação(ões).`);
    } catch (e: any) { alert("Erro: " + e.message); }
    finally { setGerando(false); }
  };

  const decidir = async (id: string, acao: "aceita" | "rejeitada") => {
    try {
      await rpc("orion_decidir", { p_id: id, p_acao: acao });
      qc.invalidateQueries({ queryKey: ["orion-recs"] });
      qc.invalidateQueries({ queryKey: ["orion-kpis"] });
    } catch (e: any) { alert("Erro: " + e.message); }
  };

  /* ── Simulador ── */
  const [simCidade, setSimCidade] = useState("");
  const [simNovos, setSimNovos] = useState(3);
  const [simResult, setSimResult] = useState<any>(null);
  const [simulando, setSimulando] = useState(false);
  const simular = async () => {
    if (!simCidade.trim()) return;
    setSimulando(true);
    try { setSimResult(await rpc("orion_simular_recrutamento", { p_cidade: simCidade.trim(), p_novos: simNovos })); }
    catch (e: any) { alert("Erro: " + e.message); }
    finally { setSimulando(false); }
  };

  const abas: { id: Aba; label: string; icon: any }[] = [
    { id: "nacional",      label: "Visão Nacional", icon: Map },
    { id: "recomendacoes", label: "Recomendações",  icon: Lightbulb },
    { id: "alertas",       label: "Alertas",        icon: AlertTriangle },
    { id: "simulador",     label: "Previsão & Simulador", icon: FlaskConical },
    { id: "nucleo",        label: "Núcleo",         icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* ═══ Header ═══ */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0B1B3A] via-[#12275a] to-[#0B1B3A] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Satellite className="h-8 w-8 text-sky-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION · Centro Nacional de Operações</h1>
              <p className="text-sm text-sky-200/80">Organismo de Inteligência Territorial — {Number(kpis?.municipios_mapeados || 0).toLocaleString("pt-BR")} municípios mapeados (IBGE)</p>
            </div>
          </div>

          {/* KPIs */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {[
              ["Municípios", kpis?.municipios_mapeados],
              ["Com presença", kpis?.cidades_com_presenca],
              ["Pedidos 30d", kpis?.pedidos_30d],
              ["Alertas", kpis?.alertas],
              ["Recom. pendentes", kpis?.recomendacoes_pendentes],
              ["Recom. aceitas", kpis?.recomendacoes_aceitas],
            ].map(([label, valor]) => (
              <div key={String(label)} className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
                <p className="text-[10px] font-bold uppercase tracking-wider text-sky-200/70">{label}</p>
                <p className="text-xl font-black">{Number(valor || 0).toLocaleString("pt-BR")}</p>
              </div>
            ))}
          </div>

          {/* Pergunte à ORION */}
          <div className="mt-5 rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 shrink-0 text-sky-300" />
              <input
                value={pergunta}
                onChange={(e) => setPergunta(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && perguntarOrion()}
                placeholder='Pergunte à ORION — ex.: "onde devemos expandir primeiro?" ou "qual o maior gargalo hoje?"'
                className="h-10 flex-1 rounded-xl border-0 bg-white/90 px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                disabled={pensando}
              />
              <button
                onClick={perguntarOrion}
                disabled={pensando || !pergunta.trim()}
                className="flex h-10 items-center gap-2 rounded-xl bg-sky-400 px-4 text-sm font-black text-[#0B1B3A] transition-all hover:brightness-110 disabled:opacity-50"
              >
                {pensando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Analisar
              </button>
            </div>
            {core && (
              <div className="mt-3 rounded-xl bg-white/95 p-4 text-sm leading-relaxed text-zinc-800">
                <p className="whitespace-pre-wrap">{core.resposta}</p>
                {core.motores.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-2 text-[11px] text-zinc-500">
                    <span className="font-bold">Motores consultados:</span>
                    {core.motores.map(m => (
                      <span key={m} className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold">{m}</span>
                    ))}
                    <span className="ml-auto font-black text-sky-700">Confiança {Math.round(core.confianca * 100)}%</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ═══ Abas ═══ */}
        <div className="mt-6 flex flex-wrap gap-2">
          {abas.map(a => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                aba === a.id ? "bg-[#0B1B3A] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}
            >
              <a.icon className="h-4 w-4" /> {a.label}
            </button>
          ))}
        </div>

        {/* ═══ VISÃO NACIONAL ═══ */}
        {aba === "nacional" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select value={uf} onChange={(e) => setUf(e.target.value)}
                className="h-9 rounded-xl border border-zinc-200 bg-white px-2 text-sm font-semibold">
                <option value="">Brasil (todas as UFs)</option>
                {UFS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar município..."
                className="h-9 w-56 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-sky-400" />
              <span className="ml-auto text-xs text-zinc-400">Score explicável por porte, densidade e presença real</span>
            </div>
            {rankLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 text-left text-[11px] font-black uppercase tracking-wider text-zinc-400">
                      <th className="py-2 pr-2">#</th><th className="py-2 pr-2">Município</th>
                      <th className="py-2 pr-2">População</th><th className="py-2 pr-2">Presença</th>
                      <th className="py-2 pr-2">Delivery</th><th className="py-2 pr-2">Marketplace</th>
                      <th className="py-2 pr-2">Mobilidade</th><th className="py-2 pr-2">Geral</th>
                      <th className="py-2">Classificação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankingFiltrado.slice(0, 60).map((r: any, i: number) => {
                      const badge = CLASSE_BADGE[r.classificacao] || CLASSE_BADGE.baixa_prioridade;
                      return (
                        <tr key={r.ibge_code} className="border-b border-zinc-50 align-top hover:bg-slate-50/60">
                          <td className="py-2 pr-2 font-black text-zinc-300">{i + 1}</td>
                          <td className="py-2 pr-2">
                            <p className="font-bold">{r.nome} <span className="text-zinc-400">/{r.uf}</span></p>
                            <details className="text-[11px] text-zinc-500">
                              <summary className="cursor-pointer select-none text-sky-600">justificativa</summary>
                              {r.justificativa}
                            </details>
                          </td>
                          <td className="py-2 pr-2 tabular-nums">{Number(r.populacao || 0).toLocaleString("pt-BR")}</td>
                          <td className="py-2 pr-2 text-[11px] text-zinc-500">
                            {r.lojas}🏬 {r.motoboys}🏍️ {r.anuncios}📢
                          </td>
                          <td className="py-2 pr-2 font-bold tabular-nums">{r.score_delivery}</td>
                          <td className="py-2 pr-2 font-bold tabular-nums">{r.score_marketplace}</td>
                          <td className="py-2 pr-2 font-bold tabular-nums">{r.score_mobilidade}</td>
                          <td className="py-2 pr-2 text-base font-black tabular-nums text-[#0B1B3A]">{r.score_geral}</td>
                          <td className="py-2"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${badge.cls}`}>{badge.label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ═══ RECOMENDAÇÕES ═══ */}
        {aba === "recomendacoes" && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-500">Recomendações explicáveis: motivo, indicadores, confiança, riscos e alternativas. Decisões alimentam o ORION LEARN.</p>
              <button onClick={gerarAnalises} disabled={gerando}
                className="flex items-center gap-2 rounded-xl bg-[#0B1B3A] px-4 py-2 text-sm font-black text-white hover:brightness-125 disabled:opacity-50">
                {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Gerar novas análises
              </button>
            </div>
            {!(recomendacoes || []).length && (
              <div className="rounded-3xl border border-dashed border-zinc-200 bg-white p-10 text-center text-zinc-400">
                Nenhuma recomendação ainda — clique em “Gerar novas análises”.
              </div>
            )}
            {(recomendacoes || []).map((r: any) => (
              <div key={r.id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-[10px] font-black uppercase text-indigo-700">{r.motor}</span>
                  {r.cidade && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{r.cidade}{r.uf ? `/${r.uf}` : ""}</span>}
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                    r.status === "pendente" ? "bg-amber-100 text-amber-700" :
                    r.status === "aceita" || r.status === "executada" ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                    {r.status}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.round(r.confianca * 100)}%` }} />
                    </div>
                    <span className="text-xs font-black text-sky-700">{Math.round(r.confianca * 100)}%</span>
                  </div>
                </div>
                <h3 className="mt-2 font-black">{r.titulo}</h3>
                <p className="text-sm text-zinc-700">{r.recomendacao}</p>
                <div className="mt-2 grid gap-2 text-[12px] leading-relaxed text-zinc-600 sm:grid-cols-2">
                  <p><span className="font-black text-zinc-800">Motivo: </span>{r.motivo}</p>
                  <p><span className="font-black text-emerald-700">Benefícios: </span>{r.beneficios}</p>
                  <p><span className="font-black text-red-600">Riscos: </span>{r.riscos}</p>
                  <p><span className="font-black text-indigo-700">Alternativa: </span>{r.alternativas}</p>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">Indicadores: {JSON.stringify(r.indicadores)}</p>
                {r.status === "pendente" && (
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => decidir(r.id, "aceita")}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:brightness-110">
                      <Check className="h-4 w-4" /> Aceitar
                    </button>
                    <button onClick={() => decidir(r.id, "rejeitada")}
                      className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-black text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50">
                      <XCircle className="h-4 w-4" /> Rejeitar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ═══ ALERTAS ═══ */}
        {aba === "alertas" && (
          <div className="mt-4 space-y-3">
            {!((alertas || []) as any[]).length && (
              <div className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/50 p-10 text-center font-bold text-emerald-600">
                ✅ Nenhum gargalo operacional detectado agora.
              </div>
            )}
            {((alertas || []) as any[]).map((a: any, i: number) => (
              <div key={i} className={`rounded-3xl border p-4 shadow-sm ${a.severidade === "alta" ? "border-red-100 bg-red-50/60" : "border-amber-100 bg-amber-50/60"}`}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`h-5 w-5 ${a.severidade === "alta" ? "text-red-500" : "text-amber-500"}`} />
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${a.severidade === "alta" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{a.severidade} · {a.tipo}</span>
                  {a.cidade && <span className="text-xs font-bold text-zinc-500">{a.cidade}</span>}
                </div>
                <p className="mt-1.5 text-sm font-semibold text-zinc-800">{a.mensagem}</p>
              </div>
            ))}
          </div>
        )}

        {/* ═══ PREVISÃO & SIMULADOR ═══ */}
        {aba === "simulador" && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 font-black"><TrendingUp className="h-5 w-5 text-sky-600" /> ORION PREDICT — demanda</h3>
              {previsao ? (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["Pedidos 30d", previsao.pedidos_30d],
                      ["Média/dia", previsao.media_por_dia],
                      ["Hora de pico", `${previsao.hora_pico}h`],
                      ["Próx. 24h (est.)", previsao.estimativa_proximas_24h],
                    ].map(([l, v]) => (
                      <div key={String(l)} className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{l}</p>
                        <p className="text-lg font-black text-[#0B1B3A]">{String(v)}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-400">Confiança {Math.round((previsao.confianca || 0) * 100)}% — {previsao.metodo}</p>
                </div>
              ) : <Loader2 className="mt-4 h-6 w-6 animate-spin text-sky-500" />}
            </div>

            <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 font-black"><FlaskConical className="h-5 w-5 text-indigo-600" /> Simulador: recrutar motoboys</h3>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input value={simCidade} onChange={(e) => setSimCidade(e.target.value)} placeholder="Cidade (ex.: Blumenau)"
                  className="h-10 flex-1 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-indigo-400" />
                <input type="number" min={1} max={100} value={simNovos} onChange={(e) => setSimNovos(parseInt(e.target.value) || 1)}
                  className="h-10 w-20 rounded-xl border border-zinc-200 px-2 text-center text-sm font-black" />
                <button onClick={simular} disabled={simulando || !simCidade.trim()}
                  className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white hover:brightness-110 disabled:opacity-50">
                  {simulando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Simular"}
                </button>
              </div>
              {simResult && (
                <div className="mt-4 text-sm">
                  <p className="font-bold">{simResult.cidade} — {Number(simResult.populacao || 0).toLocaleString("pt-BR")} hab · {simResult.lojas} loja(s) · demanda est. {simResult.demanda_estimada_dia}/dia</p>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    {[["ANTES", simResult.antes, simResult.motoboys_atuais], ["DEPOIS", simResult.depois, simResult.motoboys_atuais + simResult.motoboys_novos]].map(([tag, s, mb]: any) => (
                      <div key={tag} className={`rounded-2xl p-3 ${s.atende_demanda ? "bg-emerald-50 ring-1 ring-emerald-100" : "bg-red-50 ring-1 ring-red-100"}`}>
                        <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{tag} · {mb} motoboy(s)</p>
                        <p className="font-black">{s.capacidade_dia} entregas/dia de capacidade</p>
                        <p className="text-xs">{s.utilizacao_pct != null ? `Utilização ${s.utilizacao_pct}%` : "Sem capacidade"} · {s.atende_demanda ? "✅ atende a demanda" : "❌ não atende"}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-400">{simResult.premissas}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ NÚCLEO ═══ */}
        {aba === "nucleo" && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 font-black"><Activity className="h-5 w-5 text-emerald-600" /> Sistema Nervoso — eventos (30d)</h3>
              <div className="mt-3 space-y-1.5">
                {((evResumo || []) as any[]).map((e: any) => (
                  <div key={e.tipo} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-bold">{e.tipo}</span>
                    <span className="text-zinc-500">{e.ultimos_7d} em 7d · <b className="text-zinc-800">{e.ultimos_30d}</b> em 30d</span>
                  </div>
                ))}
                {!((evResumo || []) as any[]).length && (
                  <p className="text-sm text-zinc-400">Aguardando os primeiros eventos (pedidos, corridas, anúncios e grupos novos alimentam a ORION automaticamente).</p>
                )}
              </div>
              <div className="mt-4 max-h-64 space-y-1 overflow-y-auto border-t border-zinc-100 pt-3">
                {((eventos || []) as any[]).map((e: any) => (
                  <p key={e.id} className="text-[11px] text-zinc-500">
                    <span className="font-black text-zinc-700">{e.tipo}</span> · {e.origem} · {new Date(e.criado_em).toLocaleString("pt-BR")}
                  </p>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 font-black"><Brain className="h-5 w-5 text-indigo-600" /> ORION LEARN — memória de decisões</h3>
              <p className="mt-1 text-xs text-zinc-400">Cada recomendação criada/aceita/rejeitada vira aprendizado para calibrar as próximas análises.</p>
              <div className="mt-3 space-y-2">
                {((recomendacoes || []) as any[]).filter(r => r.status !== "pendente").slice(0, 12).map((r: any) => (
                  <div key={r.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                      r.status === "aceita" || r.status === "executada" ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-500"}`}>{r.status}</span>
                    {r.titulo}
                  </div>
                ))}
                {!((recomendacoes || []) as any[]).filter(r => r.status !== "pendente").length && (
                  <p className="text-sm text-zinc-400">Nenhuma decisão registrada ainda.</p>
                )}
              </div>
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Fase 1 · dados IBGE + operação real · motores: GEO, FLOW, MARKET, PEOPLE, PREDICT, LEARN, EXECUTIVE · novos motores plugam sem alterar a arquitetura
        </p>
      </div>
    </div>
  );
}
