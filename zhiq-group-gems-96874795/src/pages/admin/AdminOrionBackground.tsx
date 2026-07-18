/**
 * /admin/orion-background — ORION Background Intelligence AI (ORION-AI-65)
 *
 * Orquestração de fundos/cenários do Design Ecosystem. Catálogo de cenários,
 * FILA de jobs (a Edge processa o pixel via bg_next_job/bg_complete_job),
 * versionamento (original preservado) e Background Score — tudo REAL em SQL.
 * Processamento de imagem (remover fundo/gerar cenário/export) = Edge DECLARADO.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Images, Loader2, Gauge, LayoutGrid, FolderOpen, ListChecks, Settings } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const scoreCol = (s: number) => s >= 75 ? "text-emerald-600" : s >= 50 ? "text-amber-600" : "text-red-600";
const ST: Record<string, string> = { pendente: "bg-slate-100 text-slate-600", processando: "bg-sky-100 text-sky-700", concluido: "bg-emerald-100 text-emerald-700", falhou: "bg-red-100 text-red-700", novo: "bg-slate-100 text-slate-500" };
const fmt = (v: any) => v ? String(v).slice(0, 19).replace("T", " ") : "—";

type Aba = "dashboard" | "cenarios" | "projetos" | "jobs" | "config";

export default function AdminOrionBackground() {
  const [aba, setAba] = useState<Aba>("dashboard");
  const [catFilter, setCatFilter] = useState<string>("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-background"], queryFn: () => rpc("background_dashboard"), refetchInterval: 30000,
  });

  const ov = dash?.overview || {};
  const cenarios = (dash?.cenarios || []) as any[];
  const projetos = (dash?.projetos || []) as any[];
  const jobs = dash?.jobs || {};
  const stats = (dash?.estatisticas_7d || []) as any[];
  const config = dash?.config || {};
  const cats = Array.from(new Set(cenarios.map((c: any) => c.categoria))).sort();
  const cenFiltered = catFilter ? cenarios.filter((c: any) => c.categoria === catFilter) : cenarios;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0b1220] via-[#122036] to-[#0b1220] p-6 text-white shadow-xl ring-1 ring-teal-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500/10 ring-1 ring-teal-500/30">
              <Images className="h-8 w-8 text-teal-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Background Intelligence</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-65 · Design Ecosystem · fundos/cenários · fila real + catálogo + score · pixel = Edge (declarado)
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-teal-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-200/70">Background Score médio</p>
              <p className={`text-4xl font-black ${(ov.score_medio ?? 0) >= 75 ? "text-emerald-300" : (ov.score_medio ?? 0) >= 50 ? "text-amber-300" : "text-red-300"}`}>{ov.score_medio ?? "—"}</p>
              <p className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">{ov.jobs_pendentes ?? 0} na fila</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Projetos", ov.projetos], ["Fundos removidos", ov.fundos_removidos], ["Fundos criados", ov.fundos_criados],
              ["Cenários", ov.cenarios], ["Jobs concluídos", ov.jobs_concluidos], ["Tempo médio", `${ov.tempo_medio_s ?? 0}s`]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["dashboard", Gauge, "Dashboard"], ["cenarios", LayoutGrid, `Cenários${cenarios.length ? ` (${cenarios.length})` : ""}`],
             ["projetos", FolderOpen, `Projetos${projetos.length ? ` (${projetos.length})` : ""}`], ["jobs", ListChecks, "Fila / Jobs"],
             ["config", Settings, "Config"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#122036] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-500" /></div>}

        {/* DASHBOARD */}
        {aba === "dashboard" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Jobs pendentes", ov.jobs_pendentes], ["Jobs concluídos", ov.jobs_concluidos], ["Jobs falhos", ov.jobs_falhos], ["Score médio", ov.score_medio]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className={`text-2xl font-black ${l === "Score médio" ? scoreCol(v ?? 0) : "text-zinc-800"}`}>{v ?? 0}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Cenários por categoria</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(ov.cenarios_por_categoria || {}).sort((a: any, b: any) => b[1] - a[1]).map(([c, n]: any) => (
                  <span key={c} className="rounded-full bg-teal-50 px-3 py-1 text-[11px] font-bold text-teal-700 capitalize">{c}: {n}</span>
                ))}
              </div>
            </div>
            {stats.length > 0 && (
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Evolução (7 dias)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead><tr className="text-zinc-400"><th className="pb-1 pr-3">Dia</th><th className="pr-3">Projetos</th><th className="pr-3">Concluídos</th><th className="pr-3">Pendentes</th><th className="pr-3">Score</th><th>Tempo</th></tr></thead>
                    <tbody>{stats.map((s: any) => (
                      <tr key={s.dia} className="border-t border-zinc-50 font-semibold text-zinc-600">
                        <td className="py-1 pr-3">{s.dia}</td><td className="pr-3">{s.projetos}</td><td className="pr-3">{s.concluidos}</td><td className="pr-3">{s.pendentes}</td><td className="pr-3">{s.score}</td><td>{s.tempo_s}s</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CENÁRIOS (biblioteca) */}
        {aba === "cenarios" && !isLoading && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setCatFilter("")} className={`rounded-full px-3 py-1 text-[11px] font-bold ${!catFilter ? "bg-teal-600 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200"}`}>todos</button>
              {cats.map((c: string) => (
                <button key={c} onClick={() => setCatFilter(c)} className={`rounded-full px-3 py-1 text-[11px] font-bold capitalize ${catFilter === c ? "bg-teal-600 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200"}`}>{c}</button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cenFiltered.map((c: any) => {
                const p = c.palette || {};
                const cores = [p.fundo, p.de, p.para, p.sombra, p.destaque].filter(Boolean);
                return (
                  <div key={c.id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                    <div className="mb-2 h-16 w-full rounded-2xl ring-1 ring-black/5" style={{ background: p.de && p.para ? `linear-gradient(135deg, ${p.de}, ${p.para})` : (p.fundo || "#F1F5F9") }} />
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-black text-zinc-800">{c.nome}</span>
                      {c.premium && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-700">PREMIUM</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500 capitalize">{c.categoria}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{c.estilo}</span>
                      <span className="text-[10px] text-zinc-400">{c.usos} usos · score {c.score_medio}</span>
                      <div className="ml-auto flex gap-1">{cores.map((h: string, i: number) => <div key={i} className="h-4 w-4 rounded ring-1 ring-black/10" style={{ background: h }} />)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PROJETOS */}
        {aba === "projetos" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!projetos.length ? <p className="text-xs text-zinc-400">Nenhum projeto ainda. Crie via API (bg_create_project) ou integração.</p> : projetos.map((p: any) => (
              <div key={p.id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  {p.resultado || p.original ? <img src={p.resultado || p.original} alt="" className="h-10 w-10 rounded-lg object-cover ring-1 ring-zinc-200" /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black text-zinc-800">#{p.id} · {p.ref_tipo}{p.categoria ? ` · ${p.categoria}` : ""}</p>
                    <p className="text-[10px] text-zinc-400">{p.versoes} versão(ões) · {fmt(p.em)}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ST[p.status] || ""}`}>{p.status}</span>
                  <div className="text-right"><p className={`text-lg font-black ${scoreCol(p.score)}`}>{p.score}</p><p className="text-[9px] text-zinc-400">score</p></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FILA / JOBS */}
        {aba === "jobs" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Por status</h3>
                {Object.entries(jobs.por_status || {}).map(([s, n]: any) => (
                  <div key={s} className="mb-1 flex items-center gap-2 text-[11px]">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ST[s] || "bg-slate-100"}`}>{s}</span>
                    <span className="font-black text-zinc-700">{n}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Por tipo</h3>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(jobs.por_tipo || {}).map(([t, n]: any) => (
                    <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{t}: {n}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Jobs recentes</h3>
              <div className="max-h-96 space-y-1 overflow-auto">
                {(jobs.recentes || []).map((j: any) => (
                  <div key={j.id} className="flex flex-wrap items-center gap-2 border-b border-zinc-50 pb-1 text-[11px]">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">#{j.id}</span>
                    <span className="font-bold text-zinc-700">{j.tipo}</span>
                    <span className="text-zinc-400">projeto {j.project}</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-black ${ST[j.status] || ""}`}>{j.status}</span>
                    {j.tentativas > 1 && <span className="text-[10px] text-amber-600">{j.tentativas}ª tentativa</span>}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">A Edge reivindica jobs com <code>bg_next_job</code> e devolve com <code>bg_complete_job</code> (url + métricas). Jobs presos &gt;15min voltam à fila (até 3×).</p>
            </div>
          </div>
        )}

        {/* CONFIG */}
        {aba === "config" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="grid gap-2 sm:grid-cols-3">
                {[["Cron", config.cron], ["Modelo IA", config.modelo_ia], ["Motor", config.motor]].map(([l, v]: any) => (
                  <div key={l}><p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p><p className="text-sm font-black text-zinc-700">{String(v ?? "—")}</p></div>
                ))}
              </div>
              <p className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800">🔒 Funções de dados bloqueadas p/ anon; <code>bg_next_job</code>/<code>bg_complete_job</code> são exclusivas da Edge (service_role). Original sempre preservado (v0).</p>
            </div>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="mb-1 text-sm font-black text-amber-800">Declarado (Edge / futuro — nada inventado)</h3>
              {(config.declarado || []).map((l: string, i: number) => <p key={i} className="text-[11px] font-semibold text-amber-700">· {l}</p>)}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Background Intelligence v1.0 · ORION-AI-65 · catálogo de cenários + fila de jobs + versionamento + Background Score ·
          reusa AI-61 (paleta da marca) · pixel = Edge (bg_next_job/bg_complete_job) · tick */5
        </p>
      </div>
    </div>
  );
}
