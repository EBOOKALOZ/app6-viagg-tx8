/**
 * /admin/orion-backup-recovery — ORION Backup & Disaster Recovery AI (ORION-AI-46)
 *
 * Guardião da continuidade: valida continuamente que os backups existem, estão
 * íntegros, são restauráveis e atendem RPO/RTO. Manifesto de schema com checksums
 * reais + estado real da Management API (WAL-G/PITR). NUNCA restaura produção
 * automaticamente. Scores BRS/RRS/DIS/CRI. 6º módulo do Security Ecosystem.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DatabaseBackup, Loader2, Gauge, Archive, RotateCcw, ClipboardList, Bell, BarChart3, History, Settings } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const scoreColor = (s: number, invert = false) => {
  const good = invert ? s <= 20 : s >= 80;
  const mid = invert ? s <= 50 : s >= 50;
  return good ? "text-emerald-300" : mid ? "text-amber-300" : "text-red-300";
};
const SEV: Record<string, string> = { critica: "bg-red-100 text-red-700", alta: "bg-amber-100 text-amber-700", media: "bg-yellow-100 text-yellow-700", baixa: "bg-slate-100 text-slate-600" };
const ST: Record<string, string> = { aberto: "bg-red-100 text-red-700", reconhecido: "bg-amber-100 text-amber-700", resolvido: "bg-emerald-100 text-emerald-700", aprovado: "bg-emerald-100 text-emerald-700", parcial: "bg-amber-100 text-amber-700", reprovado: "bg-red-100 text-red-700", ok: "bg-emerald-100 text-emerald-700", drift: "bg-amber-100 text-amber-700" };

type Aba = "resumo" | "backups" | "restore" | "planos" | "alertas" | "estatisticas" | "historico" | "config";

const fmtDate = (v: any) => v ? String(v).slice(0, 19).replace("T", " ") : "—";

export default function AdminOrionBackup() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-backup"], queryFn: () => rpc("backup_dashboard"), refetchInterval: 60000,
  });

  const ov = dash?.overview || {};
  const catalog = (dash?.catalog || []) as any[];
  const restore = dash?.restore || {};
  const rtCasos = (restore?.ultimo?.relatorio?.casos || []) as any[];
  const integ = restore?.integridade || {};
  const plans = dash?.plans || {};
  const alerts = dash?.alerts || {};
  const alertList = (alerts?.lista || []) as any[];
  const stats = (dash?.statistics?.serie_7d || []) as any[];
  const hist = dash?.history || {};
  const config = dash?.config || {};

  const runTest = async () => {
    setBusy(true); setMsg("");
    try { const r = await rpc("backup_restore_test"); setMsg(`✓ Teste de restauração: ${r.status} (${r.aprovados}/${r.validados} OK, RTO ~${r.rto_estimado_min}min).`); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); }
    finally { setBusy(false); }
  };
  const runSelftest = async () => {
    setBusy(true); setMsg("");
    try { const r = await rpc("backup_selftest"); setMsg(`Suíte de testes: ${r.passou}/${r.total} ${r.aprovado ? "APROVADA ✓" : "com falhas"}.`); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0a1512] via-[#12241d] to-[#0a1512] p-6 text-white shadow-xl ring-1 ring-emerald-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <DatabaseBackup className="h-8 w-8 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Backup & Disaster Recovery</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-46 · guardião da continuidade · prova backup íntegro/restaurável · nunca restaura produção sozinho
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-emerald-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">Critical Recovery Index</p>
              <p className={`text-4xl font-black ${scoreColor(ov.cri ?? 0)}`}>{ov.cri ?? "—"}</p>
              <p className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">{ov.alertas_abertos ?? 0} alerta(s)</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["BRS", ov.brs], ["RRS", ov.rrs], ["DIS", ov.dis], ["Cobertura", `${ov.cobertura_pct ?? 0}%`],
              ["RPO validado", `${ov.rpo_validado_min ?? "—"}min`], ["RTO estimado", `${ov.rto_estimado_min ?? "—"}min`]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Gauge, "Resumo"], ["backups", Archive, "Backups"], ["restore", RotateCcw, "Restore"],
             ["planos", ClipboardList, "Planos"], ["alertas", Bell, `Alertas${ov.alertas_abertos ? ` (${ov.alertas_abertos})` : ""}`],
             ["estatisticas", BarChart3, "Estatísticas"], ["historico", History, "Histórico"], ["config", Settings, "Config"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#12241d] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {msg && <p className="mt-3 rounded-2xl bg-slate-100 px-4 py-2 text-xs font-bold text-zinc-700">{msg}</p>}
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>}

        {/* RESUMO */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Backup Reliability (BRS)", ov.brs, false, "existência + integridade + recência"],
                ["Recovery Readiness (RRS)", ov.rrs, false, "plano + restore test + cobertura"],
                ["Disaster Impact (DIS)", ov.dis, true, "impacto se o desastre for agora (menor = melhor)"],
                ["Critical Recovery (CRI)", ov.cri, false, "índice composto de prontidão"]].map(([l, v, inv, d]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className={`text-2xl font-black ${(inv ? v <= 20 : v >= 80) ? "text-emerald-600" : (inv ? v <= 50 : v >= 50) ? "text-amber-600" : "text-red-600"}`}>{v ?? "—"}</p>
                  <p className="text-[10px] text-zinc-400">{d}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Último backup", fmtDate(ov.ultimo_backup)], ["Tipo", ov.ultimo_tipo], ["Status", ov.ultimo_status],
                ["Próximo", ov.proximo_backup], ["Tempo médio", `${ov.tempo_medio_s ?? 0}s`], ["Falhas", ov.falhas],
                ["Restore testados", ov.restore_testados], ["Restore aprovados", ov.restore_aprovados]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="truncate text-sm font-black text-zinc-700">{String(v ?? "—")}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-emerald-100 bg-emerald-50/50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-[11px] font-semibold text-emerald-800">
                  RPO de dados contínuo via WAL-G {ov.rpo_continuo_walg ? "✓ ativo" : "✗ inativo"} · PITR {ov.pitr ? "✓" : "✗ desabilitado"} · snapshots nomeados: {ov.snapshots ?? 0}
                </p>
                <button onClick={runTest} disabled={busy} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-40">Rodar restore test</button>
                <button onClick={runSelftest} disabled={busy} className="rounded-xl bg-zinc-800 px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-40">Suíte de testes</button>
              </div>
              <p className="mt-1 text-[10px] text-emerald-700/70">{ov.nota}</p>
            </div>
          </div>
        )}

        {/* BACKUPS (catálogo) */}
        {aba === "backups" && !isLoading && (
          <div className="mt-4 space-y-2">
            {catalog.map((c: any, i: number) => (
              <div key={i} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${c.presente ? "bg-emerald-500" : "bg-zinc-300"}`} />
                  <span className="min-w-0 flex-1 truncate font-black text-zinc-800">{c.tipo}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{c.metodo}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${c.presente ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{c.presente ? "presente" : "ausente/declarado"}</span>
                  {c.criado_em && <span className="text-[10px] text-zinc-400">{fmtDate(c.criado_em)}</span>}
                </div>
                <p className="mt-1 text-[10px] text-zinc-500">{c.evidencias?.nota || c.referencia}</p>
              </div>
            ))}
          </div>
        )}

        {/* RESTORE */}
        {aba === "restore" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 flex-1 text-sm font-black text-zinc-700">Último teste de restauração (não-destrutivo)</h3>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ST[restore?.ultimo?.status] || ""}`}>{restore?.ultimo?.status ?? "—"}</span>
                <span className="text-[11px] text-zinc-500">{restore?.ultimo?.ok ?? 0}/{restore?.ultimo?.validados ?? 0} OK · RTO ~{restore?.ultimo?.rto_min ?? "—"}min</span>
                <button onClick={runTest} disabled={busy} className="rounded-xl bg-emerald-600 px-3 py-1 text-[11px] font-black text-white disabled:opacity-40">Rodar agora</button>
              </div>
              <div className="mt-2 space-y-1">
                {rtCasos.map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className={c.ok ? "text-emerald-600" : "text-red-600"}>{c.ok ? "✓" : "✗"}</span>
                    <span className="font-semibold text-zinc-600">{c.caso}</span>
                    {!c.ok && c.tabelas_sem_rls != null && <span className="text-red-500">({c.tabelas_sem_rls} tabelas sem RLS)</span>}
                    {c.jobs != null && <span className="text-zinc-400">({c.jobs} jobs)</span>}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">Restore real exige ambiente separado + aprovação humana. Este teste nunca toca a produção.</p>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Integridade do manifesto (checksums por categoria)</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {(integ.categorias || []).map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl bg-slate-50 px-2 py-1.5 text-[11px]">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${c.estado === "estavel" ? "bg-emerald-100 text-emerald-700" : c.estado === "drift" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{c.estado}</span>
                    <span className="min-w-0 flex-1 truncate font-bold text-zinc-600">{c.categoria}</span>
                    <span className="text-zinc-400">{c.objetos} obj</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PLANOS */}
        {aba === "planos" && !isLoading && (
          <div className="mt-4 space-y-4">
            {(plans.planos || []).map((p: any) => (
              <div key={p.id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${p.ativo ? "bg-emerald-500" : "bg-zinc-300"}`} />
                  <span className="min-w-0 flex-1 truncate font-black text-zinc-800">{p.nome}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{p.escopo}</span>
                  <span className="text-[11px] text-zinc-500">RPO {p.rpo_meta_min}min · RTO {p.rto_meta_min}min</span>
                </div>
                <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[11px] text-zinc-600">
                  {(p.passos || []).map((s: string, i: number) => <li key={i}>{String(s).replace(/^\d+\.\s*/, "")}</li>)}
                </ol>
              </div>
            ))}
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Eventos de recuperação (drills / solicitações)</h3>
              {!(plans.eventos || []).length ? <p className="text-xs text-zinc-400">Nenhum evento.</p> : plans.eventos.map((e: any) => (
                <div key={e.id} className="mb-1 flex flex-wrap items-center gap-2 border-b border-zinc-50 pb-1 text-[11px]">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">{e.tipo}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ST[e.status] || "bg-slate-100 text-slate-500"}`}>{e.status}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-500">{e.motivo}</span>
                  <span className="text-zinc-400">{e.operador} · {fmtDate(e.em)}</span>
                </div>
              ))}
              <p className="mt-2 text-[10px] text-zinc-400">Restauração real exige solicitação + aprovação humana; o módulo nunca executa restore em produção.</p>
            </div>
          </div>
        )}

        {/* ALERTAS */}
        {aba === "alertas" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!alertList.length ? <p className="text-xs text-zinc-400">Nenhum alerta nos últimos 7 dias. 🎉</p> : alertList.map((a: any) => (
              <div key={a.id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[a.severidade] || ""}`}>{a.severidade}</span>
                  <span className="min-w-0 flex-1 truncate font-black text-zinc-800">{a.tipo}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ST[a.status] || ""}`}>{a.status}</span>
                  <span className="text-[10px] text-zinc-400">{fmtDate(a.em)}</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-600">{a.mensagem}</p>
              </div>
            ))}
          </div>
        )}

        {/* ESTATÍSTICAS */}
        {aba === "estatisticas" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">Série (7 dias)</h3>
            {!stats.length ? <p className="text-xs text-zinc-400">Sem estatísticas ainda.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead><tr className="text-zinc-400">
                    <th className="pb-1 pr-3">Dia</th><th className="pr-3">BRS</th><th className="pr-3">RRS</th><th className="pr-3">DIS</th>
                    <th className="pr-3">CRI</th><th className="pr-3">RPO</th><th className="pr-3">RTO</th><th className="pr-3">Testes</th><th>Alertas</th>
                  </tr></thead>
                  <tbody>{stats.map((s: any) => (
                    <tr key={s.dia} className="border-t border-zinc-50 font-semibold text-zinc-600">
                      <td className="py-1 pr-3">{s.dia}</td><td className="pr-3">{s.brs}</td><td className="pr-3">{s.rrs}</td><td className="pr-3">{s.dis}</td>
                      <td className="pr-3">{s.cri}</td><td className="pr-3">{s.rpo_min}min</td><td className="pr-3">{s.rto_min}min</td><td className="pr-3">{s.restore_tests}</td><td>{s.alertas}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* HISTÓRICO */}
        {aba === "historico" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Jobs de backup / manifesto</h3>
              <div className="max-h-96 space-y-1 overflow-auto">
                {(hist.jobs || []).map((j: any) => (
                  <div key={j.id} className="flex flex-wrap items-center gap-2 border-b border-zinc-50 pb-1 text-[11px]">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">#{j.id}</span>
                    <span className="font-bold text-zinc-700">{j.tipo}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ST[j.integridade] || "bg-slate-100 text-slate-500"}`}>{j.integridade}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-400">{j.objetos} obj · {j.checksum} · {j.duracao_s}s</span>
                    <span className="text-zinc-400">{fmtDate(j.em)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Evidências do último manifesto (checksums)</h3>
              {(hist.evidencias_recentes || []).map((e: any, i: number) => (
                <div key={i} className="mb-1 flex items-center gap-2 border-b border-zinc-50 pb-1 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[e.criticidade] || ""}`}>{e.criticidade}</span>
                  <span className="min-w-0 flex-1 truncate font-bold text-zinc-600">{e.categoria}</span>
                  <span className="text-zinc-400">{e.objetos} obj</span>
                  <code className="rounded bg-slate-100 px-1 text-[10px] text-zinc-500">{e.checksum}</code>
                </div>
              ))}
              <p className="mt-2 text-[10px] text-zinc-400">Evidências imutáveis (append-only): base real de detecção de drift/corrupção.</p>
            </div>
          </div>
        )}

        {/* CONFIG */}
        {aba === "config" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="grid gap-2 sm:grid-cols-3">
                {[["Cron", `${config.cron?.job || "—"} ${config.cron?.schedule || ""}`], ["Modelo IA", config.modelo_ia], ["Planos ativos", config.planos_ativos]].map(([l, v]: any) => (
                  <div key={l}><p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p><p className="text-sm font-black text-zinc-700">{String(v ?? "—")}</p></div>
                ))}
              </div>
              <p className="mt-3 text-[11px] font-bold text-zinc-600">Escopo monitorado</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(config.escopo_monitorado || []).map((e: string, i: number) => (
                  <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{e}</span>
                ))}
              </div>
              <p className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800">🔒 {config.seguranca}</p>
            </div>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="mb-1 text-sm font-black text-amber-800">Lacunas declaradas (nunca inventamos backup)</h3>
              {(config.lacunas || []).map((l: string, i: number) => <p key={i} className="text-[11px] font-semibold text-amber-700">· {l}</p>)}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Backup & Disaster Recovery v1.0 · ORION-AI-46 · BRS/RRS/DIS/CRI + RPO/RTO · manifesto de schema com checksums reais ·
          restore não-destrutivo · restauração real só com aprovação humana · tick */15
        </p>
      </div>
    </div>
  );
}
