/**
 * /admin/orion-zero-trust — ORION Zero Trust AI (ORION-AI-47)
 *
 * Camada central de decisão de acesso do Security Ecosystem: "nunca confiar,
 * sempre verificar". Toda avaliação produz ZTS/CAS/DAS/SAS→RCS + decisão com
 * justificativa e evidências imutáveis. Avaliação contínua via tick a cada
 * 2 min — o acesso pode ser reclassificado durante a própria sessão. Recomenda;
 * bloqueios efetivos dependem de execução humana/integração do front.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Lock, Loader2, Gauge, MonitorSmartphone, Laptop, BookKey, Scale,
  AlertTriangle, Archive, BarChart3, Settings2,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const scoreColor = (s: number) => s >= 80 ? "text-emerald-300" : s >= 60 ? "text-lime-300" : s >= 40 ? "text-amber-300" : "text-red-300";
const DEC: Record<string, string> = {
  permitir: "bg-emerald-100 text-emerald-700", permitir_monitorado: "bg-lime-100 text-lime-700",
  reautenticar: "bg-amber-100 text-amber-700", exigir_mfa: "bg-yellow-100 text-yellow-700",
  aprovacao_admin: "bg-orange-100 text-orange-700", bloqueio_temporario: "bg-red-100 text-red-700",
  negar: "bg-red-200 text-red-800", revogada: "bg-zinc-200 text-zinc-500",
};
const EST: Record<string, string> = {
  validada: "bg-emerald-100 text-emerald-700", monitorada: "bg-lime-100 text-lime-700",
  reavaliar: "bg-amber-100 text-amber-700", bloqueio_recomendado: "bg-red-100 text-red-700",
  confiavel: "bg-emerald-100 text-emerald-700", em_risco: "bg-red-100 text-red-700",
  bloqueado: "bg-red-200 text-red-800", monitorado: "bg-lime-100 text-lime-700",
};

type Aba = "resumo" | "sessoes" | "dispositivos" | "politicas" | "decisoes" | "riscos" | "evidencias" | "estatisticas" | "config";

function Evid({ dados }: { dados: any }) {
  return <pre className="overflow-auto rounded-xl bg-white p-2 text-[10px] text-zinc-500">{JSON.stringify(dados, null, 2)}</pre>;
}

export default function AdminOrionZeroTrust() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-zero-trust"], queryFn: () => rpc("zerotrust_dashboard"), refetchInterval: 60000,
  });

  const ov = dash?.overview || {};
  const sess = dash?.sessoes || {};
  const dev = dash?.dispositivos || {};
  const pol = dash?.politicas || {};
  const dec = dash?.decisoes || {};
  const risco = dash?.riscos || {};
  const evd = dash?.evidencias || {};
  const est = dash?.estatisticas || {};
  const cfg = dash?.config || {};
  const met = dash?.metrics || {};
  const lacunas = (dash?.lacunas || []) as string[];

  const run = async (label: string, fn: string, args: Record<string, unknown> | undefined, okMsg: (r: any) => string) => {
    setBusy(label); setMsg("");
    try { const r = await rpc(fn, args); setMsg(`✓ ${okMsg(r)}`); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); }
    finally { setBusy(null); }
  };

  const revogar = (id: number) =>
    run(`rb:${id}`, "zerotrust_decision_rollback", { p_decision_id: id, p_motivo: "revogação via painel ZERO TRUST" },
      (r) => r?.ok ? `Decisão #${id} revogada (linha compensatória #${r.compensatoria}).` : `Recusado: ${r?.motivo}`);
  const selftest = () =>
    run("selftest", "zerotrust_selftest", undefined,
      (r) => `Selftest: ${r?.ok ? "TODOS OS TESTES VERDES" : "HÁ FALHAS"} (${(r?.testes || []).length} testes — relatório gravado no cofre de evidências).`);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#041410] via-[#0e2a22] to-[#041410] p-6 text-white shadow-xl ring-1 ring-emerald-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <Lock className="h-8 w-8 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Zero Trust</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-47 · Security Ecosystem · nunca confiar, sempre verificar · decisões explicáveis com evidência imutável
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-emerald-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">Score Geral Zero Trust</p>
              <p className={`text-4xl font-black ${scoreColor(ov.ztg ?? 0)}`}>{ov.ztg ?? "—"}</p>
              <p className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">ZTS médio {ov.zts_medio ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Decisões/min (1h)", ov.decisoes_por_minuto], ["Permitidas hoje", ov.permitidas_hoje],
              ["Negadas hoje", ov.negadas_hoje], ["Autent. adicionais", ov.autenticacoes_adicionais_hoje],
              ["Sessões monitoradas", ov.sessoes_monitoradas], ["Disp. em risco", ov.dispositivos_em_risco]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Gauge, "Resumo"], ["sessoes", MonitorSmartphone, "Sessões"],
             ["dispositivos", Laptop, "Dispositivos"], ["politicas", BookKey, "Políticas"],
             ["decisoes", Scale, "Decisões"], ["riscos", AlertTriangle, "Riscos"],
             ["evidencias", Archive, "Evidências"], ["estatisticas", BarChart3, "Estatísticas"],
             ["config", Settings2, "Configurações"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#0e2a22] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {msg && <p className="mt-3 rounded-2xl bg-slate-100 px-4 py-2 text-xs font-bold text-zinc-700">{msg}</p>}
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>}

        {/* RESUMO */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["ZTS médio", ov.zts_medio, "confiança Zero Trust dos usuários"],
                ["RCS médio (hoje)", ov.rcs_medio, "confiança média das solicitações"],
                ["Decisões hoje", ov.decisoes_hoje, "todas com justificativa + evidência"],
                ["Usuários risco alto", ov.usuarios_risco_alto, "risco acumulado ≥ 60"]].map(([l, v, d]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-2xl font-black text-emerald-700">{v ?? "—"}</p>
                  <p className="text-[10px] text-zinc-400">{d}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                <p className="text-[10px] font-bold uppercase text-zinc-400">Sessões (bloqueio recomendado)</p>
                <p className="text-2xl font-black text-zinc-800">{ov.sessoes_bloqueio_recomendado ?? 0}</p>
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                <p className="text-[10px] font-bold uppercase text-zinc-400">Dispositivos confiáveis</p>
                <p className="text-2xl font-black text-zinc-800">{ov.dispositivos_confiaveis ?? 0}</p>
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                <p className="text-[10px] font-bold uppercase text-zinc-400">Políticas ativas / exceções</p>
                <p className="text-2xl font-black text-zinc-800">{ov.politicas_ativas ?? 0} <span className="text-sm text-zinc-400">/ {ov.excecoes_ativas ?? 0}</span></p>
              </div>
            </div>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="mb-1 text-sm font-black text-amber-800">Lacunas declaradas (nunca inventamos sinal)</h3>
              {lacunas.map((l, i) => <p key={i} className="text-[11px] font-semibold text-amber-700">· {l}</p>)}
            </div>
          </div>
        )}

        {/* SESSÕES */}
        {aba === "sessoes" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(sess.por_estado || {}).map(([k, v]: any) => (
                <span key={k} className={`rounded-full px-3 py-1 text-[11px] font-bold ${EST[k] || "bg-slate-100 text-slate-600"}`}>{k}: {v}</span>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🖥 Avaliação contínua (menor SAS primeiro)</h3>
              {!(sess.lista || []).length ? <p className="text-xs text-zinc-400">Nenhuma sessão avaliada.</p> : sess.lista.map((s: any) => (
                <details key={s.session_id} className="mb-2 rounded-2xl bg-slate-50 p-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className={`text-sm font-black ${scoreColor(s.sas).replace("300", "600")}`}>SAS {s.sas}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">{s.user_id}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${EST[s.estado] || ""}`}>{s.estado}</span>
                  </summary>
                  <div className="mt-2 text-[11px] text-zinc-600">
                    <p className="truncate">Sessão: {s.session_id} · Avaliada: {String(s.ultima_avaliacao).slice(0, 19).replace("T", " ")}</p>
                    <Evid dados={s.evidencias} />
                  </div>
                </details>
              ))}
              <p className="mt-2 text-[10px] text-zinc-400">O acesso é reavaliado a cada tick — pode ser reclassificado durante a própria sessão.</p>
            </div>
          </div>
        )}

        {/* DISPOSITIVOS */}
        {aba === "dispositivos" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(dev.por_estado || {}).map(([k, v]: any) => (
                <span key={k} className={`rounded-full px-3 py-1 text-[11px] font-bold ${EST[k] || "bg-slate-100 text-slate-600"}`}>{k}: {v}</span>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">📱 Dispositivos (menor DAS primeiro)</h3>
              {!(dev.lista || []).length ? <p className="text-xs text-zinc-400">Nenhum dispositivo.</p> : dev.lista.map((d: any) => (
                <details key={d.device_id} className="mb-2 rounded-2xl bg-slate-50 p-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className={`text-sm font-black ${scoreColor(d.das).replace("300", "600")}`}>DAS {d.das}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">{d.device_id}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${EST[d.estado] || ""}`}>{d.estado}</span>
                  </summary>
                  <div className="mt-2 text-[11px] text-zinc-600">
                    <p className="truncate">Usuário: {d.user_id}</p>
                    <Evid dados={d.motivos} />
                    <p className="text-[10px] text-zinc-400">Bloqueio físico do dispositivo: painel IDENTITY (AI-42), ação humana reversível.</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}

        {/* POLÍTICAS */}
        {aba === "politicas" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">📜 Políticas Zero Trust (mais específica vence)</h3>
              {!(pol.lista || []).length ? <p className="text-xs text-zinc-400">Nenhuma política.</p> : pol.lista.map((p: any) => (
                <div key={p.policy_key} className="mb-2 rounded-2xl bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-black text-zinc-700">{p.policy_key}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">{p.escopo}{p.escopo_ref ? `:${p.escopo_ref}` : ""}</span>
                    {p.excecao_ate && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">EXCEÇÃO até {String(p.excecao_ate).slice(0, 16).replace("T", " ")}</span>}
                    {!p.ativa && <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-black text-zinc-500">inativa</span>}
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">{p.descricao}</p>
                  <p className="text-[10px] text-zinc-400">
                    faixas RCS: ≥{p.limiares?.permitir} permitir · ≥{p.limiares?.monitorar} monitorar · ≥{p.limiares?.reautenticar} reautenticar ·
                    ≥{p.limiares?.mfa} MFA · ≥{p.limiares?.aprovacao} aprovação · ≥{p.limiares?.bloqueio} bloqueio · abaixo: negar
                  </p>
                </div>
              ))}
              <p className="mt-2 text-[10px] text-zinc-400">Alterações via RPC zerotrust_policy_set — sempre auditadas (antes/depois no cofre); rollback lógico = reaplicar valores anteriores. Exceções temporárias têm prazo + motivo.</p>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🧾 Trilha de alterações de política</h3>
              {!(pol.alteracoes || []).length ? <p className="text-xs text-zinc-400">Nenhuma alteração registrada.</p> : pol.alteracoes.map((a: any) => (
                <details key={a.evidence_id} className="mb-1 rounded-2xl bg-slate-50 p-2">
                  <summary className="cursor-pointer text-[11px] font-bold text-zinc-600">{a.politica} · {String(a.em).slice(0, 19).replace("T", " ")}</summary>
                  <Evid dados={a.evidencias} />
                </details>
              ))}
            </div>
          </div>
        )}

        {/* DECISÕES */}
        {aba === "decisoes" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(dec.por_decisao_hoje || {}).map(([k, v]: any) => (
                <span key={k} className={`rounded-full px-3 py-1 text-[11px] font-bold ${DEC[k] || "bg-slate-100 text-slate-600"}`}>{k}: {v}</span>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">⚖️ Decisões (imutáveis; reversão = linha compensatória)</h3>
              {!(dec.lista || []).length ? <p className="text-xs text-zinc-400">Nenhuma decisão registrada.</p> : dec.lista.map((d: any) => (
                <details key={d.decision_id} className="mb-2 rounded-2xl bg-slate-50 p-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${DEC[d.decisao] || ""}`}>{d.decisao}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">#{d.decision_id} · {d.modulo}/{d.acao} · {d.user_id ?? "?"}</span>
                    <span className="text-[11px] font-black text-zinc-600">RCS {d.rcs}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{d.origem}</span>
                    {d.rollback_de && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">↺ revoga #{d.rollback_de}</span>}
                  </summary>
                  <div className="mt-2 space-y-1 text-[11px] text-zinc-600">
                    <p><b>Justificativa:</b> {d.justificativa}</p>
                    <p>Política: {d.politica}{d.excecao ? " · exceção ativa" : ""} · {String(d.em).slice(0, 19).replace("T", " ")}</p>
                    <Evid dados={d.evidencias} />
                    {d.decisao !== "revogada" && !d.rollback_de && (
                      <button onClick={() => revogar(d.decision_id)} disabled={busy === `rb:${d.decision_id}`}
                        className="rounded-xl bg-zinc-800 px-3 py-1 text-[11px] font-black text-white disabled:opacity-40">Revogar (compensatória)</button>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}

        {/* RISCOS */}
        {aba === "riscos" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">⚠️ Risco acumulado por usuário (AI-40/41/42/43/44)</h3>
              {!(risco.usuarios || []).length ? <p className="text-xs text-zinc-400">Nenhum risco calculado.</p> : risco.usuarios.map((r: any) => (
                <details key={r.user_id} className="mb-2 rounded-2xl bg-slate-50 p-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className={`text-sm font-black ${r.risco >= 60 ? "text-red-600" : r.risco >= 30 ? "text-amber-600" : "text-emerald-600"}`}>risco {r.risco}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">{r.user_id}</span>
                    {r.persistente_desde && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">persistente</span>}
                  </summary>
                  <div className="mt-2 text-[11px] text-zinc-600"><Evid dados={r.componentes} /></div>
                </details>
              ))}
              <p className="mt-2 text-[10px] text-zinc-400">Risco ≥60 penaliza ZTS/SAS/DAS e pode exigir reautenticação nas decisões. AI-45/46: componentes declarados até existirem.</p>
            </div>
          </div>
        )}

        {/* EVIDÊNCIAS */}
        {aba === "evidencias" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(evd.por_tipo || {}).map(([k, v]: any) => (
                <span key={k} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">{k}: {v}</span>
              ))}
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold text-emerald-700">total: {evd.total ?? 0}</span>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🗄 Cofre de evidências (append-only — NUNCA removidas)</h3>
              {!(evd.lista || []).length ? <p className="text-xs text-zinc-400">Nenhuma evidência.</p> : evd.lista.map((e: any) => (
                <details key={e.evidence_id} className="mb-1 rounded-2xl bg-slate-50 p-2">
                  <summary className="cursor-pointer text-[11px] font-bold text-zinc-600">#{e.evidence_id} · {e.ref_tipo}/{e.ref_id} · {String(e.em).slice(0, 19).replace("T", " ")}</summary>
                  <Evid dados={e.evidencias} />
                </details>
              ))}
            </div>
          </div>
        )}

        {/* ESTATÍSTICAS */}
        {aba === "estatisticas" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">📊 Estatísticas diárias</h3>
            {!(est.dias || []).length ? <p className="text-xs text-zinc-400">Sem estatísticas ainda.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead><tr className="text-zinc-400">
                    <th className="pb-1 pr-3">Dia</th><th className="pr-3">Decisões</th><th className="pr-3">Permitidas</th>
                    <th className="pr-3">Monitoradas</th><th className="pr-3">Reautent.</th><th className="pr-3">MFA</th>
                    <th className="pr-3">Aprovação</th><th className="pr-3">Bloqueios</th><th className="pr-3">Negadas</th>
                    <th className="pr-3">ZTS</th><th className="pr-3">RCS</th><th>ZTG</th>
                  </tr></thead>
                  <tbody>{est.dias.map((s: any) => (
                    <tr key={s.dia} className="border-t border-zinc-50 font-semibold text-zinc-600">
                      <td className="py-1 pr-3">{s.dia}</td><td className="pr-3">{s.decisoes}</td><td className="pr-3">{s.permitidas}</td>
                      <td className="pr-3">{s.monitoradas}</td><td className="pr-3">{s.reautenticacoes}</td><td className="pr-3">{s.mfa_exigido}</td>
                      <td className="pr-3">{s.aprovacoes_admin}</td><td className="pr-3">{s.bloqueios}</td><td className="pr-3">{s.negadas}</td>
                      <td className="pr-3">{s.zts_medio}</td><td className="pr-3">{s.rcs_medio}</td><td>{s.ztg}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[10px] text-zinc-400">ZTG = 0.4·ZTS + 0.3·SAS + 0.3·DAS (médias do dia).</p>
          </div>
        )}

        {/* CONFIGURAÇÕES */}
        {aba === "config" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">⚙️ Motor</h3>
                {(cfg.cron || []).map((c: any) => (
                  <p key={c.job} className="text-[11px] font-semibold text-zinc-600">cron: {c.job} · {c.schedule} (avaliação contínua)</p>
                ))}
                <p className="mt-1 text-[11px] text-zinc-500">Métricas: {met.decisoes ?? 0} decisões · {met.evidencias ?? 0} evidências · {met.eventos_bus ?? 0} eventos no bus</p>
                <button onClick={selftest} disabled={busy === "selftest"}
                  className="mt-3 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-black text-white disabled:opacity-40">
                  ▶ Rodar suíte de testes (COMANDO TESTE)
                </button>
                {cfg.ultimo_teste && (
                  <details className="mt-2 rounded-2xl bg-slate-50 p-2">
                    <summary className="cursor-pointer text-[11px] font-bold text-zinc-600">
                      Último selftest: {cfg.ultimo_teste?.ok ? "✅ verde" : "❌ com falhas"} ({(cfg.ultimo_teste?.testes || []).length} testes)
                    </summary>
                    <Evid dados={cfg.ultimo_teste} />
                  </details>
                )}
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">🔗 Integrações do Security Ecosystem</h3>
                {Object.entries(cfg.integracoes || {}).map(([k, v]: any) => (
                  <p key={k} className="mb-1 flex items-center justify-between text-[11px] font-semibold text-zinc-600">
                    <span>{k}</span><span className="font-black text-zinc-700">{String(v)}</span>
                  </p>
                ))}
                <p className="mt-2 text-[10px] text-zinc-400">AI-45/46 são detectados automaticamente quando suas superfícies existirem no banco.</p>
              </div>
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Zero Trust v1.0 · ORION-AI-47 · ZTS/CAS/DAS/SAS/RCS + ZTG · nunca confiar, sempre verificar ·
          decisões explicáveis + evidências imutáveis · políticas com exceção temporária auditada · selftest 13 testes · tick */2
        </p>
      </div>
    </div>
  );
}
