/**
 * /admin/orion-digital-twin — ORION Digital Twin AI (ORION-AI-58)
 *
 * Gemeo digital VIVO: entidades auto-descobertas + baselines medidas do
 * ambiente REAL. Simula carga/incidente/financeiro/deploy com premissas
 * DECLARADAS — NUNCA toca producao (isolamento provado no selftest).
 * Financeiro DELEGA ao AI-55; incidente propaga pelo grafo real do AI-50.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Boxes, Loader2, Sparkles, Gauge, Zap, Rocket, GitCompareArrows, Play } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};
type Aba = "resumo" | "modelo" | "carga" | "incidentes" | "deploy" | "comparativos";
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
    <h3 className="mb-2 text-sm font-black text-zinc-700">{title}</h3>{children}
  </div>
);
const VER: Record<string, string> = {
  ok: "bg-emerald-100 text-emerald-700", liberado: "bg-emerald-100 text-emerald-700", informativo: "bg-slate-100 text-slate-500",
  atencao: "bg-amber-100 text-amber-700", revisar: "bg-amber-100 text-amber-700", moderado: "bg-amber-100 text-amber-700",
  limite: "bg-red-100 text-red-700", alto: "bg-red-600 text-white", critico: "bg-red-700 text-white", bloquear: "bg-red-700 text-white",
};

export default function AdminOrionDigitalTwin() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");
  const [msg, setMsg] = useState("");
  const [cargaN, setCargaN] = useState(100000);
  const [incTipo, setIncTipo] = useState("banco_indisponivel");
  const [depNome, setDepNome] = useState("orion_novo_modulo");
  const [saida, setSaida] = useState<any>(null);

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-twin"], queryFn: () => rpc("digital_twin_dashboard"), refetchInterval: 60000,
  });
  const sc = dash?.scores || {};
  const baselines = (dash?.baselines || []) as any[];
  const ent = dash?.entities_resumo || {};
  const modulos = (dash?.modulos || []) as any[];
  const runs = (dash?.runs || []) as any[];
  const incidents = (dash?.incidents || []) as any[];
  const comparisons = (dash?.comparisons || []) as any[];

  const narrar = async (promptKey: string, rotulo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("twin_summary");
      const r = await orionAiText("digital_twin", `Pedido: ${rotulo}\nEstado: ${JSON.stringify(ctx)}`, { promptKey, maxTokens: 700 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponivel (${r.error}).`);
    } finally { setOcupado(false); }
  };
  const call = async (fn: string, args: Record<string, unknown>, okMsg: string) => {
    setOcupado(true); setMsg(""); setSaida(null);
    try { const r = await rpc(fn, args); setSaida(r.resultado || r); setMsg(`✓ ${okMsg}`); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); } finally { setOcupado(false); }
  };

  const TABS: [Aba, any, string][] = [
    ["resumo", Sparkles, "Resumo"], ["modelo", Boxes, "Modelo Digital"], ["carga", Gauge, "Carga"],
    ["incidentes", Zap, "Incidentes"], ["deploy", Rocket, "Deploy Simulator"], ["comparativos", GitCompareArrows, "Previsto x Real"],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
        <div className="rounded-3xl bg-gradient-to-r from-[#0a1420] via-[#0f766e] to-[#0a1420] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Boxes className="h-8 w-8 text-teal-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">ORION Digital Twin AI</h1>
                <span className="rounded-full bg-teal-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ring-teal-300/40">Twin</span>
              </div>
              <p className="text-sm text-teal-200/80">
                ORION-AI-58 · gemeo digital vivo · simula ANTES do deploy · NUNCA toca producao (isolamento provado) · premissas declaradas
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-200/70">Twin Health (THS)</p>
              <p className="text-3xl font-black">{sc.ths ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Simulation (SS)", sc.ss], ["Entidades", sc.base?.entidades], ["Baselines", sc.base?.baselines],
              ["Runs 7d", sc.base?.runs_7d], ["Precisao (erro%)", sc.precisao_media_erro_pct ?? "aguarda"],
              ["Modulos IA", modulos.length]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-teal-200/70">{l}</p>
                <p className="truncate text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {TABS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => { setAba(k); setSaida(null); }}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#0f766e] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
          <button onClick={() => call("create_digital_twin", { p_trace: `painel_${Date.now()}` }, "Gemeo sincronizado")} disabled={ocupado}
            className="ml-auto flex items-center gap-2 rounded-full bg-teal-700 px-4 py-2 text-sm font-black text-white shadow hover:bg-teal-800 disabled:opacity-50">
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Sincronizar
          </button>
        </div>
        {msg && <p className="mt-2 text-[12px] font-bold text-zinc-600">{msg}</p>}
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>}

        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-teal-200 bg-teal-50/40 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["twin.summary", "Resumo do gemeo"], ["twin.load", "Analisar carga"], ["twin.incident", "Analisar incidente"],
                  ["twin.deploy", "Analisar deploy"], ["twin.whatif", "What-if"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l)} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-teal-200 hover:bg-teal-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-teal-100">{narrativa}</p>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Baselines medidas (a fisica do gemeo)">
                {baselines.map((b: any) => (
                  <div key={b.metrica} className="mb-1 flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-zinc-600">{b.metrica.replace(/_/g, " ")}</span>
                    <span className="font-black text-zinc-800">{Number(b.valor).toLocaleString("pt-BR")} <span className="text-[9px] font-normal text-zinc-400">{b.unidade}</span></span>
                  </div>
                ))}
              </Card>
              <Card title="Simulacoes recentes (imutaveis)">
                {runs.map((r: any) => (
                  <div key={r.run_id} className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{r.tipo}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${VER[r.veredito] || "bg-slate-100 text-slate-500"}`}>{r.veredito}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-500">{JSON.stringify(r.params_snapshot)}</span>
                  </div>
                ))}
              </Card>
            </div>
          </div>
        )}

        {aba === "modelo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Object.entries(ent as Record<string, any>).map(([k, v]) => (
                <div key={k} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{k}</p>
                  <p className="text-xl font-black text-teal-700">{String(v)}</p>
                </div>
              ))}
            </div>
            <Card title="Modulos IA no gemeo (auto-descobertos)">
              <div className="flex flex-wrap gap-1">
                {modulos.map((m: any) => (
                  <span key={m.m} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${m.meta?.health === "verde" ? "bg-emerald-100 text-emerald-700" : m.meta?.health === "vermelho" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                    {m.meta?.numero || m.m}
                  </span>
                ))}
              </div>
            </Card>
          </div>
        )}

        {aba === "carga" && !isLoading && (
          <div className="mt-4 space-y-4">
            <Card title="Simular carga (modelo analitico — premissas declaradas)">
              <div className="flex flex-wrap items-center gap-2">
                {[100, 1000, 10000, 100000, 1000000].map((n) => (
                  <button key={n} onClick={() => setCargaN(n)} className={`rounded-full px-3 py-1 text-xs font-bold ${cargaN === n ? "bg-teal-700 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200"}`}>{n.toLocaleString("pt-BR")}</button>
                ))}
                <button onClick={() => call("simulate_load", { p_usuarios: cargaN }, `Carga ${cargaN} simulada`)} disabled={ocupado}
                  className="rounded-full bg-teal-700 px-4 py-1.5 text-sm font-black text-white disabled:opacity-50">Simular</button>
              </div>
              {saida && (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[["Fator escala", saida.fator_escala + "x"], ["Latencia (ms)", saida.latencia_projetada_ms],
                    ["Custo/dia (USD)", saida.custo_dia_usd_projetado], ["DB projetado (MB)", saida.db_mb_projetado],
                    ["Cliques/dia", saida.cliques_dia_projetados]].map(([l, v]: any) => (
                    <div key={l} className="rounded-2xl bg-teal-50 p-3 text-center">
                      <p className="text-[10px] font-bold uppercase text-teal-400">{l}</p>
                      <p className="text-lg font-black text-teal-800">{String(v)}</p>
                    </div>
                  ))}
                  <div className="col-span-full">
                    <p className="text-xs font-bold text-zinc-600">Gargalos previstos:</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(saida.gargalos || []).length ? (saida.gargalos || []).map((g: string, i: number) => (
                        <span key={i} className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">{g}</span>
                      )) : <span className="text-[11px] text-emerald-600">Nenhum no fator atual.</span>}
                    </div>
                    <p className="mt-2 text-[10px] text-zinc-400">{saida.premissas}</p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {aba === "incidentes" && !isLoading && (
          <div className="mt-4 space-y-4">
            <Card title="Simular incidente (propaga pelo grafo real de dependencias)">
              <div className="flex flex-wrap items-center gap-2">
                <select value={incTipo} onChange={(e) => setIncTipo(e.target.value)} className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm">
                  {["banco_indisponivel", "gateway_ia_lento", "pagamento_falhando", "worker_parado", "storage_indisponivel"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={() => call("simulate_incident", { p_tipo: incTipo }, "Incidente simulado")} disabled={ocupado}
                  className="rounded-full bg-teal-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Simular</button>
              </div>
              {saida?.modulos_afetados && (
                <div className="mt-3">
                  <p className="text-sm"><b>{saida.qtd_afetados}</b> modulos afetados · recuperacao estimada <b>{saida.plano?.recuperacao_estimada_min} min</b></p>
                  <p className="mt-1 text-[11px] text-zinc-500">{saida.plano?.deteccao} · {saida.plano?.resposta}</p>
                </div>
              )}
            </Card>
            <Card title="Incidentes simulados">
              {incidents.map((i: any) => (
                <div key={i.id} className="mb-1 flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{i.tipo}</span>
                  <span className="text-zinc-600">{(i.afetados || []).length} afetados · rec {i.tempo_recuperacao_min}min</span>
                </div>
              ))}
            </Card>
          </div>
        )}

        {aba === "deploy" && !isLoading && (
          <div className="mt-4 space-y-4">
            <Card title="Deploy Simulator — relatorio de risco (banco/deps/postura/crons/rollback)">
              <div className="flex flex-wrap items-center gap-2">
                <input value={depNome} onChange={(e) => setDepNome(e.target.value)} placeholder="nome do objeto"
                  className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm" />
                <button onClick={() => call("simulate_deployment", { p_objeto: { tipo: "modulo", nome: depNome, depende_de: ["cyber_defense"], rollback: "sim" } }, "Deploy analisado")} disabled={ocupado}
                  className="rounded-full bg-teal-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Analisar risco</button>
              </div>
              {saida?.checks && (
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${VER[saida.veredito] || ""}`}>{saida.veredito}</span>
                    <span className="text-sm font-bold text-zinc-700">risco {saida.risco_score}/100</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {(saida.checks || []).map((c: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${c.r === "ok" ? "bg-emerald-100 text-emerald-700" : c.r === "bloqueio" ? "bg-red-700 text-white" : "bg-amber-100 text-amber-700"}`}>{c.r}</span>
                        <span className="text-zinc-600">{c.v}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-zinc-400">{saida.nota}</p>
                </div>
              )}
            </Card>
          </div>
        )}

        {aba === "comparativos" && !isLoading && (
          <div className="mt-4 space-y-3">
            <Card title="Camada 12: previsto x real (precisao amadurece com historico)">
              {!comparisons.length ? (
                <p className="py-4 text-center text-sm text-zinc-400">Aguardando historico — compara previsoes do AI-52/55 com o realizado, automaticamente a cada 30 min.</p>
              ) : comparisons.map((c: any) => (
                <div key={c.id} className="mb-1 flex items-center gap-2 text-xs">
                  <span className="font-mono text-zinc-400">{c.dia}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-600">{c.alvo}</span>
                  <span className="text-zinc-500">prev {Number(c.previsto).toFixed(1)}{c.realizado != null ? ` · real ${Number(c.realizado).toFixed(1)}` : ""}</span>
                  {c.erro_pct != null && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-black text-teal-700">erro {c.erro_pct}%</span>}
                </div>
              ))}
            </Card>
            <p className="text-[11px] text-zinc-400">Suite: <code className="rounded bg-zinc-100 px-1">SELECT twin_selftest()</code> — 15 checks incl. ISOLAMENTO DE PRODUCAO provado (COMANDO TESTE).</p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Digital Twin AI v1.0 · ORION-AI-58 · entidades auto-descobertas + baselines reais · simula carga/incidente/deploy/financeiro ·
          isolamento de producao PROVADO · incidente propaga pelo grafo AI-50 · financeiro delega AI-55 · tick 30 min · IA so via Gateway
        </p>
      </div>
    </div>
  );
}
