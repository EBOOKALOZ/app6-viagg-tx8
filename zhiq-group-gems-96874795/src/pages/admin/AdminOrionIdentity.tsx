/**
 * /admin/orion-identity — ORION Identity & Access AI (ORION-AI-42)
 *
 * Identity & Access Engine oficial: valida identidades, analisa o contexto de
 * cada acesso (sessões, dispositivos, auditoria do GoTrue) e aplica políticas
 * adaptativas. 4 scores explicáveis (IS/ATS/SRS/DCS) + MAR + III.
 * Recomenda, NUNCA bloqueia sozinho — ações de alto impacto são humanas,
 * auditadas e reversíveis. 3º módulo do Security Ecosystem (AI-40..49).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Fingerprint, Loader2, Gauge, MonitorSmartphone, Laptop, Users,
  ShieldCheck, ScrollText, BookKey,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const scoreColor = (s: number) => s >= 80 ? "text-emerald-300" : s >= 60 ? "text-lime-300" : s >= 40 ? "text-amber-300" : "text-red-300";
const riskColor = (s: number) => s >= 80 ? "text-red-300" : s >= 60 ? "text-amber-300" : s >= 40 ? "text-yellow-300" : "text-emerald-300";
const SEV: Record<string, string> = { critica: "bg-red-100 text-red-700", alta: "bg-amber-100 text-amber-700", media: "bg-yellow-100 text-yellow-700", baixa: "bg-slate-100 text-slate-600" };
const ST: Record<string, string> = { registrada: "bg-zinc-100 text-zinc-500", detectada: "bg-slate-100 text-slate-600", em_analise: "bg-sky-100 text-sky-700", confirmada: "bg-red-100 text-red-700", falso_positivo: "bg-emerald-100 text-emerald-700", resolvida: "bg-zinc-100 text-zinc-500" };
const NIVEL: Record<string, string> = { alto: "bg-emerald-100 text-emerald-700", medio: "bg-lime-100 text-lime-700", observacao: "bg-amber-100 text-amber-700", baixo: "bg-red-100 text-red-700" };

type Aba = "resumo" | "sessoes" | "dispositivos" | "identidade" | "admin" | "eventos" | "politicas";

function Evid({ dados }: { dados: any }) {
  return <pre className="overflow-auto rounded-xl bg-white p-2 text-[10px] text-zinc-500">{JSON.stringify(dados, null, 2)}</pre>;
}

function Barras({ titulo, dados }: { titulo: string; dados: Record<string, number> }) {
  const entries = Object.entries(dados || {}).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 12);
  const max = Math.max(1, ...entries.map(([, v]) => Number(v)));
  return (
    <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-black text-zinc-700">{titulo}</h3>
      {!entries.length ? <p className="text-xs text-zinc-400">Sem dados.</p> : entries.map(([k, v]) => (
        <div key={k} className="mb-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="min-w-0 flex-1 truncate font-bold text-zinc-600">{k}</span>
            <span className="font-black text-zinc-700">{String(v)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-indigo-400" style={{ width: `${(Number(v) / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminOrionIdentity() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-identity"], queryFn: () => rpc("identity_dashboard"), refetchInterval: 60000,
  });

  const ov = dash?.overview || {};
  const sess = dash?.sessoes || {};
  const dev = dash?.dispositivos || {};
  const ident = dash?.identidade || {};
  const adm = dash?.admin || {};
  const ev = dash?.eventos || {};
  const pol = dash?.politicas || {};
  const met = dash?.metrics || {};
  const lacunas = (dash?.lacunas || []) as string[];
  const stats7 = (met?.estatisticas_7d || []) as any[];

  const run = async (label: string, fn: string, args: Record<string, unknown>, okMsg: string) => {
    setBusy(label); setMsg("");
    try { await rpc(fn, args); setMsg(`✓ ${okMsg}`); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); }
    finally { setBusy(null); }
  };

  const mark = (id: number, st: string) =>
    run(`mark:${id}`, "identity_mark", { p_event_id: id, p_status: st, p_motivo: "revisão via painel IDENTITY" }, `Evento #${id} marcado como ${st}.`);
  const blockDev = (id: string) =>
    run(`dev:${id}`, "identity_device_block", { p_device_id: id, p_motivo: "bloqueio via painel IDENTITY" }, `Dispositivo bloqueado (reversível).`);
  const unblockDev = (id: string) =>
    run(`dev:${id}`, "identity_device_unblock", { p_device_id: id, p_motivo: "desbloqueio via painel IDENTITY" }, `Dispositivo desbloqueado.`);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0b0b1a] via-[#1e1e2b] to-[#0b0b1a] p-6 text-white shadow-xl ring-1 ring-indigo-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 ring-1 ring-indigo-500/30">
              <Fingerprint className="h-8 w-8 text-indigo-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Identity & Access</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-42 · Security Ecosystem · identidade, sessões, dispositivos e políticas adaptativas · recomenda, nunca bloqueia sozinho
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-indigo-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-200/70">Identity Integrity Index</p>
              <p className={`text-4xl font-black ${scoreColor(ov.iii ?? 0)}`}>{ov.iii ?? "—"}</p>
              <p className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">IS médio {ov.is_medio ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Sessões ativas", ov.sessoes_ativas], ["Risco alto", ov.sessoes_risco_alto],
              ["Logins hoje", ov.logins_hoje], ["Tentativas negadas", ov.tentativas_negadas_hoje],
              ["Dispositivos", ov.dispositivos], ["MFA hoje", ov.mfa_executado_hoje]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Gauge, "Visão Geral"], ["sessoes", MonitorSmartphone, "Sessões"],
             ["dispositivos", Laptop, "Dispositivos"], ["identidade", Users, "Identidade"],
             ["admin", ShieldCheck, "Administração"], ["eventos", ScrollText, "Eventos"],
             ["politicas", BookKey, "Políticas"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#1e1e2b] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {msg && <p className="mt-3 rounded-2xl bg-slate-100 px-4 py-2 text-xs font-bold text-zinc-700">{msg}</p>}
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Identity Score (IS)", ov.is_medio, "confiança média das identidades", false],
                ["Access Trust Score (ATS)", ov.ats_medio, "confiança do acesso (IS + sessões + dispositivos)", false],
                ["Session Risk (SRS)", ov.srs_medio, "risco médio das sessões ativas", true],
                ["Device Confidence (DCS)", ov.dcs_medio, "confiança média dos dispositivos", false]].map(([l, v, d, inv]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className={`text-2xl font-black ${inv ? riskColor(v ?? 0).replace("300", "600") : "text-indigo-700"}`}>{v ?? "—"}</p>
                  <p className="text-[10px] text-zinc-400">{d}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                <p className="text-[10px] font-bold uppercase text-zinc-400">MFA Adoption Rate (MAR)</p>
                <p className="text-2xl font-black text-zinc-800">{((ov.mar ?? 0) * 100).toFixed(1)}%</p>
                <p className="text-[10px] text-zinc-400">real: MFA ainda não adotado na plataforma (DECLARADO)</p>
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                <p className="text-[10px] font-bold uppercase text-zinc-400">Usuários</p>
                <p className="text-2xl font-black text-zinc-800">
                  {ov.usuarios?.confiaveis ?? 0} <span className="text-sm font-bold text-zinc-400">confiáveis</span>
                </p>
                <p className="text-[10px] text-zinc-400">{ov.usuarios?.em_observacao ?? 0} em observação · {ov.usuarios?.bloqueados ?? 0} bloqueado(s)</p>
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                <p className="text-[10px] font-bold uppercase text-zinc-400">Eventos abertos</p>
                <p className="text-2xl font-black text-zinc-800">{ov.eventos_abertos ?? 0}</p>
                <p className="text-[10px] text-zinc-400">detectados/em análise aguardando revisão</p>
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">📊 Estatísticas (7 dias)</h3>
              {!stats7.length ? <p className="text-xs text-zinc-400">Sem estatísticas ainda.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead><tr className="text-zinc-400">
                      <th className="pb-1 pr-3">Dia</th><th className="pr-3">Logins</th><th className="pr-3">Suspeitos</th>
                      <th className="pr-3">Sessões</th><th className="pr-3">Risco alto</th><th className="pr-3">Disp. novos</th>
                      <th className="pr-3">IS</th><th className="pr-3">ATS</th><th className="pr-3">SRS</th><th className="pr-3">DCS</th><th>III</th>
                    </tr></thead>
                    <tbody>{stats7.map((s: any) => (
                      <tr key={s.dia} className="border-t border-zinc-50 font-semibold text-zinc-600">
                        <td className="py-1 pr-3">{s.dia}</td><td className="pr-3">{s.logins}</td><td className="pr-3">{s.suspeitos}</td>
                        <td className="pr-3">{s.sessoes}</td><td className="pr-3">{s.risco_alto}</td><td className="pr-3">{s.disp_novos}</td>
                        <td className="pr-3">{s.is}</td><td className="pr-3">{s.ats}</td><td className="pr-3">{s.srs}</td><td className="pr-3">{s.dcs}</td><td>{s.iii}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-[10px] text-zinc-400">III = 0.35·IS + 0.25·ATS + 0.20·(100−SRS) + 0.20·DCS — fórmula declarada na evidência de cada score.</p>
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
            <div className="grid gap-3 sm:grid-cols-3">
              {[["Ativas", sess.ativas], ["Encerradas (7d)", sess.encerradas_7d], ["Expiradas", sess.expiradas]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-xl font-black text-zinc-800">{String(v ?? 0)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🖥 Sessões ativas (ordenadas por risco)</h3>
              {!(sess.lista || []).length ? <p className="text-xs text-zinc-400">Nenhuma sessão ativa.</p> : sess.lista.map((s: any) => (
                <details key={s.session_id} className="mb-2 rounded-2xl bg-slate-50 p-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className={`text-sm font-black ${riskColor(s.srs).replace("300", "600")}`}>SRS {s.srs}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">
                      {s.navegador ?? "?"} · {s.sistema ?? "?"} · {s.ip ?? "sem IP"} · {s.horas_ativa}h ativa
                    </span>
                    {s.mfa && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">MFA</span>}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{s.aal}</span>
                  </summary>
                  <div className="mt-2 space-y-1 text-[11px] text-zinc-600">
                    <p className="truncate">Usuário: {s.user_id} · Sessão: {s.session_id}</p>
                    <p className="truncate">Dispositivo: {s.dispositivo} · Login: {String(s.login_at).slice(0, 19).replace("T", " ")}</p>
                    <Evid dados={s.evidencias} />
                  </div>
                </details>
              ))}
              <p className="mt-2 text-[10px] text-zinc-400">Localização geográfica por IP: sem fonte no banco (DECLARADO). Encerrar sessão de verdade é ação humana via Supabase.</p>
            </div>
          </div>
        )}

        {/* DISPOSITIVOS */}
        {aba === "dispositivos" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              {[["Conhecidos", dev.total], ["Novos (7d)", dev.novos_7d], ["Bloqueados", dev.bloqueados], ["DCS médio", dev.confianca_media]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-xl font-black text-zinc-800">{String(v ?? 0)}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Barras titulo="🌐 Por navegador" dados={dev.por_navegador} />
              <Barras titulo="💻 Por sistema operacional" dados={dev.por_sistema} />
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">📱 Dispositivos conhecidos</h3>
              {!(dev.lista || []).length ? <p className="text-xs text-zinc-400">Nenhum dispositivo registrado.</p> : dev.lista.map((d: any) => (
                <details key={d.device_id} className="mb-2 rounded-2xl bg-slate-50 p-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className={`text-sm font-black ${scoreColor(d.dcs).replace("300", "600")}`}>DCS {d.dcs}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">
                      {d.navegador ?? "?"} · {d.sistema ?? "?"} · {d.sessoes} sessão(ões)
                    </span>
                    {d.bloqueado && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">BLOQUEADO</span>}
                  </summary>
                  <div className="mt-2 space-y-1 text-[11px] text-zinc-600">
                    <p className="truncate">Usuário: {d.user_id}</p>
                    <p>Visto: {String(d.first_seen).slice(0, 10)} → {String(d.last_seen).slice(0, 19).replace("T", " ")}</p>
                    {d.motivo_bloqueio && <p className="font-bold text-red-600">Motivo: {d.motivo_bloqueio}</p>}
                    <Evid dados={d.evidencias} />
                    <div className="flex gap-2 pt-1">
                      {!d.bloqueado ? (
                        <button onClick={() => blockDev(d.device_id)} disabled={busy === `dev:${d.device_id}`}
                          className="rounded-xl bg-red-600 px-3 py-1 text-[11px] font-black text-white disabled:opacity-40">Bloquear dispositivo</button>
                      ) : (
                        <button onClick={() => unblockDev(d.device_id)} disabled={busy === `dev:${d.device_id}`}
                          className="rounded-xl bg-emerald-600 px-3 py-1 text-[11px] font-black text-white disabled:opacity-40">Desbloquear</button>
                      )}
                    </div>
                  </div>
                </details>
              ))}
              <p className="mt-2 text-[10px] text-zinc-400">Impressão derivada de user_agent (device_tokens vazia — DECLARADO). Bloqueio = ação humana auditada e reversível.</p>
            </div>
          </div>
        )}

        {/* IDENTIDADE */}
        {aba === "identidade" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[["Confiáveis", ident.confiaveis], ["Em observação", ident.em_observacao], ["Bloqueados", ident.bloqueados]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-xl font-black text-zinc-800">{String(v ?? 0)}</p>
                </div>
              ))}
            </div>
            <Barras titulo="🎓 Por nível de confiança" dados={ident.por_nivel} />
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🪪 Identidades (menor score primeiro)</h3>
              {!(ident.lista || []).length ? <p className="text-xs text-zinc-400">Nenhuma identidade sincronizada.</p> : ident.lista.map((p: any) => (
                <details key={p.user_id} className="mb-2 rounded-2xl bg-slate-50 p-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className={`text-sm font-black ${scoreColor(p.is).replace("300", "600")}`}>IS {p.is}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">
                      {p.user_id} · {p.tipo ?? "sem perfil"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${NIVEL[p.nivel] || ""}`}>{p.nivel}</span>
                    {p.admin && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700">ADMIN</span>}
                    <span className="text-[11px] font-black text-zinc-600">ATS {p.ats}</span>
                  </summary>
                  <div className="mt-2 space-y-1 text-[11px] text-zinc-600">
                    <p>Perfis: {JSON.stringify(p.perfis)} · Roles: {JSON.stringify(p.roles)} · Status: {p.status}</p>
                    <Evid dados={p.evidencias} />
                  </div>
                </details>
              ))}
              <p className="mt-2 text-[10px] text-zinc-400">Cada score traz os componentes na evidência (explicável). Multi-papéis: perfis independentes auditáveis por usuário.</p>
            </div>
          </div>
        )}

        {/* ADMINISTRAÇÃO */}
        {aba === "admin" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[["Administradores", adm.admins], ["Sessões admin ativas", adm.sessoes_admin_ativas], ["Alterações de permissão (30d)", adm.alteracoes_permissao_30d]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-xl font-black text-zinc-800">{String(v ?? 0)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🛡 Auditoria administrativa (permissões, MFA de admins, elevação)</h3>
              {!(adm.auditoria || []).length ? <p className="text-xs text-zinc-400">Nenhum evento administrativo.</p> : adm.auditoria.map((e: any) => (
                <details key={e.event_id} className="mb-2 rounded-2xl bg-slate-50 p-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[e.severity] || ""}`}>{e.severity}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">#{e.event_id} · {e.tipo} · {e.user_id ?? "-"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ST[e.status] || ""}`}>{e.status}</span>
                  </summary>
                  <div className="mt-2 text-[11px] text-zinc-600"><Evid dados={e.evidencias} /></div>
                </details>
              ))}
              <p className="mt-2 text-[10px] text-zinc-400">Elevação temporária de privilégio: política privilege_elevation (concessão SEMPRE humana com justificativa + prazo; o AI-42 audita a mudança de permissões por snapshot a cada tick).</p>
            </div>
          </div>
        )}

        {/* EVENTOS */}
        {aba === "eventos" && !isLoading && (
          <div className="mt-4 space-y-4">
            <Barras titulo="📂 Eventos por tipo (30d)" dados={ev.por_tipo} />
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🗒 Eventos relevantes (média+ ou administrativos)</h3>
              {!(ev.lista || []).length ? <p className="text-xs text-zinc-400">Nenhum evento relevante. 🎉</p> : ev.lista.map((e: any) => (
                <details key={e.event_id} className="mb-2 rounded-2xl bg-slate-50 p-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[e.severity] || ""}`}>{e.severity}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">#{e.event_id} · {e.tipo} · {e.categoria}</span>
                    <span className="text-[11px] font-black text-zinc-600">score {e.score}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ST[e.status] || ""}`}>{e.status}</span>
                  </summary>
                  <div className="mt-2 space-y-1 text-[11px] text-zinc-600">
                    <p className="truncate">Usuário: {e.user_id ?? "-"} · IP: {e.ip ?? "-"} · Origem: {e.origem} · {String(e.em).slice(0, 19).replace("T", " ")}</p>
                    <Evid dados={e.evidencias} />
                    {(e.status === "detectada" || e.status === "em_analise") && (
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => mark(e.event_id, "confirmada")} disabled={busy === `mark:${e.event_id}`}
                          className="rounded-xl bg-red-600 px-3 py-1 text-[11px] font-black text-white disabled:opacity-40">Confirmar</button>
                        <button onClick={() => mark(e.event_id, "falso_positivo")} disabled={busy === `mark:${e.event_id}`}
                          className="rounded-xl bg-emerald-600 px-3 py-1 text-[11px] font-black text-white disabled:opacity-40">Falso positivo</button>
                        <button onClick={() => mark(e.event_id, "resolvida")} disabled={busy === `mark:${e.event_id}`}
                          className="rounded-xl bg-zinc-700 px-3 py-1 text-[11px] font-black text-white disabled:opacity-40">Resolver</button>
                      </div>
                    )}
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
              <h3 className="mb-2 text-sm font-black text-zinc-700">📜 Políticas de acesso (identity_politica_v1)</h3>
              {!(pol.lista || []).length ? <p className="text-xs text-zinc-400">Nenhuma política.</p> : pol.lista.map((p: any) => (
                <div key={p.policy_key} className="mb-2 rounded-2xl bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-black text-zinc-700">{p.policy_key}</span>
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700">{p.acao}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{p.perfil}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${p.aprovacao === "humana" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{p.aprovacao}</span>
                    {!p.ativa && <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-black text-zinc-500">inativa</span>}
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">{p.descricao}</p>
                  <p className="text-[10px] text-zinc-400">score mínimo {p.min_score}{p.mfa_obrigatorio ? " · MFA obrigatório" : ""}</p>
                </div>
              ))}
              <p className="mt-2 text-[10px] text-zinc-400">Alterações via identity_policy_set — sempre auditadas com antes/depois; rollback = reaplicar os valores anteriores.</p>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🧾 Trilha de alterações de política</h3>
              {!(pol.alteracoes || []).length ? <p className="text-xs text-zinc-400">Nenhuma alteração registrada.</p> : pol.alteracoes.map((a: any) => (
                <details key={a.event_id} className="mb-1 rounded-2xl bg-slate-50 p-2">
                  <summary className="cursor-pointer text-[11px] font-bold text-zinc-600">#{a.event_id} · {String(a.em).slice(0, 19).replace("T", " ")}</summary>
                  <Evid dados={a.evidencias} />
                </details>
              ))}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Identity & Access v1.0 · ORION-AI-42 · IS/ATS/SRS/DCS + MAR + III · política identity_politica_v1 ·
          evidência obrigatória · recomenda, nunca bloqueia sozinho · ações humanas auditadas e reversíveis · tick */2
        </p>
      </div>
    </div>
  );
}
