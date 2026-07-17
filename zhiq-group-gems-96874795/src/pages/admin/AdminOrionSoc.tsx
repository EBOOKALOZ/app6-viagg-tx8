/**
 * /admin/orion-soc — ORION SOC Commander (ORION-AI-49)
 *
 * Centro executivo de comando do Security Ecosystem. COORDENA e CONSOLIDA os
 * módulos AI-40..AI-48 (read-only) — nunca altera as decisões deles. Mapa de
 * saúde, scores executivos OSS/ORS/GHS/ECS, timeline global, analytics e alertas
 * de nível SOC. Fecha o ORION Security Ecosystem (AI-40..49).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ShieldHalf, Loader2, Gauge, Activity, Bell, Flame, Clock, BarChart3, Settings, ExternalLink } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const ESTADO: Record<string, { c: string; dot: string; ic: string }> = {
  operacional: { c: "text-emerald-700 bg-emerald-100", dot: "bg-emerald-500", ic: "🟢" },
  atencao: { c: "text-yellow-700 bg-yellow-100", dot: "bg-yellow-500", ic: "🟡" },
  degradado: { c: "text-amber-700 bg-amber-100", dot: "bg-amber-500", ic: "🟠" },
  critico: { c: "text-red-700 bg-red-100", dot: "bg-red-500", ic: "🔴" },
  indisponivel: { c: "text-zinc-500 bg-zinc-100", dot: "bg-zinc-400", ic: "⚫" },
};
const RISCO: Record<string, string> = { critico: "bg-red-100 text-red-700", alto: "bg-amber-100 text-amber-700", medio: "bg-yellow-100 text-yellow-700", baixo: "bg-emerald-100 text-emerald-700" };
const SEV: Record<string, string> = { critica: "bg-red-100 text-red-700", alta: "bg-amber-100 text-amber-700", media: "bg-yellow-100 text-yellow-700", baixa: "bg-slate-100 text-slate-600" };
const MOD_URL: Record<string, string> = {
  cyber_defense: "/admin/orion-cyber-defense", fraud_detection: "/admin/orion-fraud", identity_access: "/admin/orion-identity",
  threat_intelligence: "/admin/orion-threat-intelligence", security_audit: "/admin/orion-security-audit",
  incident_response: "/admin/orion-incident-response", backup_recovery: "/admin/orion-backup-recovery",
  zero_trust: "/admin/orion-zero-trust", compliance_lgpd: "/admin/orion-compliance",
};
const fmt = (v: any) => v ? String(v).slice(0, 19).replace("T", " ") : "—";
const scoreCol = (s: number, inv = false) => (inv ? s <= 30 : s >= 75) ? "text-emerald-300" : (inv ? s <= 60 : s >= 50) ? "text-amber-300" : "text-red-300";

type Aba = "executive" | "saude" | "alertas" | "incidentes" | "timeline" | "estatisticas" | "config";

export default function AdminOrionSoc() {
  const [aba, setAba] = useState<Aba>("executive");
  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-soc"], queryFn: () => rpc("soc_dashboard"), refetchInterval: 30000,
  });

  const ov = dash?.overview || {};
  const scores = ov.scores || {};
  const analytics = ov.analytics || {};
  const health = (dash?.healthmap || []) as any[];
  const alerts = dash?.alerts || {};
  const alertList = (alerts?.lista || []) as any[];
  const incidents = dash?.incidents || {};
  const incList = (incidents?.lista || []) as any[];
  const timeline = (dash?.timeline || []) as any[];
  const stats = (dash?.statistics?.serie_14d || []) as any[];
  const config = dash?.config || {};

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0a0e1a] via-[#141b30] to-[#0a0e1a] p-6 text-white shadow-xl ring-1 ring-indigo-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 ring-1 ring-indigo-500/30">
              <ShieldHalf className="h-8 w-8 text-indigo-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION SOC Commander</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-49 · centro executivo do Security Ecosystem · coordena AI-40…AI-48 · consolida, nunca altera decisões
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[["OSS", scores.oss, false], ["ORS", scores.ors, true], ["GHS", scores.ghs, false], ["ECS", scores.ecs, false]].map(([l, v, inv]: any) => (
                <div key={l} className="rounded-2xl bg-white/5 px-4 py-2 text-center ring-1 ring-indigo-500/20">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-200/70">{l}</p>
                  <p className={`text-2xl font-black ${scoreCol(v ?? 0, inv)}`}>{v ?? "—"}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Módulos OK", `${scores.modulos_operacionais ?? "—"}/${scores.modulos_total ?? 9}`],
              ["Incid. críticos", ov.incidentes_criticos], ["Alertas SOC", ov.alertas_ativos],
              ["Risco domínio", scores.risco_dominio_medio], ["MTTR", `${analytics.mttr_min ?? "—"}min`],
              ["Disponibilidade", `${analytics.disponibilidade_pct ?? "—"}%`]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-400">Snapshot: {fmt(ov.gerado_em)} · atualização automática (tick */2)</p>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["executive", Gauge, "Executive"], ["saude", Activity, "Mapa de Saúde"], ["alertas", Bell, `Alertas${ov.alertas_ativos ? ` (${ov.alertas_ativos})` : ""}`],
             ["incidentes", Flame, `Incidentes${incidents.abertos ? ` (${incidents.abertos})` : ""}`], ["timeline", Clock, "Timeline Global"],
             ["estatisticas", BarChart3, "Estatísticas"], ["config", Settings, "Config"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#141b30] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>}

        {/* EXECUTIVE */}
        {aba === "executive" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Overall Security (OSS)", scores.oss, false, "35% saúde das IAs + 65% (100−risco)"],
                ["Operational Risk (ORS)", scores.ors, true, "risco consolidado (maior = pior)"],
                ["Global Health (GHS)", scores.ghs, false, "% de IAs operacionais"],
                ["Executive Confidence (ECS)", scores.ecs, false, "saúde + cobertura dos 9 módulos"]].map(([l, v, inv, d]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className={`text-2xl font-black ${(inv ? v <= 30 : v >= 75) ? "text-emerald-600" : (inv ? v <= 60 : v >= 50) ? "text-amber-600" : "text-red-600"}`}>{v ?? "—"}</p>
                  <p className="text-[10px] text-zinc-400">{d}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[["Operacionais", scores.modulos_operacionais, "emerald"], ["Atenção", scores.modulos_atencao, "yellow"],
                ["Degradados", scores.modulos_degradados, "amber"], ["Críticos", scores.modulos_criticos, "red"],
                ["Críticos abertos", scores.criticos_totais, "red"], ["Itens abertos", scores.abertos_totais, "slate"]].map(([l, v]: any) => (
                <div key={l} className="rounded-2xl border border-zinc-100 bg-white p-3 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-xl font-black text-zinc-800">{v ?? 0}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Analytics do ecossistema</h3>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 text-center">
                {[["MTTD", analytics.mttd_min, "min"], ["MTTR", analytics.mttr_min, "min"], ["MTTC", analytics.mttc_min, "min"],
                  ["RPO", analytics.rpo_min, "min"], ["RTO", analytics.rto_min, "min"], ["Disponib.", analytics.disponibilidade_pct, "%"]].map(([l, v, u]: any) => (
                  <div key={l}><p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p><p className="text-lg font-black text-indigo-700">{v ?? "—"}{u}</p></div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">{analytics.mttd_nota}</p>
            </div>
          </div>
        )}

        {/* MAPA DE SAÚDE */}
        {aba === "saude" && !isLoading && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {health.map((m: any) => {
              const e = ESTADO[m.estado] || ESTADO.indisponivel;
              return (
                <div key={m.ai} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-full ${e.dot}`} />
                    <span className="min-w-0 flex-1 truncate font-black text-zinc-800">{m.ai} · {m.nome}</span>
                    {MOD_URL[m.chave] && <a href={MOD_URL[m.chave]} className="text-zinc-400 hover:text-indigo-600"><ExternalLink className="h-3.5 w-3.5" /></a>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${e.c}`}>{e.ic} {m.estado}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${RISCO[m.risco_label] || "bg-slate-100"}`}>risco {m.risco_label}</span>
                    <span className="text-[11px] text-zinc-500">{m.abertos} aberto(s){m.criticos > 0 ? ` · ${m.criticos} crít.` : ""}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(m.metricas || {}).filter(([k]) => k !== "nota").map(([k, v]: any) => (
                      <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{k.replace(/_/g, " ")}: {String(v)}</span>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-400">cron {m.cron_ativo ? "ativo" : "inativo"} · último sinal {m.ultimo_evento_min ?? "—"}min atrás</p>
                </div>
              );
            })}
          </div>
        )}

        {/* ALERTAS */}
        {aba === "alertas" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!alertList.length ? <p className="text-xs text-zinc-400">Nenhum alerta SOC nos últimos 7 dias. 🎉</p> : alertList.map((a: any) => (
              <div key={a.id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[a.severidade] || ""}`}>{a.severidade}</span>
                  <span className="min-w-0 flex-1 truncate font-black text-zinc-800">{a.tipo}</span>
                  <span className="text-[10px] text-zinc-400">{fmt(a.em)}</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-600">{a.mensagem}</p>
                {(a.modulos || []).length > 0 && <div className="mt-1 flex flex-wrap gap-1">{a.modulos.map((mm: string) => <span key={mm} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">{mm}</span>)}</div>}
              </div>
            ))}
          </div>
        )}

        {/* INCIDENTES */}
        {aba === "incidentes" && !isLoading && (
          <div className="mt-4 space-y-2">
            <p className="text-[11px] text-zinc-500">Visão consolidada (referência ao módulo dono — o SOC não altera a decisão do incidente).</p>
            {!incList.length ? <p className="text-xs text-zinc-400">Nenhum incidente aberto.</p> : incList.map((i: any, k: number) => (
              <div key={k} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[i.severidade] || ""}`}>{i.severidade}</span>
                  <span className="min-w-0 flex-1 truncate font-black text-zinc-800">{i.titulo}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{i.status}</span>
                  <span className="text-[11px] font-black text-indigo-700">P{i.prioridade}</span>
                  {MOD_URL[i.modulo] && <a href={MOD_URL[i.modulo]} className="text-zinc-400 hover:text-indigo-600"><ExternalLink className="h-3.5 w-3.5" /></a>}
                </div>
                <p className="mt-1 text-[10px] text-zinc-400">{i.modulo} · ref {i.ref}</p>
              </div>
            ))}
          </div>
        )}

        {/* TIMELINE GLOBAL */}
        {aba === "timeline" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">Timeline global do ecossistema</h3>
            <div className="max-h-[32rem] space-y-1 overflow-auto">
              {timeline.map((t: any, k: number) => {
                const e = ESTADO[health.find((h: any) => h.chave === t.modulo)?.estado] || ESTADO.operacional;
                return (
                  <div key={k} className="flex items-center gap-2 border-b border-zinc-50 py-1 text-[11px]">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${e.dot}`} />
                    <span className="w-32 shrink-0 text-zinc-400">{fmt(t.em)}</span>
                    <span className="w-40 shrink-0 truncate font-bold text-indigo-600">{t.modulo}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-600">{t.tipo}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ESTATÍSTICAS */}
        {aba === "estatisticas" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">Série (14 dias)</h3>
            {!stats.length ? <p className="text-xs text-zinc-400">Sem estatísticas ainda.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead><tr className="text-zinc-400">
                    <th className="pb-1 pr-3">Dia</th><th className="pr-3">OSS</th><th className="pr-3">ORS</th><th className="pr-3">GHS</th><th className="pr-3">ECS</th>
                    <th className="pr-3">MTTR</th><th className="pr-3">MTTC</th><th className="pr-3">RPO</th><th className="pr-3">RTO</th><th className="pr-3">Incid.</th><th className="pr-3">Alertas</th><th>Disp.</th>
                  </tr></thead>
                  <tbody>{stats.map((s: any) => (
                    <tr key={s.dia} className="border-t border-zinc-50 font-semibold text-zinc-600">
                      <td className="py-1 pr-3">{s.dia}</td><td className="pr-3">{s.oss}</td><td className="pr-3">{s.ors}</td><td className="pr-3">{s.ghs}</td><td className="pr-3">{s.ecs}</td>
                      <td className="pr-3">{s.mttr}min</td><td className="pr-3">{s.mttc}min</td><td className="pr-3">{s.rpo}min</td><td className="pr-3">{s.rto}min</td><td className="pr-3">{s.incidentes}</td><td className="pr-3">{s.alertas}</td><td>{s.disp}%</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* CONFIG */}
        {aba === "config" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="grid gap-2 sm:grid-cols-3">
                {[["Cron", `${config.cron?.job || "—"} ${config.cron?.schedule || ""}`], ["Modelo IA", config.modelo_ia], ["Módulos coordenados", (config.modulos_coordenados || []).length]].map(([l, v]: any) => (
                  <div key={l}><p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p><p className="text-sm font-black text-zinc-700">{String(v ?? "—")}</p></div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(config.modulos_coordenados || []).map((m: string, i: number) => (
                  <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{m}</span>
                ))}
              </div>
              <p className="mt-3 rounded-2xl bg-indigo-50 px-3 py-2 text-[11px] font-bold text-indigo-800">🎖 {config.regra}</p>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Playbooks executivos de coordenação</h3>
              {(config.playbooks || []).map((p: any, i: number) => (
                <details key={i} className="mb-2 rounded-2xl bg-slate-50 p-3">
                  <summary className="cursor-pointer text-xs font-black text-zinc-700">{p.nome} <span className="font-normal text-zinc-400">· {p.gatilho}</span></summary>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[11px] text-zinc-600">
                    {(p.passos || []).map((s: string, j: number) => <li key={j}>{String(s).replace(/^\d+\.\s*/, "")}</li>)}
                  </ol>
                </details>
              ))}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION SOC Commander v1.0 · ORION-AI-49 · OSS/ORS/GHS/ECS + MTTD/MTTR/MTTC/RPO/RTO · consolida AI-40…AI-48 ·
          read-only (nunca altera decisões) · mapa de saúde + timeline global + playbooks executivos · tick */2 · FECHA o Security Ecosystem
        </p>
      </div>
    </div>
  );
}
