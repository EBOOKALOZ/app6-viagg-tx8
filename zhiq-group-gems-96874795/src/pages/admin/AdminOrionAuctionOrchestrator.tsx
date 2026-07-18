/**
 * /admin/orion-auction-orchestrator — ORION Auction Ecosystem Orchestrator (ORION-AI-70)
 *
 * Camada superior de coordenacao do Ecossistema de Leiloes ORION. Coordena (nao
 * substitui) os motores de leilao (bidding/comissao/finalizacao/liquidacao/
 * inteligencia/growth): monitora saude, orquestra eventos com rastreabilidade,
 * valida workflow, mede performance/qualidade, gera alertas, consolida BI e preve.
 * ESTRITAMENTE READ-ONLY sobre leilao/financeiro. Fonte unica: RPC aeo_dashboard().
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Gavel, Loader2, Gauge, HeartPulse, Workflow as WorkflowIcon, ShieldCheck,
  Timer, Siren, TrendingUp, Activity, RefreshCw,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const sc = (s: number) => s >= 90 ? "text-emerald-300" : s >= 75 ? "text-lime-300" : s >= 50 ? "text-amber-300" : "text-red-300";
const scT = (s: number) => s >= 90 ? "text-emerald-600" : s >= 75 ? "text-lime-600" : s >= 50 ? "text-amber-600" : "text-red-600";
const HST: Record<string, string> = { ok: "bg-emerald-100 text-emerald-700", atencao: "bg-amber-100 text-amber-700", critico: "bg-red-100 text-red-700", indisponivel: "bg-red-100 text-red-700", declarado: "bg-slate-100 text-slate-500", monitorado: "bg-slate-100 text-slate-500" };
const SEV: Record<string, string> = { critico: "bg-red-100 text-red-700", alto: "bg-amber-100 text-amber-700", medio: "bg-yellow-100 text-yellow-700", baixo: "bg-slate-100 text-slate-600" };
const brl = (v: any) => v == null ? "—" : "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v: any) => v == null ? "—" : Number(v).toLocaleString("pt-BR");

type Aba = "resumo" | "saude" | "workflow" | "qualidade" | "performance" | "alertas" | "previsoes" | "eventos";

export default function AdminOrionAuctionOrchestrator() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-aeo"], queryFn: () => rpc("aeo_dashboard"), refetchInterval: 30000,
  });

  const scores = dash?.scores || {};
  const bi = dash?.bi || {};
  const health = (dash?.health || []) as any[];
  const modulos = (dash?.modulos || []) as any[];
  const workflow = (dash?.workflow || []) as any[];
  const quality = (dash?.quality || []) as any[];
  const perf = (dash?.performance || []) as any[];
  const alertas = (dash?.alertas || []) as any[];
  const previsoes = (dash?.previsoes || []) as any[];
  const eventos = (dash?.eventos_recentes || []) as any[];
  const seg = dash?.seguranca || {};

  const orquestrar = async () => {
    setBusy(true); setMsg("");
    try { const r = await rpc("aeo_orchestrate_rpc"); setMsg(`✓ Orquestração executada (run #${r?.run ?? "?"}). Orchestration ${r?.scores?.orchestration ?? "?"}.`); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); }
    finally { setBusy(false); }
  };

  const TABS: [Aba, any, string][] = [
    ["resumo", Gauge, "Resumo"], ["saude", HeartPulse, "Saúde"], ["workflow", WorkflowIcon, "Workflow"],
    ["qualidade", ShieldCheck, "Qualidade"], ["performance", Timer, "Performance"], ["alertas", Siren, "Alertas"],
    ["previsoes", TrendingUp, "Previsões"], ["eventos", Activity, "Eventos"],
  ];

  const SCORES: [string, number][] = [
    ["Orchestration", scores.orchestration_score], ["Health", scores.health_score], ["Workflow", scores.workflow_score],
    ["Performance", scores.performance_score], ["Reliability", scores.reliability_score], ["Security", scores.security_score],
    ["Integration", scores.integration_score],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/40 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#2a1c05] via-[#3d2a08] to-[#2a1c05] p-6 text-white shadow-xl ring-1 ring-amber-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/30">
              <Gavel className="h-8 w-8 text-amber-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">Auction Ecosystem Orchestrator</h1>
              <p className="text-sm text-amber-200/70">
                ORION-AI-70 · coordena os motores de leilão · read-only · nunca move dinheiro · nunca destrutivo
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-amber-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200/70">Orchestration Score</p>
              <p className={`text-4xl font-black ${sc(scores.orchestration_score ?? 0)}`}>{scores.orchestration_score ?? "—"}</p>
              <p className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">Health {scores.health_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["GMV", brl(bi.gmv)], ["Receita comissões", brl(bi.receita)], ["Leilões", num(bi.leiloes)],
              ["Ativos", num(bi.ativos)], ["Arremates", num(bi.arremates)], ["Backlog", num(bi.backlog)]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-amber-200/60">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS + orquestrar */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {TABS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-bold ${aba === k ? "bg-[#3d2a08] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
          <button onClick={orquestrar} disabled={busy}
            className="ml-auto flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Orquestrar agora
          </button>
        </div>

        {msg && <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800">{msg}</p>}
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>}

        {/* RESUMO */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
              {SCORES.map(([l, v]) => (
                <div key={l} className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{l}</p>
                  <p className={`text-3xl font-black ${scT(v ?? 0)}`}>{v ?? "—"}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["GMV", brl(bi.gmv)], ["Receita comissões", brl(bi.receita)], ["Lances", num(bi.lances)], ["Encerrados", num(bi.leiloes_encerrados ?? bi.encerrados)]].map(([l, v]: any) => (
                <div key={l} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{l}</p>
                  <p className="mt-1 text-2xl font-black text-zinc-800">{String(v)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-black text-amber-800">🔒 Governança do orquestrador</p>
              <ul className="mt-1 space-y-0.5 text-xs text-amber-900/80">
                <li>• <b>Read-only</b> sobre leilão/financeiro ({seg.read_only ? "garantido" : "—"}) — coordena, não executa.</li>
                <li>• <b>Nunca modifica dado financeiro</b> ({seg.nunca_modifica_financeiro ? "garantido" : "—"}) e <b>nunca ação destrutiva</b> ({seg.nunca_destrutivo ? "garantido" : "—"}).</li>
                <li>• Escreve apenas em <code>orion_aeo_*</code>; toda decisão auditável.</li>
              </ul>
              <p className="mt-2 text-[11px] text-amber-700/70">Atualizado em {dash?.atualizado_em || "—"}</p>
            </div>
          </div>
        )}

        {/* SAÚDE */}
        {aba === "saude" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-sm font-black text-zinc-700">Motores coordenados</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {modulos.map((m) => (
                  <div key={m.engine_key} className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-black text-zinc-800">{m.nome}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${m.disponivel ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{m.status}</span>
                    </div>
                    <p className="text-[11px] text-zinc-400">{m.tipo} · {m.tabela_principal}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-black text-zinc-700">Componentes de saúde</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {health.map((h) => (
                  <div key={h.componente} className="flex items-center justify-between rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
                    <span className="text-xs font-bold text-zinc-600">{h.componente}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${HST[h.status] || "bg-slate-100 text-slate-500"}`}>{h.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* WORKFLOW */}
        {aba === "workflow" && !isLoading && (
          <div className="mt-4 space-y-2">
            {workflow.map((w) => (
              <div key={w.stage_key} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-black text-amber-700">{w.ordem}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-zinc-800 capitalize">{w.descricao || w.stage_key}</p>
                  <p className="truncate text-[11px] text-zinc-400">{JSON.stringify(w.evidencias)}</p>
                </div>
                {w.consistencia_pct != null && <span className="text-xs font-bold text-zinc-500">{w.consistencia_pct}%</span>}
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${HST[w.status] || "bg-slate-100 text-slate-500"}`}>{w.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* QUALIDADE */}
        {aba === "qualidade" && !isLoading && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {quality.map((q) => (
              <div key={q.check_key} className={`rounded-2xl p-4 ring-1 ${q.ok ? "bg-white ring-zinc-200" : "bg-red-50 ring-red-200"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-zinc-800">{q.check_key}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${q.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{q.ok ? "✓ OK" : "✕ " + q.achados}</span>
                </div>
                <p className="text-[11px] text-zinc-400">{q.categoria}</p>
              </div>
            ))}
          </div>
        )}

        {/* PERFORMANCE */}
        {aba === "performance" && !isLoading && (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {perf.map((p) => (
              <div key={p.metrica} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{p.metrica}</p>
                <p className="mt-1 text-2xl font-black text-zinc-800">{p.valor ?? "—"}<span className="text-xs text-zinc-400"> {p.unidade}</span></p>
                <p className={`text-[11px] font-bold ${p.ok ? "text-emerald-600" : "text-amber-600"}`}>{p.ok ? "dentro do alvo" : "acima"} (≤ {p.threshold})</p>
              </div>
            ))}
          </div>
        )}

        {/* ALERTAS */}
        {aba === "alertas" && !isLoading && (
          <div className="mt-4 space-y-2">
            {alertas.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-zinc-400 ring-1 ring-zinc-200">Sem alertas abertos. 🟢</p>}
            {alertas.map((a) => (
              <div key={a.alert_key} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${SEV[a.severidade] || "bg-slate-100 text-slate-600"}`}>{a.severidade}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{a.categoria}</span>
                  <p className="w-full text-sm font-bold text-zinc-800">{a.titulo}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PREVISÕES */}
        {aba === "previsoes" && !isLoading && (
          <div className="mt-4 space-y-2">
            {previsoes.map((p) => (
              <div key={p.tipo} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black text-zinc-800 capitalize">{p.tipo}</p>
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">confiança {p.confianca}% · {p.dados_analisados} dados</span>
                </div>
                <p className="mt-1 text-sm text-zinc-600">{p.previsao}</p>
                <p className="text-[11px] text-zinc-400">Base: {p.base} · horizonte {p.horizonte}</p>
              </div>
            ))}
          </div>
        )}

        {/* EVENTOS */}
        {aba === "eventos" && !isLoading && (
          <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-zinc-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-[10px] uppercase text-zinc-400"><tr><th className="p-2">Evento</th><th className="p-2">Leilão</th><th className="p-2">Quando</th></tr></thead>
              <tbody>
                {eventos.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-zinc-400">Sem eventos recentes.</td></tr>}
                {eventos.map((e, i) => (
                  <tr key={i} className="border-t border-zinc-100">
                    <td className="p-2 font-bold text-zinc-700">{e.event_type}</td>
                    <td className="p-2 text-zinc-500">{e.listing_id}</td>
                    <td className="p-2 text-zinc-400">{e.criado_em ? new Date(e.criado_em).toLocaleString("pt-BR") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}
