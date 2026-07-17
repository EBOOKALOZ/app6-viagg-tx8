/**
 * /admin/orion-ai-governance — ORION AI Governance Center (ORION-AI-38)
 *
 * Camada executiva de governança/conformidade/auditoria das IAs. NÃO duplica o
 * AI-37 (custos): reutiliza suas tabelas e adiciona orçamentos por módulo,
 * políticas, perfis (Admin/Auditor/Operações), trilha de auditoria IMUTÁVEL,
 * rastreabilidade por chamada e rollback de governança. Governance Score (GCS).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, Loader2, Gauge, Wallet, ScrollText, FileSearch, Users } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const usd = (v: any) => v == null ? "—" : `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 6 })}`;
const gcsColor = (s: number) => s >= 80 ? "text-emerald-300" : s >= 60 ? "text-amber-300" : "text-red-300";
const HEALTH: Record<string, string> = { verde: "bg-emerald-100 text-emerald-700", amarelo: "bg-amber-100 text-amber-700", vermelho: "bg-red-100 text-red-700" };
const SEV: Record<string, string> = { critico: "bg-red-100 text-red-700", atencao: "bg-amber-100 text-amber-700", info: "bg-slate-100 text-slate-600" };

type Aba = "resumo" | "orcamentos" | "politicas" | "auditoria" | "perfis";

export default function AdminOrionAiGovernance() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [rollbackMsg, setRollbackMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-ai-governance"], queryFn: () => rpc("governance_dashboard"), refetchInterval: 60000,
  });

  const score = dash?.score || {};
  const health = dash?.health || {};
  const custos = dash?.custos || {};
  const budgets = (dash?.budgets || []) as any[];
  const policies = (dash?.policies || []) as any[];
  const alertas = (dash?.alertas || []) as any[];
  const auditoria = (dash?.auditoria || []) as any[];
  const rastreabilidade = (dash?.rastreabilidade || []) as any[];
  const meuPerfil = dash?.meu_perfil || "—";

  const rollback = async () => {
    setBusy(true); setRollbackMsg("");
    try {
      const r = await rpc("governance_rollback");
      setRollbackMsg(`✓ ${r.alertas_removidos} alerta(s) de governança revertido(s). Re-execute o tick para recalcular.`);
      refetch();
    } catch (e: any) { setRollbackMsg(`Erro: ${e.message}`); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0b1220] via-[#1e293b] to-[#0b1220] p-6 text-white shadow-xl ring-1 ring-sky-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/10 ring-1 ring-sky-500/30">
              <ShieldCheck className="h-8 w-8 text-sky-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION AI Governance Center</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-38 · governança/conformidade/auditoria · reutiliza o AI-37 · seu perfil: <b className="text-sky-300">{meuPerfil}</b>
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-sky-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-200/70">Governance Score</p>
              <p className={`text-4xl font-black ${gcsColor(score.gcs)}`}>{score.gcs ?? "—"}</p>
              <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${HEALTH[health.status] || "bg-white/10 text-white"}`}>{health.status ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Conf. orçamento", `${score.conformidade_orcamento_pct ?? 0}%`], ["Conf. políticas", `${score.conformidade_politicas_pct ?? 0}%`],
              ["Rastreabilidade", `${score.rastreabilidade_pct ?? 0}%`], ["Chamadas auditadas", score.chamadas_auditadas],
              ["Custo hoje", usd(custos.custo_hoje_usd)], ["ROI", `${custos.roi_consolidado ?? "—"}×`]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Gauge, "Visão Geral"], ["orcamentos", Wallet, `Orçamentos${budgets.length ? ` (${budgets.length})` : ""}`],
             ["politicas", ScrollText, "Políticas & Alertas"], ["auditoria", FileSearch, "Auditoria & Rastreio"],
             ["perfis", Users, "Perfis de Acesso"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#1e293b] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Custo hoje", usd(custos.custo_hoje_usd)], ["Custo semana", usd(custos.custo_semana_usd)],
                ["Custo mês", usd(custos.custo_mes_usd)], ["Economia cache", usd(custos.economia_cache_usd)]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-xl font-black text-sky-700">{v}</p>
                </div>
              ))}
            </div>
            {alertas.length > 0 && (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="mb-2 text-sm font-black text-amber-800">⚠ Alertas de governança ({alertas.length})</h3>
                {alertas.map((a: any, i: number) => (
                  <div key={i} className="mb-1 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[a.severidade] || "bg-slate-100"}`}>{a.severidade}</span>
                    <span className="min-w-0 flex-1 text-xs font-semibold text-zinc-700">{a.mensagem}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-1 text-sm font-black text-zinc-700">Conformidade & Rollback</h3>
              <p className="text-[11px] text-zinc-500">Governance Score = 35% orçamento + 30% políticas + 20% cobertura auditoria + 15% rastreabilidade. Cobertura de auditoria = 100% (o Gateway registra todas as chamadas).</p>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={rollback} disabled={busy || meuPerfil !== "admin"}
                  className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "↺ Rollback dos cálculos de governança (hoje)"}
                </button>
                {meuPerfil !== "admin" && <span className="text-[11px] text-zinc-400">(somente Administrador)</span>}
              </div>
              {rollbackMsg && <p className="mt-2 text-[11px] font-bold text-zinc-600">{rollbackMsg}</p>}
            </div>
          </div>
        )}

        {/* ORÇAMENTOS */}
        {aba === "orcamentos" && !isLoading && (
          <div className="mt-4 space-y-2">
            {budgets.map((b: any, i: number) => (
              <div key={i} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{b.periodo}</span>
                  <p className="min-w-0 flex-1 truncate font-black text-zinc-800">{b.module}</p>
                  <span className="text-[11px] text-zinc-500">{usd(b.gasto_hoje_usd)} / {usd(b.limite_usd)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${b.estourou ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{b.uso_pct}%</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full ${b.estourou ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, Number(b.uso_pct) || 0)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* POLÍTICAS & ALERTAS */}
        {aba === "politicas" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">📜 Políticas ativas</h3>
              {policies.map((p: any, i: number) => (
                <div key={i} className="mb-2 rounded-2xl bg-slate-50 p-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[p.severidade] || ""}`}>{p.severidade}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">{p.chave}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{p.tipo} {p.operador} {p.threshold}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500">{p.descricao}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-red-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-red-700">🚨 Alertas abertos ({alertas.length})</h3>
              {!alertas.length ? <p className="text-xs text-zinc-400">Nenhum alerta 🎉</p> : alertas.map((a: any, i: number) => (
                <div key={i} className="mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[a.severidade] || ""}`}>{a.severidade}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-700">{a.tipo}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500">{a.mensagem}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AUDITORIA & RASTREIO */}
        {aba === "auditoria" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🔒 Trilha de auditoria (imutável)</h3>
              {!auditoria.length ? <p className="text-xs text-zinc-400">Sem registros.</p> : auditoria.map((a: any, i: number) => (
                <div key={i} className="mb-1 border-b border-zinc-50 pb-1">
                  <p className="text-[11px] font-bold text-zinc-700">{a.evento} <span className="font-normal text-zinc-400">· {a.ator}</span></p>
                  <p className="text-[10px] text-zinc-400">{String(a.em).slice(0, 19).replace("T", " ")}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🧾 Rastreabilidade por chamada (Gateway)</h3>
              <div className="max-h-96 overflow-auto">
                {rastreabilidade.map((c: any, i: number) => (
                  <div key={i} className="mb-1 flex flex-wrap items-center gap-1 border-b border-zinc-50 pb-1 text-[10px]">
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">{c.module}</span>
                    <span className="text-zinc-500">{c.model}</span>
                    <span className="text-zinc-400">{c.tokens} tok · {usd(c.custo_usd)} · {c.latencia_ms}ms {c.cache ? "· ♻" : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PERFIS */}
        {aba === "perfis" && !isLoading && (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              {[["Administrador", "Acesso total: gerencia orçamentos, políticas e executa rollback", "admin"],
                ["Auditor", "Leitura de custos, auditoria e conformidade (sem alterar)", "auditor"],
                ["Operações", "Leitura de orçamentos e políticas do dia a dia", "operacoes"]].map(([t, d, k]: any) => (
                <div key={k} className={`rounded-3xl border p-4 shadow-sm ${meuPerfil === k ? "border-sky-300 bg-sky-50" : "border-zinc-100 bg-white"}`}>
                  <p className="text-sm font-black text-zinc-800">{t} {meuPerfil === k && "← você"}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">{d}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-zinc-400">Perfis controlados por RLS (`orion_ai_governance_roles` + `governance_user_role()`). A trilha de auditoria é append-only (REVOKE UPDATE/DELETE) — registro imutável.</p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION AI Governance Center v1.0 · ORION-AI-38 · GCS + orçamentos + políticas + auditoria imutável + rollback ·
          reutiliza AI-37 (custos) · perfis Admin/Auditor/Operações · tick */5 · fecha o ciclo de governança
        </p>
      </div>
    </div>
  );
}
