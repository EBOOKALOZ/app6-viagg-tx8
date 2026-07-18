/**
 * /admin/orion-trust-center — ORION Trust & Reputation AI (ORION-AI-74)
 *
 * Centro de Confiança e Reputação por USUÁRIO (Trust Score 0-100, selos,
 * verificações, alertas). NÃO substitui o AI-20 (`trust`, por entidade) — REUSA.
 * READ-ONLY sobre o domínio: recomenda, NUNCA bloqueia/executa.
 * Fonte única: rep_dashboard() + rep_alerts_api() + tabelas orion_rep_* (RLS admin).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ShieldCheck, Loader2, Gauge, Users, AlertTriangle, Award, MapPin,
  TrendingUp, ListChecks, BadgeCheck,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const NIVEL_META: Record<string, { label: string; cls: string }> = {
  elite: { label: "Elite", cls: "bg-violet-100 text-violet-700" },
  excelente: { label: "Excelente", cls: "bg-emerald-100 text-emerald-700" },
  confiavel: { label: "Confiável", cls: "bg-sky-100 text-sky-700" },
  regular: { label: "Regular", cls: "bg-zinc-100 text-zinc-600" },
  atencao: { label: "Atenção", cls: "bg-amber-100 text-amber-700" },
  alto_risco: { label: "Alto Risco", cls: "bg-red-100 text-red-700" },
};
const NIVEIS_ORDEM = ["elite", "excelente", "confiavel", "regular", "atencao", "alto_risco"];
const scoreCol = (s: number) => (s >= 80 ? "text-emerald-600" : s >= 50 ? "text-amber-600" : "text-red-600");

type Aba = "visao" | "rankings" | "alertas" | "recomendacoes";

export default function AdminOrionTrustCenter() {
  const [aba, setAba] = useState<Aba>("visao");

  const { data, isLoading } = useQuery({
    queryKey: ["orion-trust-center"], queryFn: () => rpc("rep_dashboard"), refetchInterval: 60000,
  });
  const { data: alertas = [] } = useQuery({
    queryKey: ["orion-trust-center-alertas"], queryFn: () => rpc("rep_alerts_api", { p_status: "aberto" }), refetchInterval: 60000,
  });
  const { data: recs = [] } = useQuery({
    queryKey: ["orion-trust-center-recs"],
    queryFn: async () => {
      const { data: rows, error } = await (supabase.from("orion_rep_recommendations" as any) as any)
        .select("*").eq("status", "aberta").order("criado_em", { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return rows || [];
    },
    refetchInterval: 60000,
  });

  const k = data?.kpis || {};
  const dist = (data?.distribuicao || {}) as Record<string, number>;
  const rankV = (data?.ranking_vendedores || []) as any[];
  const rankC = (data?.ranking_compradores || []) as any[];
  const mapa = (data?.mapa_cidades || []) as any[];
  const evolucao = (data?.evolucao || []) as any[];
  const tele = data?.telemetria || null;
  const lacunas = (data?._auditoria?.lacunas_declaradas || []) as string[];
  const trustMedio = Number(k.trust_medio ?? 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50/40 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0b1e33] via-[#12314f] to-[#0b1e33] p-6 text-white shadow-xl ring-1 ring-sky-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/10 ring-1 ring-sky-500/30">
              <ShieldCheck className="h-8 w-8 text-sky-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Trust Center</h1>
              <p className="text-sm text-sky-100/70">
                ORION-AI-74 · Trust & Reputation por usuário · <span className="font-bold">recomenda, nunca bloqueia</span> · reusa AI-20/41/42
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-sky-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-200/70">Trust Score médio</p>
              <p className={`text-4xl font-black ${trustMedio >= 65 ? "text-emerald-300" : trustMedio >= 50 ? "text-amber-300" : "text-red-300"}`}>{trustMedio || "—"}</p>
              <p className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">{k.usuarios_avaliados ?? 0} usuários</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Elite", k.elite], ["Excelente", k.excelente], ["Em observação", k.em_observacao],
              ["Verificados", k.verificados], ["Alertas abertos", data?.alertas_abertos], ["Selos concedidos", data?.selos_concedidos]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-sky-100/60">{l}</p>
                <p className="truncate text-base font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
          {lacunas.length > 0 && (
            <div className="mt-3 rounded-2xl bg-amber-400/10 px-3 py-2 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-400/20">
              ⓘ Lacunas declaradas (nunca inventadas): {lacunas.join(" · ")}
            </div>
          )}
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["visao", Gauge, "Visão Geral"], ["rankings", TrendingUp, "Rankings"],
             ["alertas", AlertTriangle, `Alertas${alertas.length ? ` (${alertas.length})` : ""}`],
             ["recomendacoes", ListChecks, `Recomendações${recs.length ? ` (${recs.length})` : ""}`]] as [Aba, any, string][]).map(([key, Icon, label]) => (
            <button key={key} onClick={() => setAba(key)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === key ? "bg-[#12314f] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>}

        {/* VISÃO */}
        {aba === "visao" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-black text-zinc-700">Distribuição por faixa</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {NIVEIS_ORDEM.map((n) => (
                  <div key={n} className={`rounded-2xl px-3 py-3 text-center ${NIVEL_META[n].cls}`}>
                    <p className="text-[10px] font-bold uppercase">{NIVEL_META[n].label}</p>
                    <p className="text-2xl font-black">{dist[n] ?? 0}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-zinc-700"><MapPin className="h-4 w-4 text-sky-500" /> Trust por cidade</h3>
                {mapa.length === 0 && <p className="text-xs text-zinc-400">Sem dados.</p>}
                <div className="space-y-1.5">
                  {mapa.map((c: any) => (
                    <div key={c.cidade} className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 text-sm">
                      <span className="font-semibold text-zinc-700">{c.cidade}</span>
                      <span className="text-xs text-zinc-400">{c.usuarios} usuário(s)</span>
                      <span className={`font-black ${scoreCol(Number(c.trust_medio))}`}>{c.trust_medio}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-zinc-700"><TrendingUp className="h-4 w-4 text-sky-500" /> Evolução (30 dias)</h3>
                {evolucao.length === 0 && <p className="text-xs text-zinc-400">Histórico em construção (1 snapshot/dia).</p>}
                <div className="flex items-end gap-1" style={{ minHeight: 90 }}>
                  {evolucao.map((e: any) => (
                    <div key={e.dia} className="flex-1 text-center" title={`${e.dia}: ${e.trust_medio}`}>
                      <div className="mx-auto w-full max-w-[26px] rounded-t-md bg-sky-400/70" style={{ height: `${Math.max(Number(e.trust_medio), 4)}px` }} />
                      <p className="mt-1 truncate text-[8px] text-zinc-400">{String(e.dia).slice(5)}</p>
                    </div>
                  ))}
                </div>
                {tele && (
                  <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-2 text-[11px] text-zinc-500">
                    Último tick: {new Date(tele.executado_em).toLocaleString("pt-BR")} · {tele.duracao_ms}ms · {tele.usuarios} usuários · {tele.badges} selos · {tele.alertas} alertas · {tele.recomendacoes} recomendações
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* RANKINGS */}
        {aba === "rankings" && !isLoading && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {[["Vendedores", rankV, "sub_vendedor"], ["Compradores", rankC, "sub_financeiro"]].map(([titulo, lista, subKey]: any) => (
              <div key={titulo} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-zinc-700"><Award className="h-4 w-4 text-amber-500" /> Top {titulo}</h3>
                {lista.length === 0 && <p className="text-xs text-zinc-400">Nenhum usuário neste papel ainda (dado real, não inventado).</p>}
                <div className="space-y-1.5">
                  {lista.map((u: any, i: number) => (
                    <div key={u.user_id} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${i === 0 ? "bg-amber-400 text-white" : "bg-zinc-200 text-zinc-600"}`}>{i + 1}º</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-zinc-800">{u.nome_loja || u.name || u.user_id.slice(0, 8)}</p>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${NIVEL_META[u.nivel]?.cls || "bg-zinc-100 text-zinc-500"}`}>{NIVEL_META[u.nivel]?.label || u.nivel}</span>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-black ${scoreCol(Number(u.trust_score))}`}>{Number(u.trust_score).toFixed(0)}</p>
                        {u[subKey] != null && <p className="text-[9px] text-zinc-400">papel: {Number(u[subKey]).toFixed(0)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ALERTAS */}
        {aba === "alertas" && !isLoading && (
          <div className="mt-4 space-y-2">
            {alertas.length === 0 && <p className="rounded-3xl border border-zinc-100 bg-white p-6 text-center text-sm text-zinc-400 shadow-sm">Nenhum alerta aberto.</p>}
            {(alertas as any[]).map((a) => (
              <div key={a.id} className={`rounded-2xl border p-4 shadow-sm ${a.severidade === "critica" ? "border-red-200 bg-red-50" : a.severidade === "alta" ? "border-amber-200 bg-amber-50" : a.severidade === "info" ? "border-emerald-200 bg-emerald-50" : "border-zinc-100 bg-white"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 ${a.severidade === "critica" ? "text-red-500" : a.severidade === "alta" ? "text-amber-500" : "text-emerald-500"}`} />
                  <p className="flex-1 text-sm font-bold text-zinc-800">{a.titulo}</p>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-500">{a.tipo}</span>
                  <span className="text-[10px] text-zinc-400">{new Date(a.criado_em).toLocaleString("pt-BR")}</span>
                </div>
                <p className="mt-1 break-all text-[11px] text-zinc-500">user: {a.user_id?.slice(0, 8) ?? "—"} · {JSON.stringify(a.detalhes)}</p>
              </div>
            ))}
          </div>
        )}

        {/* RECOMENDAÇÕES */}
        {aba === "recomendacoes" && !isLoading && (
          <div className="mt-4 space-y-2">
            <p className="rounded-2xl bg-sky-50 px-4 py-2 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-100">
              ⓘ O AI-74 <b>recomenda</b> — a decisão (verificar, limitar, mediar, premiar) é sempre humana.
            </p>
            {recs.length === 0 && <p className="rounded-3xl border border-zinc-100 bg-white p-6 text-center text-sm text-zinc-400 shadow-sm">Nenhuma recomendação aberta.</p>}
            {(recs as any[]).map((r) => (
              <div key={r.id} className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <BadgeCheck className={`h-4 w-4 ${r.prioridade === "alta" ? "text-red-500" : r.prioridade === "media" ? "text-amber-500" : "text-sky-500"}`} />
                  <p className="flex-1 text-sm font-bold text-zinc-800">{r.titulo}</p>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-500">{r.tipo}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${r.prioridade === "alta" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}>{r.prioridade}</span>
                </div>
                <p className="mt-1 break-all text-[11px] text-zinc-500">user: {r.user_id?.slice(0, 8)} · {JSON.stringify(r.motivo)}</p>
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 flex items-center justify-center gap-2 pb-6 text-center text-[10px] text-zinc-400">
          <Users className="h-3 w-3" /> ORION-AI-74 Trust & Reputation · escreve só em orion_rep_* · histórico imutável · RLS + guardas server-side
        </p>
      </div>
    </div>
  );
}
