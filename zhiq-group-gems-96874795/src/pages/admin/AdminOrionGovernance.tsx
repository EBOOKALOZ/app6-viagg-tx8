/**
 * /admin/orion-governance — ORION Governance AI (ORION-AI-50)
 *
 * O Governador do ecossistema: registro global AUTO-DESCOBERTO de TODAS as
 * IAs ORION (saude/cron/certificacoes/deps/lifecycle imutavel). Distinto do
 * AI-38 (governanca de CUSTO de IA, /admin/orion-ai-governance) e do OCE
 * (certificador de qualidade). Namespace orion_gov_* / funcoes gov_*.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import {
  Landmark, Loader2, Sparkles, ListTree, BadgeCheck, Share2, History, ScrollText, Bell, Play,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};
const HEALTH: Record<string, string> = {
  verde: "bg-emerald-100 text-emerald-700", amarelo: "bg-amber-100 text-amber-700",
  vermelho: "bg-red-100 text-red-700", desconhecido: "bg-slate-100 text-slate-500",
};
const SEV: Record<string, string> = { critica: "bg-red-700 text-white", alta: "bg-red-600 text-white", media: "bg-amber-100 text-amber-700", baixa: "bg-sky-100 text-sky-700" };

type Aba = "resumo" | "registro" | "certificacoes" | "dependencias" | "ciclo" | "politicas" | "alertas";
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
    <h3 className="mb-2 text-sm font-black text-zinc-700">{title}</h3>{children}
  </div>
);

export default function AdminOrionGovernance() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");
  const [msg, setMsg] = useState("");

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-governance50"], queryFn: () => rpc("gov_dashboard"), refetchInterval: 60000,
  });
  const sc = dash?.scores || {};
  const registry = (dash?.registry || []) as any[];
  const certs = (dash?.certifications || []) as any[];
  const deps = (dash?.dependencies || []) as any[];
  const lifecycle = (dash?.lifecycle || []) as any[];
  const policies = (dash?.policies || []) as any[];
  const alerts = (dash?.alerts || []) as any[];
  const stats = (dash?.statistics || []) as any[];
  const verdes = registry.filter((r) => r.health === "verde").length;
  const vermelhos = registry.filter((r) => r.health === "vermelho").length;
  const depsQuebradas = deps.filter((d) => d.quebrada).length;

  const narrar = async (promptKey: string, rotulo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("gov_summary");
      const r = await orionAiText("governance", `Pedido: ${rotulo}\nEstado: ${JSON.stringify(ctx)}`, { promptKey, maxTokens: 700 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponivel (${r.error}).`);
    } finally { setOcupado(false); }
  };
  const rodar = async () => {
    setOcupado(true); setMsg("");
    try { const r = await rpc("run_governance_check", { p_trace: `painel_${Date.now()}` }); setMsg(`✓ ${r.total} IAs governadas · ${r.auto_descobertos} auto-descobertas.`); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); } finally { setOcupado(false); }
  };

  const TABS: [Aba, any, string][] = [
    ["resumo", Sparkles, "Resumo"], ["registro", ListTree, `Registro Global (${registry.length})`],
    ["certificacoes", BadgeCheck, "Certificacoes"], ["dependencias", Share2, `Dependencias${depsQuebradas ? ` (${depsQuebradas}!)` : ""}`],
    ["ciclo", History, "Ciclo de Vida"], ["politicas", ScrollText, "Politicas"],
    ["alertas", Bell, `Alertas${alerts.length ? ` (${alerts.length})` : ""}`],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
        <div className="rounded-3xl bg-gradient-to-r from-[#1a1305] via-[#78350f] to-[#1a1305] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Landmark className="h-8 w-8 text-amber-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">ORION Governance AI</h1>
                <span className="rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ring-amber-300/40">Governance</span>
              </div>
              <p className="text-sm text-amber-200/80">
                ORION-AI-50 · o Governador do ecossistema · registro auto-descoberto de TODAS as IAs · ciclo de vida imutavel
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200/70">Governance Score (GS)</p>
              <p className="text-3xl font-black">{sc.gs ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["IAs governadas", registry.length], ["Saudaveis", verdes], ["Vermelhas", vermelhos],
              ["Certificadas (CS)", `${sc.cs ?? 0}%`], ["Deps integras (DEPS)", `${sc.deps ?? 0}%`],
              ["Crons ativos (OHS)", `${sc.ohs ?? 0}%`]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-amber-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {TABS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#78350f] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
          <button onClick={rodar} disabled={ocupado}
            className="ml-auto flex items-center gap-2 rounded-full bg-amber-700 px-4 py-2 text-sm font-black text-white shadow hover:bg-amber-800 disabled:opacity-50">
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Governar agora
          </button>
        </div>
        {msg && <p className="mt-2 text-[12px] font-bold text-zinc-600">{msg}</p>}
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-amber-600" /></div>}

        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["governance.summary", "Resumo executivo"], ["governance.health", "Saude dos modulos"],
                  ["governance.audit", "Auditar governanca"], ["governance.lifecycle", "Ciclo de vida"],
                  ["governance.recommendation", "Priorizar melhorias"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l)} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-amber-200 hover:bg-amber-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-amber-100">{narrativa}</p>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Scores de governanca (explicaveis)">
                <div className="grid grid-cols-2 gap-2">
                  {[["Governance (GS)", sc.gs], ["Lifecycle (LS)", sc.ls], ["Certification (CS)", sc.cs],
                    ["Dependency (DEPS)", sc.deps], ["Operational Health (OHS)", sc.ohs], ["Docs (declarado)", sc.docs]].map(([l, v]: any) => (
                    <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                      <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                      <p className="text-xl font-black text-zinc-800">{String(v ?? 0)}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-zinc-400">{sc.formula}</p>
              </Card>
              <Card title="Saude do ecossistema">
                {registry.filter((r) => r.health !== "verde").length === 0 ? (
                  <p className="py-6 text-center text-sm text-emerald-600">🟢 Todas as {registry.length} IAs saudaveis.</p>
                ) : registry.filter((r) => r.health !== "verde").map((r: any) => (
                  <div key={r.module} className="mb-1 flex items-center gap-2 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${HEALTH[r.health] || ""}`}>{r.health}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-700">{r.numero || ""} {r.nome || r.module}</span>
                    <span className="text-[10px] text-zinc-400">{r.cron_job || "sem cron"}</span>
                  </div>
                ))}
              </Card>
            </div>
          </div>
        )}

        {aba === "registro" && !isLoading && (
          <div className="mt-4 overflow-x-auto rounded-3xl border border-zinc-100 bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead><tr className="border-b border-zinc-100 text-[10px] uppercase text-zinc-400">
                <th className="p-3">Nº</th><th>Modulo</th><th>Status</th><th>Saude</th><th>Score</th><th>Cron</th><th>Prompts</th><th className="pr-3">Uso 7d</th>
              </tr></thead>
              <tbody>
                {registry.map((r: any) => (
                  <tr key={r.module} className="border-b border-zinc-50">
                    <td className="p-3 font-mono font-bold text-zinc-500">{r.numero || "—"}</td>
                    <td className="font-semibold text-zinc-700">{r.nome || r.module}</td>
                    <td><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{r.status}</span></td>
                    <td><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${HEALTH[r.health] || ""}`}>{r.health}</span></td>
                    <td className="font-black text-zinc-700">{r.score ?? "—"}</td>
                    <td className="text-zinc-500">{r.cron_ativo ? "🟢" : r.cron_job ? "🔴" : "—"}</td>
                    <td className="text-zinc-500">{r.prompts_ativos}</td>
                    <td className="pr-3 text-zinc-500">{r.uso_7d}{r.erros_7d > 0 ? ` · ${r.erros_7d} err` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {aba === "certificacoes" && !isLoading && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {certs.map((c: any) => (
              <div key={c.id} className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <BadgeCheck className={`h-4 w-4 ${c.aprovado ? "text-emerald-500" : "text-red-500"}`} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-zinc-700">{c.module}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">{c.score}</span>
                </div>
                <p className="mt-0.5 text-[10px] text-zinc-400">{c.data} · {c.auditor}</p>
              </div>
            ))}
          </div>
        )}

        {aba === "dependencias" && !isLoading && (
          <div className="mt-4 space-y-2">
            {deps.map((d: any) => (
              <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 bg-white p-3 text-sm shadow-sm">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${d.quebrada ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{d.quebrada ? "quebrada" : "ok"}</span>
                <span className="font-semibold text-zinc-700">{d.module}</span>
                <span className="text-zinc-400">→ {d.depende_de}</span>
                <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{d.tipo}</span>
              </div>
            ))}
          </div>
        )}

        {aba === "ciclo" && !isLoading && (
          <div className="mt-4 space-y-1">
            {lifecycle.map((l: any) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 bg-white p-2 text-xs shadow-sm">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">{l.fase}</span>
                <span className="font-semibold text-zinc-700">{l.module}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-500">{l.nota}</span>
                <span className="text-[10px] text-zinc-400">{String(l.momento).slice(0, 16).replace("T", " ")}</span>
              </div>
            ))}
            <p className="mt-2 text-[11px] text-zinc-400">Transicoes de ciclo de vida sao IMUTAVEIS (historico permanente).</p>
          </div>
        )}

        {aba === "politicas" && !isLoading && (
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {policies.map((p: any) => (
              <div key={p.politica} className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${p.ativa ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-400"}`}>{p.ativa ? "ativa" : "inativa"}</span>
                  <span className="text-sm font-bold text-zinc-700">{p.politica}</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">{p.descricao}</p>
              </div>
            ))}
          </div>
        )}

        {aba === "alertas" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!alerts.length ? <Card title="Alertas"><p className="py-6 text-center text-sm text-zinc-400">🎉 Nenhum alerta de governanca.</p></Card>
              : alerts.map((a: any) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 bg-white p-3 text-sm shadow-sm">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[a.severidade] || ""}`}>{a.severidade}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{a.categoria}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-700">{a.alerta}</span>
              </div>
            ))}
            <p className="text-[11px] text-zinc-400">Estatisticas: {stats[0]?.total ?? 0} módulos · {stats[0]?.certificadas ?? 0} certificados · suite `SELECT gov_selftest()` (13 checks, COMANDO TESTE).</p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Governance AI v1.0 · ORION-AI-50 · Governador do ecossistema · registro AUTO-DESCOBERTO · GS/LS/CS/DEPS/OHS ·
          ciclo de vida imutavel · distinto do AI-38 (custo de IA) e do OCE (qualidade) · tick 10 min · IA so via Gateway
        </p>
      </div>
    </div>
  );
}
