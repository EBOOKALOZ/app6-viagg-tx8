/**
 * /admin/orion-autonomous-ops — ORION Autonomous Operations AI (ORION-AI-56)
 *
 * Autonomous Operations Center (AOC): ingere eventos operacionais REAIS (bus,
 * alertas do AI-51, falhas de cron, AI-53 AIOps, pagamentos presos, filas),
 * decide dentro de POLITICAS (automatica/semi/manual), despacha tarefas aos
 * modulos e gerencia incidentes com MTTR. NUNCA move dinheiro (acoes financeiras
 * = sempre humanas). Recomenda infra, nao executa (CPU/Redis/cloud DECLARADOS).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Cpu, Loader2, Gauge, Activity, Scale, Send, Siren, HardDrive,
  BookKey, Workflow as WorkflowIcon, Bell, BarChart3,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const scoreColor = (s: number) => s >= 90 ? "text-emerald-300" : s >= 75 ? "text-lime-300" : s >= 50 ? "text-amber-300" : "text-red-300";
const CLS: Record<string, string> = { automatica: "bg-emerald-100 text-emerald-700", semi: "bg-amber-100 text-amber-700", manual: "bg-sky-100 text-sky-700" };
const RES: Record<string, string> = { executada: "bg-emerald-100 text-emerald-700", aguardando_aprovacao: "bg-amber-100 text-amber-700", pendente: "bg-slate-100 text-slate-600", recusada: "bg-red-100 text-red-700", revertida: "bg-zinc-200 text-zinc-500" };
const SEV: Record<string, string> = { critica: "bg-red-100 text-red-700", alta: "bg-amber-100 text-amber-700", media: "bg-yellow-100 text-yellow-700", baixa: "bg-slate-100 text-slate-600" };
const EST: Record<string, string> = { ok: "bg-emerald-100 text-emerald-700", atencao: "bg-amber-100 text-amber-700", gargalo: "bg-red-100 text-red-700" };

type Aba = "resumo" | "eventos" | "decisoes" | "dispatch" | "incidentes" | "recursos" | "politicas" | "workflows" | "alertas" | "estatisticas";

function Evid({ dados }: { dados: any }) {
  return <pre className="overflow-auto rounded-xl bg-white p-2 text-[10px] text-zinc-500">{JSON.stringify(dados, null, 2)}</pre>;
}

export default function AdminOrionAutonomousOps() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-aoc"], queryFn: () => rpc("automation_dashboard"), refetchInterval: 30000,
  });

  const st = dash?.status || {};
  const ev = dash?.eventos || {};
  const dec = dash?.decisoes || {};
  const disp = dash?.dispatch || {};
  const inc = dash?.incidentes || {};
  const rec = dash?.recursos || {};
  const pol = dash?.politicas || {};
  const wf = dash?.workflows || {};
  const alertas = dash?.alertas || {};
  const est = dash?.estatisticas || {};
  const lacunas = (dash?.lacunas || []) as string[];

  const act = async (id: number, fn: string, args: Record<string, unknown>, ok: (r: any) => string) => {
    setBusy(id); setMsg("");
    try { const r = await rpc(fn, args); setMsg(`✓ ${ok(r)}`); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); }
    finally { setBusy(null); }
  };
  const aprovar = (id: number) => act(id, "aoc_approve_decision", { p_decision_id: id, p_aprovar: true, p_motivo: "aprovado via painel AOC" }, () => `Decisão #${id} aprovada e executada.`);
  const recusar = (id: number) => act(id, "aoc_approve_decision", { p_decision_id: id, p_aprovar: false, p_motivo: "recusado via painel AOC" }, () => `Decisão #${id} recusada.`);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0a0e1a] via-[#141b2e] to-[#0a0e1a] p-6 text-white shadow-xl ring-1 ring-blue-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 ring-1 ring-blue-500/30">
              <Cpu className="h-8 w-8 text-blue-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">Autonomous Operations Center</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-56 · orquestração por políticas · evento→decisão→dispatch · nunca move dinheiro · recomenda infra
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-blue-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200/70">Automation Score</p>
              <p className={`text-4xl font-black ${scoreColor(st.automation_score ?? 0)}`}>{st.automation_score ?? "—"}</p>
              <p className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">Health {st.health_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[["Eventos hoje", st.eventos_hoje], ["Op. ativas", st.operacoes_ativas], ["Decisões", st.decisoes_hoje],
              ["Aguard. aprovação", st.aguardando_aprovacao], ["Incidentes", st.incidentes_abertos],
              ["Gargalos", st.gargalos], ["MTTR", `${st.mttr_seg ?? 0}s`]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Gauge, "Resumo"], ["eventos", Activity, "Eventos"], ["decisoes", Scale, "Decisões"],
             ["dispatch", Send, "Dispatch"], ["incidentes", Siren, "Incidentes"], ["recursos", HardDrive, "Recursos"],
             ["politicas", BookKey, "Políticas"], ["workflows", WorkflowIcon, "Workflows"], ["alertas", Bell, "Alertas"],
             ["estatisticas", BarChart3, "Estatísticas"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-bold ${aba === k ? "bg-[#141b2e] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {msg && <p className="mt-3 rounded-2xl bg-slate-100 px-4 py-2 text-xs font-bold text-zinc-700">{msg}</p>}
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>}

        {/* RESUMO */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Automation Score", st.automation_score, "decisões automáticas executadas ok"],
                ["Health Score", st.health_score, "saúde operacional (AI-51 − incidentes)"],
                ["Reliability", st.reliability, "dispatches sem falha"],
                ["MTTR", `${st.mttr_seg ?? 0}s`, "tempo médio de recuperação"]].map(([l, v, d]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className={`text-2xl font-black ${typeof v === "number" ? scoreColor(v).replace("300", "600") : "text-blue-700"}`}>{v ?? "—"}</p>
                  <p className="text-[10px] text-zinc-400">{d}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-sky-50 border border-sky-200 px-4 py-2 text-[11px] font-semibold text-sky-800">
              🔒 Ações financeiras <b>nunca</b> são automáticas (pagamento preso = incidente escalado ao humano). Infra (CPU/Redis/cloud/worker) é <b>recomendação</b>, não execução.
            </div>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="mb-1 text-sm font-black text-amber-800">Lacunas declaradas</h3>
              {lacunas.map((l, i) => <p key={i} className="text-[11px] font-semibold text-amber-700">· {l}</p>)}
            </div>
          </div>
        )}

        {/* EVENTOS */}
        {aba === "eventos" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(ev.por_categoria || {}).map(([k, v]: any) => (
                <span key={k} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">{k}: {v}</span>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">📡 Eventos operacionais (fontes reais)</h3>
              {!(ev.lista || []).length ? <p className="text-xs text-zinc-400">Nenhum evento.</p> : (ev.lista || []).map((e: any) => (
                <details key={e.event_id} className="mb-1 rounded-2xl bg-slate-50 p-2">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[e.severidade] || ""}`}>{e.severidade}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-700">#{e.event_id} · {e.tipo} · {e.alvo ?? "-"}</span>
                    <span className="text-[10px] text-zinc-400">{e.origem} · {e.status}</span>
                  </summary>
                  <Evid dados={e.evidencias} />
                </details>
              ))}
            </div>
          </div>
        )}

        {/* DECISÕES */}
        {aba === "decisoes" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(dec.por_classe || {}).map(([k, v]: any) => (
                <span key={k} className={`rounded-full px-3 py-1 text-[11px] font-bold ${CLS[k] || "bg-slate-100 text-slate-600"}`}>{k}: {v}</span>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">⚖️ Decisões (automática/semi/manual) · semi e manual pedem aprovação</h3>
              {!(dec.lista || []).length ? <p className="text-xs text-zinc-400">Nenhuma decisão.</p> : (dec.lista || []).map((d: any) => (
                <details key={d.decision_id} className="mb-1 rounded-2xl bg-slate-50 p-2">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${CLS[d.classe] || ""}`}>{d.classe}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-700">#{d.decision_id} · {d.acao}</span>
                    <span className="text-[10px] font-black text-zinc-500">conf {d.confianca}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${RES[d.resultado] || ""}`}>{d.resultado}</span>
                  </summary>
                  <div className="mt-2 space-y-1 text-[11px] text-zinc-600">
                    <p><b>Motivo:</b> {d.motivo}</p>
                    <p>Impacto {d.impacto} · política {d.policy_key ?? "—"}{d.rollback_de ? ` · ↺ reverte #${d.rollback_de}` : ""}</p>
                    {d.resultado === "aguardando_aprovacao" && (
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => aprovar(d.decision_id)} disabled={busy === d.decision_id}
                          className="rounded-xl bg-emerald-600 px-3 py-1 text-[11px] font-black text-white disabled:opacity-40">Aprovar e executar</button>
                        <button onClick={() => recusar(d.decision_id)} disabled={busy === d.decision_id}
                          className="rounded-xl bg-red-600 px-3 py-1 text-[11px] font-black text-white disabled:opacity-40">Recusar</button>
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}

        {/* DISPATCH */}
        {aba === "dispatch" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(disp.por_modulo || {}).map(([k, v]: any) => (
                <span key={k} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">{k}: {v}</span>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🚀 Livro de despacho (seguro executa · resto = recomendação)</h3>
              {!(disp.lista || []).length ? <p className="text-xs text-zinc-400">Nenhum despacho ainda.</p> : (disp.lista || []).map((d: any) => (
                <div key={d.dispatch_id} className="mb-1 flex flex-wrap items-center gap-2 border-b border-zinc-50 pb-1 text-[11px]">
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">{d.modulo}</span>
                  <span className="min-w-0 flex-1 truncate font-bold text-zinc-700">{d.tarefa}</span>
                  <span className="text-zinc-400">{d.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INCIDENTES */}
        {aba === "incidentes" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🚨 Incidentes ({inc.abertos ?? 0} abertos) · MTTR por incidente</h3>
              {!(inc.lista || []).length ? <p className="text-xs text-zinc-400">Nenhum incidente. 🎉</p> : (inc.lista || []).map((i: any) => (
                <details key={i.incident_id} className="mb-1 rounded-2xl bg-slate-50 p-2">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[i.severidade] || ""}`}>{i.severidade}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-700">#{i.incident_id} · {i.tipo} · {i.servico ?? "-"}</span>
                    <span className="text-[10px] text-zinc-400">{i.status}{i.mttr_seg ? ` · ${i.mttr_seg}s` : ""}</span>
                  </summary>
                  <p className="mt-1 text-[11px] text-zinc-600">{i.diagnostico}</p>
                </details>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🔧 Recuperações (retry idempotente · escalonamento)</h3>
              {!(inc.recuperacoes || []).length ? <p className="text-xs text-zinc-400">Nenhuma recuperação.</p> : (inc.recuperacoes || []).map((r: any) => (
                <p key={r.recovery_id} className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${r.sucesso ? "bg-emerald-100 text-emerald-700" : r.sucesso === false ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{r.tentativa}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-600">{r.alvo} · {r.detalhe}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* RECURSOS */}
        {aba === "recursos" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🖥 Recursos e filas (fontes SQL reais)</h3>
              {(rec.atuais || []).map((r: any) => (
                <div key={r.recurso} className="mb-1 flex flex-wrap items-center gap-2 border-b border-zinc-50 pb-1 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${EST[r.estado] || ""}`}>{r.estado}</span>
                  <span className="min-w-0 flex-1 truncate font-bold text-zinc-700">{r.recurso} <span className="text-zinc-400">· {r.categoria}</span></span>
                  <span className="font-black text-zinc-600">{r.valor} {r.unidade}</span>
                </div>
              ))}
              {(rec.lacunas || []).map((l: string, i: number) => <p key={i} className="mt-2 text-[10px] text-amber-700">· {l}</p>)}
            </div>
          </div>
        )}

        {/* POLÍTICAS */}
        {aba === "politicas" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">📜 Motor de políticas (condição→ação→autonomia)</h3>
            {(pol.lista || []).map((p: any) => (
              <div key={p.policy_key} className="mb-2 rounded-2xl bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-black text-zinc-700">{p.policy_key}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${CLS[p.autonomia] || ""}`}>{p.autonomia}</span>
                  {p.financeiro && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black text-sky-700">FINANCEIRO 🔒</span>}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">P{p.prioridade}</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">{p.descricao}</p>
                <p className="text-[10px] text-zinc-400">SE {p.condicao} ENTÃO {p.acao}{p.alvo_modulo ? ` → ${p.alvo_modulo}` : ""}{p.limite ? ` (limite ${p.limite})` : ""}</p>
              </div>
            ))}
          </div>
        )}

        {/* WORKFLOWS */}
        {aba === "workflows" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">🔁 Workflows operacionais</h3>
            {(wf.lista || []).map((w: any) => (
              <div key={w.workflow_key} className="mb-2 rounded-2xl bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-black text-zinc-700">{w.nome}</span>
                  {w.seguro ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">SEGURO</span>
                    : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">requer aprovação</span>}
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">{w.descricao}</p>
                <p className="text-[10px] text-zinc-400">{(w.passos || []).length} passo(s){w.ultima_exec ? ` · última: ${String(w.ultima_exec).slice(0, 16).replace("T", " ")}` : ""}</p>
              </div>
            ))}
          </div>
        )}

        {/* ALERTAS */}
        {aba === "alertas" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">🔔 Alertas operacionais (priorizados por impacto)</h3>
            {!(alertas.lista || []).length ? <p className="text-xs text-zinc-400">Nenhum alerta.</p> : (alertas.lista || []).map((a: any) => (
              <details key={a.alert_id} className="mb-1 rounded-2xl bg-slate-50 p-2">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${a.severidade === "critico" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{a.severidade}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-700">{a.mensagem}</span>
                  <span className="text-[10px] font-black text-zinc-500">P{a.prioridade}</span>
                </summary>
                <Evid dados={a.evidencias} />
              </details>
            ))}
          </div>
        )}

        {/* ESTATÍSTICAS */}
        {aba === "estatisticas" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">📊 Estatísticas diárias</h3>
            {!(est.dias || []).length ? <p className="text-xs text-zinc-400">Sem estatísticas.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead><tr className="text-zinc-400">
                    <th className="pb-1 pr-3">Dia</th><th className="pr-3">Eventos</th><th className="pr-3">Decisões</th><th className="pr-3">Auto</th>
                    <th className="pr-3">Semi</th><th className="pr-3">Manual</th><th className="pr-3">Incid.</th><th className="pr-3">Recup.</th>
                    <th className="pr-3">MTTR</th><th className="pr-3">Autom.</th><th className="pr-3">Health</th><th>Reliab.</th>
                  </tr></thead>
                  <tbody>{(est.dias || []).map((s: any) => (
                    <tr key={s.dia} className="border-t border-zinc-50 font-semibold text-zinc-600">
                      <td className="py-1 pr-3">{s.dia}</td><td className="pr-3">{s.eventos}</td><td className="pr-3">{s.decisoes}</td><td className="pr-3">{s.decisoes_automaticas}</td>
                      <td className="pr-3">{s.decisoes_semi}</td><td className="pr-3">{s.decisoes_manuais}</td><td className="pr-3">{s.incidentes}</td><td className="pr-3">{s.recuperacoes_ok}</td>
                      <td className="pr-3">{s.mttr_seg}s</td><td className="pr-3">{s.automation_score}</td><td className="pr-3">{s.health_score}</td><td>{s.reliability}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[10px] text-zinc-400">Automation Score = % decisões automáticas executadas ok · Health = OHS(AI-51) − 10·incidentes abertos − 5·gargalos.</p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          Autonomous Operations Center v1.0 · ORION-AI-56 · evento→decisão→dispatch por políticas · automática/semi/manual ·
          nunca move dinheiro · recomenda infra (não executa) · incidentes com MTTR + retry idempotente · selftest 12 · tick a cada 2 min
        </p>
      </div>
    </div>
  );
}
