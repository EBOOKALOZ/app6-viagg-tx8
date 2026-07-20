/**
 * /admin/orion-iam — ORION IAM Enforcement (ORION-AI-77)
 *
 * Camada de EXECUÇÃO de identidade/acesso — complementa o AI-42 (Identity & Access)
 * e o AI-47 (Zero Trust), que são analíticos. Aqui o admin CONTROLA o enforcement:
 * kill-switch global, exigir MFA, revogar sessões (com anti-lockout), quarentena de
 * dispositivo, revogação automática por risco. Tudo OFF por padrão e auditável.
 * Fonte única: RPC iam_dashboard().
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ShieldCheck, Loader2, KeyRound, Fingerprint, Siren, Smartphone,
  Power, RotateCcw, Ban, AlertTriangle,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

type Aba = "controle" | "mfa" | "sessoes" | "quarentena" | "acoes";

export default function AdminOrionIam() {
  const [aba, setAba] = useState<Aba>("controle");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-iam"], queryFn: () => rpc("iam_dashboard"), refetchInterval: 30000,
  });

  const cfg = dash?.config || {};
  const mfa = dash?.mfa || {};
  const sess = dash?.sessoes || {};
  const quar = (dash?.quarentena || []) as any[];
  const acoes = (dash?.acoes_recentes || []) as any[];
  const highRisk = (sess?.alto_risco || []) as any[];
  const semMfa = (mfa?.admins_sem_mfa || []) as string[];
  const seg = dash?.seguranca || {};

  const act = async (id: string, fn: string, args: Record<string, unknown>, ok: (r: any) => string) => {
    setBusy(id); setMsg("");
    try { const r = await rpc(fn, args); setMsg(r?.ok === false ? `⚠ ${r?.nota || "recusado"}` : `✓ ${ok(r)}`); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); }
    finally { setBusy(null); }
  };
  const setConfig = (patch: Record<string, unknown>) => act("cfg:" + Object.keys(patch)[0], "iam_config_set", { p_patch: patch }, () => "Configuração atualizada.");
  const revoke = (sid: string) => act("rev:" + sid, "iam_revoke_session", { p_session_id: sid, p_reason: "revogado pelo painel IAM", p_manual: true }, (r) => r?.executado ? "Sessão revogada." : (r?.nota || "não executado"));
  const release = (dev: string) => act("rel:" + dev, "iam_release_device", { p_device_ref: dev }, () => "Dispositivo liberado.");

  const Toggle = ({ label, k, hint, danger }: { label: string; k: string; hint?: string; danger?: boolean }) => {
    const on = !!cfg[k];
    return (
      <button onClick={() => setConfig({ [k]: !on })} disabled={busy === "cfg:" + k}
        className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition-all ${on ? (danger ? "border-red-400/50 bg-red-500/10" : "border-emerald-400/50 bg-emerald-500/10") : "border-white/10 bg-white/[0.04]"}`}>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">{label}</p>
          {hint && <p className="text-[11px] text-white/45">{hint}</p>}
        </div>
        <span className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-all ${on ? (danger ? "bg-red-500" : "bg-emerald-500") : "bg-white/15"}`}>
          <span className={`h-5 w-5 rounded-full bg-white transition-all ${on ? "translate-x-5" : ""}`} />
        </span>
      </button>
    );
  };

  const TABS: [Aba, any, string][] = [
    ["controle", Power, "Controle"], ["mfa", Fingerprint, "MFA"], ["sessoes", KeyRound, "Sessões"],
    ["quarentena", Smartphone, "Quarentena"], ["acoes", Siren, "Ações"],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#160a0a] via-[#1a0f12] to-[#0d0808] text-white">
      <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#2a0d0d] via-[#3a1418] to-[#2a0d0d] p-6 shadow-xl ring-1 ring-red-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/30">
              <ShieldCheck className="h-8 w-8 text-red-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">IAM Enforcement Center</h1>
              <p className="text-sm text-red-200/70">
                ORION-AI-77 · execução de identidade/acesso · complementa AI-42/AI-47 · kill-switch + anti-lockout
              </p>
            </div>
            <div className={`rounded-2xl px-5 py-3 text-center ring-1 ${cfg.enforcement_enabled ? "bg-red-500/15 ring-red-400/40" : "bg-white/5 ring-white/15"}`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-200/70">Enforcement</p>
              <p className={`text-2xl font-black ${cfg.enforcement_enabled ? "text-red-300" : "text-zinc-400"}`}>{cfg.enforcement_enabled ? "ATIVO" : "OFF"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Admins", mfa?.resumo?.admins], ["Sem MFA", mfa?.resumo?.sem_mfa], ["Sessões ativas", sess?.ativas], ["Alto risco", highRisk.length]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-red-200/60">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap gap-2">
          {TABS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-bold ${aba === k ? "bg-[#3a1418] text-white shadow" : "bg-white/5 text-white/55 ring-1 ring-white/10 hover:text-white"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {msg && <p className="mt-3 rounded-2xl bg-white/5 px-4 py-2 text-xs font-bold">{msg}</p>}
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-red-400" /></div>}

        {/* CONTROLE */}
        {aba === "controle" && !isLoading && (
          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-[12px] text-amber-100/90">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p>Tudo começa <b>desligado</b>. O enforcement automático só age com o <b>kill-switch</b> ligado. Há <b>anti-lockout</b>: nunca revoga sua própria sessão nem a última sessão admin.</p>
            </div>
            <Toggle label="Kill-switch global (enforcement)" k="enforcement_enabled" danger hint="Habilita a execução automática de ações. Desligado = só recomenda." />
            <Toggle label="Revogação automática por risco" k="auto_revoke_enabled" danger hint={`Revoga sessões com risco ≥ ${cfg.revoke_risk_threshold ?? 85} (precisa do kill-switch).`} />
            <Toggle label="Exigir MFA de administradores" k="mfa_enforce_enabled" hint="Marca admins sem MFA como pendentes (o bloqueio no front é o próximo passo)." />
            <Toggle label="Quarentena automática de dispositivo" k="device_quarantine_enabled" hint="Bloqueia dispositivos marcados como suspeitos." />
            <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/10">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">Modo MFA</p>
              <div className="mt-1 flex gap-2">
                {["warn", "block"].map((m) => (
                  <button key={m} onClick={() => setConfig({ mfa_mode: m })}
                    className={`rounded-full px-3 py-1 text-xs font-bold ${cfg.mfa_mode === m ? "bg-red-500 text-white" : "bg-white/5 text-white/50"}`}>{m === "warn" ? "Avisar" : "Bloquear"}</button>
                ))}
              </div>
            </div>
            <p className="text-center text-[11px] text-white/30">🔒 Reusa risco do AI-42/AI-47 · toda ação é auditada em orion_iam_actions</p>
          </div>
        )}

        {/* MFA */}
        {aba === "mfa" && !isLoading && (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              {[["Admins", mfa?.resumo?.admins], ["Com MFA", mfa?.resumo?.com_mfa], ["Sem MFA", mfa?.resumo?.sem_mfa]].map(([l, v]: any) => (
                <div key={l} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 text-center">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">{l}</p>
                  <p className={`text-3xl font-black ${l === "Sem MFA" && v > 0 ? "text-red-300" : "text-white"}`}>{v ?? "—"}</p>
                </div>
              ))}
            </div>
            {semMfa.length > 0 ? (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/5 p-4">
                <p className="text-sm font-black text-red-200">Administradores sem MFA</p>
                <ul className="mt-2 space-y-1">
                  {semMfa.map((uid) => (
                    <li key={uid} className="flex items-center gap-2 text-[11px] text-white/60"><Fingerprint className="h-3 w-3 text-red-300" /> <code className="truncate">{uid}</code></li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-white/40">Estes admins deveriam ativar MFA (Autenticação em 2 fatores) na conta. O bloqueio forçado no front é o próximo passo.</p>
              </div>
            ) : <p className="rounded-2xl bg-white/5 p-6 text-center text-sm text-emerald-300 ring-1 ring-white/10">Todos os admins têm MFA. 🟢</p>}
          </div>
        )}

        {/* SESSÕES */}
        {aba === "sessoes" && !isLoading && (
          <div className="mt-4 space-y-2">
            <p className="rounded-2xl bg-white/5 p-3 text-sm font-bold ring-1 ring-white/10">{sess?.ativas ?? 0} sessões ativas · {highRisk.length} de alto risco (≥ {cfg.revoke_risk_threshold ?? 85})</p>
            {highRisk.length === 0 && <p className="rounded-2xl bg-white/5 p-6 text-center text-sm text-emerald-300 ring-1 ring-white/10">Nenhuma sessão de alto risco. 🟢</p>}
            {highRisk.map((s) => (
              <div key={s.session_id} className="flex items-center gap-3 rounded-2xl border border-red-400/20 bg-red-500/[0.06] p-3">
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-black text-red-300">risco {s.risk}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-bold text-white">{s.ip || "IP ?"} · {s.so || "?"} · {s.nav || "?"}</p>
                  <p className="truncate text-[10px] text-white/40">user {s.user_id} · sess {s.session_id}</p>
                </div>
                <button onClick={() => revoke(s.session_id)} disabled={busy === "rev:" + s.session_id}
                  className="flex items-center gap-1 rounded-xl bg-red-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">
                  {busy === "rev:" + s.session_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />} Revogar
                </button>
              </div>
            ))}
            <p className="text-center text-[11px] text-white/30">Revogar força novo login. Anti-lockout impede revogar a sua sessão ou a última admin.</p>
          </div>
        )}

        {/* QUARENTENA */}
        {aba === "quarentena" && !isLoading && (
          <div className="mt-4 space-y-2">
            {quar.length === 0 && <p className="rounded-2xl bg-white/5 p-6 text-center text-sm text-white/40 ring-1 ring-white/10">Nenhum dispositivo em quarentena.</p>}
            {quar.map((d, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <Smartphone className="h-4 w-4 text-red-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-bold text-white">{d.device}</p>
                  <p className="truncate text-[10px] text-white/40">{d.motivo} · user {d.user || "?"}</p>
                </div>
                <button onClick={() => release(d.device)} disabled={busy === "rel:" + d.device}
                  className="flex items-center gap-1 rounded-xl bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/70 disabled:opacity-50">
                  {busy === "rel:" + d.device ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Liberar
                </button>
              </div>
            ))}
          </div>
        )}

        {/* AÇÕES */}
        {aba === "acoes" && !isLoading && (
          <div className="mt-4 overflow-x-auto rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/5 text-[10px] uppercase text-white/40"><tr><th className="p-2">Ação</th><th className="p-2">Alvo</th><th className="p-2">Motivo</th><th className="p-2">Exec.</th><th className="p-2">Quando</th></tr></thead>
              <tbody>
                {acoes.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-white/40">Sem ações registradas.</td></tr>}
                {acoes.map((a, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="p-2 font-bold text-white/80">{a.tipo}</td>
                    <td className="p-2 text-white/50 truncate max-w-[120px]">{a.alvo}</td>
                    <td className="p-2 text-white/50">{a.motivo}</td>
                    <td className="p-2">{a.executado ? <span className="text-emerald-400">✓</span> : <span className="text-white/30">rec.</span>}</td>
                    <td className="p-2 text-white/40">{a.quando ? new Date(a.quando).toLocaleString("pt-BR") : "—"}</td>
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
