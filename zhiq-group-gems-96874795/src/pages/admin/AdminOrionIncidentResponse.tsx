/**
 * /admin/orion-incident-response — ORION Incident Response AI (ORION-AI-45)
 *
 * Centro operacional de resposta a incidentes: fecha o funil do Security
 * Ecosystem (AI-40 detecta -> 41 fraudes -> 42 identidade -> 43 correlaciona
 * -> 44 audita -> 45 RESPONDE). Ingesta fontes reais, classifica (IRS/ICS),
 * executa playbooks auditaveis e mantem timeline/evidencias IMUTAVEIS.
 * Bloqueios reusam RPCs guardadas dos irmaos (politica deles decide);
 * negado => aguardando_humano. Rollback logico preserva historico.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import {
  Siren, Loader2, Sparkles, Flame, BookOpenCheck, BarChart3, Bell, Play,
  RotateCcw, CheckCircle2, XCircle, ListChecks, Search,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const SEV: Record<string, string> = {
  critico: "bg-red-700 text-white", alto: "bg-red-600 text-white",
  medio: "bg-amber-100 text-amber-700", baixo: "bg-sky-100 text-sky-700",
  informativo: "bg-slate-100 text-slate-500",
};
const ST: Record<string, string> = {
  aberto: "bg-red-100 text-red-700", em_resposta: "bg-amber-100 text-amber-700",
  aguardando_humano: "bg-purple-100 text-purple-700", reaberto: "bg-red-100 text-red-700",
  resolvido: "bg-emerald-100 text-emerald-700", fechado: "bg-slate-100 text-slate-500",
};

type Aba = "resumo" | "ativos" | "criticos" | "playbooks" | "metricas" | "notificacoes";

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
    <h3 className="mb-2 text-sm font-black text-zinc-700">{title}</h3>
    {children}
  </div>
);

export default function AdminOrionIncidentResponse() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");
  const [msg, setMsg] = useState("");
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [busca, setBusca] = useState("");

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-incident-response"], queryFn: () => rpc("incident_dashboard"), refetchInterval: 45000,
  });
  const { data: detalhe } = useQuery({
    queryKey: ["orion-incident-detail", selecionado],
    queryFn: () => rpc("incident_detail", { p_id: selecionado }),
    enabled: selecionado != null,
  });

  const kpis = dash?.kpis || {};
  const ativos = ((dash?.ativos || []) as any[]).filter((i) =>
    ["aberto", "em_resposta", "aguardando_humano", "reaberto"].includes(i.status) &&
    (!busca || String(i.titulo).toLowerCase().includes(busca.toLowerCase()) || String(i.trace || "").includes(busca)));
  const criticos = (dash?.criticos || []) as any[];
  const playbooks = (dash?.playbooks || []) as any[];
  const stats = (dash?.statistics || []) as any[];
  const notifs = (dash?.notificacoes || []) as any[];

  const narrar = async (promptKey: string, rotulo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("incident_summary");
      const r = await orionAiText("incident_response", `Pedido: ${rotulo}\nEstado real: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 700 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponivel (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const acao = async (fn: string, args: Record<string, unknown>, okMsg: string) => {
    setOcupado(true); setMsg("");
    try { await rpc(fn, args); setMsg(`✓ ${okMsg}`); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); }
    finally { setOcupado(false); }
  };

  const TABS: [Aba, any, string][] = [
    ["resumo", Sparkles, "Resumo"],
    ["ativos", Siren, `Ativos${ativos.length ? ` (${ativos.length})` : ""}`],
    ["criticos", Flame, `Criticos${kpis.criticos_ativos ? ` (${kpis.criticos_ativos})` : ""}`],
    ["playbooks", BookOpenCheck, "Playbooks"],
    ["metricas", BarChart3, "Metricas & Historico"],
    ["notificacoes", Bell, `Notificacoes${notifs.filter((n) => !n.lida).length ? ` (${notifs.filter((n) => !n.lida).length})` : ""}`],
  ];

  const IncidenteLinha = ({ i }: { i: any }) => (
    <div className={`mb-2 cursor-pointer rounded-2xl border p-3 transition ${selecionado === i.incident_id ? "border-rose-300 bg-rose-50/60" : "border-zinc-100 bg-slate-50/60 hover:bg-slate-100/60"}`}
      onClick={() => setSelecionado(selecionado === i.incident_id ? null : i.incident_id)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${SEV[i.severidade] || ""}`}>{i.severidade}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ST[i.status] || ""}`}>{i.status}</span>
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{i.categoria}</span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{i.origem_modulo}</span>
        {i.reincidencia > 0 && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-black text-purple-700">reincidencia {i.reincidencia}</span>}
        <span className="ml-auto rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white">IRS {i.irs}</span>
      </div>
      <p className="mt-1 text-sm text-zinc-700">#{i.incident_id} · {i.titulo}</p>
      <p className="text-[10px] text-zinc-400">{String(i.aberto_em).replace("T", " ").slice(0, 16)}{i.playbook ? ` · playbook: ${i.playbook}` : ""}</p>

      {selecionado === i.incident_id && detalhe && (
        <div className="mt-3 space-y-3 rounded-2xl bg-white p-3 ring-1 ring-zinc-100" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap gap-2">
            {["aberto", "em_resposta", "aguardando_humano", "reaberto"].includes(i.status) && (
              <button onClick={() => acao("incident_resolve", { p_id: i.incident_id, p_nota: "resolvido pelo painel" }, `Incidente #${i.incident_id} resolvido`)} disabled={ocupado}
                className="flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-black text-white disabled:opacity-50"><CheckCircle2 className="h-3 w-3" /> Resolver</button>
            )}
            {i.status === "resolvido" && (
              <button onClick={() => acao("incident_close", { p_id: i.incident_id, p_conclusao: "encerrado pelo painel" }, `Incidente #${i.incident_id} fechado`)} disabled={ocupado}
                className="flex items-center gap-1 rounded-full bg-zinc-700 px-3 py-1 text-[11px] font-black text-white disabled:opacity-50"><XCircle className="h-3 w-3" /> Fechar</button>
            )}
          </div>
          <div>
            <p className="mb-1 text-[11px] font-black text-zinc-600">⏱ Timeline ({(detalhe.timeline || []).length})</p>
            <div className="max-h-48 space-y-1 overflow-auto">
              {(detalhe.timeline || []).map((t: any, k: number) => (
                <div key={k} className="border-b border-zinc-50 pb-1 text-[11px]">
                  <span className="font-mono text-[10px] text-zinc-400">{String(t.momento).replace("T", " ").slice(5, 16)}</span>{" "}
                  <span className="rounded bg-slate-100 px-1 text-[9px] font-bold text-slate-500">{t.ator}</span>{" "}
                  <span className="text-zinc-700">{t.descricao}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-black text-zinc-600">⚡ Acoes ({(detalhe.acoes || []).length})</p>
            {(detalhe.acoes || []).map((a: any) => (
              <div key={a.action_id} className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="font-bold text-zinc-700">{a.acao}</span>
                {a.alvo && <span className="font-mono text-[10px] text-zinc-500">{a.alvo}</span>}
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${a.resultado === "executada" ? "bg-emerald-100 text-emerald-700" : a.resultado === "negada_politica" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>{a.resultado}</span>
                <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-400">{a.justificativa}</span>
                {a.reversivel && !a.rolled_back && (
                  <button onClick={() => acao("incident_rollback_action", { p_action_id: a.action_id }, `Acao #${a.action_id} revertida`)} disabled={ocupado}
                    className="flex items-center gap-0.5 rounded-full bg-zinc-200 px-2 py-0.5 text-[9px] font-bold text-zinc-600 disabled:opacity-50"><RotateCcw className="h-2.5 w-2.5" /> Rollback</button>
                )}
                {a.rolled_back && <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-black text-purple-700">revertida</span>}
              </div>
            ))}
          </div>
          <div>
            <p className="mb-1 text-[11px] font-black text-zinc-600">🔒 Evidencias ({(detalhe.evidencias || []).length}) — imutaveis</p>
            <div className="flex flex-wrap gap-1">
              {(detalhe.evidencias || []).map((e: any, k: number) => (
                <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{e.tipo} · {e.origem}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#1f0a0a] via-[#9f1239] to-[#1f0a0a] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Siren className="h-8 w-8 text-rose-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">ORION Incident Response AI</h1>
                <span className="rounded-full bg-rose-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ring-rose-300/40">Incident</span>
              </div>
              <p className="text-sm text-rose-200/80">
                ORION-AI-45 · centro operacional de resposta · fecha o funil AI-40→41→42→43→44→45 · toda acao com justificativa e rollback
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-rose-200/70">Ativos</p>
              <p className="text-3xl font-black">{kpis.ativos ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Hoje", kpis.hoje], ["Criticos ativos", kpis.criticos_ativos], ["Aguard. humano", kpis.aguardando_humano],
              ["MTTA (min)", kpis.mtta_min], ["Resp. rapida (RTS)", `${kpis.rts ?? 0}%`], ["Recovery", `${kpis.recovery ?? 0}%`]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-rose-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS + acao imediata */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {TABS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#9f1239] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
          <button onClick={() => acao("respond_to_incidents", { p_trace: `painel_${Date.now()}` }, "Ciclo de resposta executado")} disabled={ocupado}
            className="ml-auto flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-black text-white shadow hover:bg-rose-700 disabled:opacity-50">
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Responder agora
          </button>
        </div>
        {msg && <p className="mt-2 text-[12px] font-bold text-zinc-600">{msg}</p>}

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-rose-500" /></div>}

        {/* RESUMO */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-rose-200 bg-rose-50/40 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["incident.summary", "Resumo executivo"], ["incident.respond", "Recomendar resposta"],
                  ["incident.timeline", "Narrar timeline"], ["incident.recommendation", "Prevencao"],
                  ["incident.classify", "Revisar classificacao"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l)} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-rose-200 hover:bg-rose-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-rose-100">{narrativa}</p>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Resposta automatica vs humana (30d)">
                <div className="grid grid-cols-2 gap-2">
                  {[["Acoes automaticas", kpis.acoes_auto_30d], ["Acoes humanas", kpis.acoes_humanas_30d],
                    ["Playbooks executados", kpis.playbooks_exec], ["Reincidencias", kpis.reincidencias]].map(([l, v]: any) => (
                    <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                      <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                      <p className="text-xl font-black text-zinc-800">{String(v ?? 0)}</p>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="Scores (explicaveis)">
                <div className="grid grid-cols-2 gap-2">
                  {[["IRS (risco)", kpis.irs], ["ICS (confianca)", kpis.ics], ["RTS (tempo resposta)", `${kpis.rts ?? 0}%`], ["Recovery", `${kpis.recovery ?? 0}%`]].map(([l, v]: any) => (
                    <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                      <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                      <p className="text-xl font-black text-zinc-800">{String(v ?? 0)}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-zinc-400">{kpis.formula}</p>
              </Card>
            </div>
          </div>
        )}

        {/* ATIVOS */}
        {aba === "ativos" && !isLoading && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 ring-1 ring-zinc-200">
              <Search className="h-4 w-4 text-zinc-400" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por titulo ou trace…"
                className="w-full bg-transparent text-sm outline-none" />
            </div>
            {!ativos.length ? <Card title="Incidentes ativos"><p className="py-6 text-center text-sm text-zinc-400">🛡️ Nenhum incidente ativo.</p></Card>
              : ativos.map((i: any) => <IncidenteLinha key={i.incident_id} i={i} />)}
          </div>
        )}

        {/* CRITICOS */}
        {aba === "criticos" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!criticos.length ? <Card title="Criticos"><p className="py-6 text-center text-sm text-zinc-400">Nenhum critico. 🎉</p></Card>
              : criticos.map((i: any) => <IncidenteLinha key={i.incident_id} i={i} />)}
          </div>
        )}

        {/* PLAYBOOKS */}
        {aba === "playbooks" && !isLoading && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {playbooks.map((p: any) => (
              <Card key={p.categoria} title={`${p.nome} (${p.categoria})`}>
                <div className="mb-2 flex flex-wrap gap-1">
                  {(p.passos || []).map((s: string, k: number) => (
                    <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{k + 1}. {s}</span>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 font-black ${p.ativo ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-400"}`}>{p.ativo ? "ativo" : "inativo"}</span>
                  <span className={`rounded-full px-2 py-0.5 font-black ${p.automatico ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}>{p.automatico ? "automatico" : "manual"}</span>
                  <span className="text-zinc-400">{p.execucoes} execucoes</span>
                  <button onClick={() => acao("incident_playbook_set", { p_categoria: p.categoria, p_automatico: !p.automatico }, `Playbook ${p.categoria}: automatico=${!p.automatico}`)} disabled={ocupado}
                    className="ml-auto rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-600 disabled:opacity-50">alternar modo</button>
                </div>
                <p className="mt-2 text-[10px] text-zinc-400">Bloqueios herdam a politica dos AI-40/42 — critico negado vira revisao humana.</p>
              </Card>
            ))}
          </div>
        )}

        {/* METRICAS & HISTORICO */}
        {aba === "metricas" && !isLoading && (
          <div className="mt-4 space-y-4">
            <Card title="Estatisticas diarias">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead><tr className="text-[10px] uppercase text-zinc-400">
                    <th className="py-1 pr-2">Dia</th><th className="pr-2">Abertos</th><th className="pr-2">Resolvidos</th>
                    <th className="pr-2">Criticos</th><th className="pr-2">MTTA</th><th className="pr-2">MTTR</th>
                    <th className="pr-2">Auto</th><th className="pr-2">Humanas</th><th>Sev. media</th>
                  </tr></thead>
                  <tbody>
                    {stats.map((s: any) => (
                      <tr key={s.data} className="border-t border-zinc-50">
                        <td className="py-1 pr-2 font-mono">{s.data}</td><td className="pr-2 font-black">{s.abertos}</td>
                        <td className="pr-2 text-emerald-700">{s.resolvidos}</td><td className="pr-2 text-red-600">{s.criticos}</td>
                        <td className="pr-2">{s.mtta_min}min</td><td className="pr-2">{s.mttr_min}min</td>
                        <td className="pr-2">{s.acoes_auto}</td><td className="pr-2">{s.acoes_humanas}</td><td>{s.severidade_media}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Por modulo de origem (total)">
              <div className="flex flex-wrap gap-1">
                {Object.entries((stats[0]?.por_modulo || {}) as Record<string, any>).map(([k, v]) => (
                  <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{k}: {String(v)}</span>
                ))}
              </div>
            </Card>
            <p className="flex items-center gap-1 text-[11px] text-zinc-400"><ListChecks className="h-3.5 w-3.5" />
              Suite de testes: <code className="rounded bg-zinc-100 px-1">SELECT incident_selftest()</code> — 17 checks (entrada oficial do COMANDO TESTE).</p>
          </div>
        )}

        {/* NOTIFICACOES */}
        {aba === "notificacoes" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!notifs.length ? <Card title="Notificacoes"><p className="py-6 text-center text-sm text-zinc-400">Nenhuma notificacao.</p></Card>
              : notifs.map((n: any) => (
              <div key={n.id} className={`flex flex-wrap items-center gap-2 rounded-2xl border p-3 ${n.lida ? "border-zinc-100 bg-white" : "border-rose-200 bg-rose-50/50"}`}>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{n.tipo}</span>
                <span className="min-w-0 flex-1 text-sm text-zinc-700">{n.mensagem}</span>
                <span className="text-[10px] text-zinc-400">{String(n.criado_em).replace("T", " ").slice(0, 16)}</span>
                {n.lida ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">lida ✓</span> : (
                  <button onClick={() => acao("incident_ack_notification", { p_notif_id: n.id }, "Leitura confirmada")} disabled={ocupado}
                    className="rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-black text-white disabled:opacity-50">Confirmar leitura</button>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Incident Response AI v1.0 · ORION-AI-45 · fecha o funil do Security Ecosystem · fontes 100% reais · playbooks auditaveis ·
          timeline/evidencias imutaveis · bloqueio so via RPCs guardadas (politica dos irmaos) · rollback preserva historico · tick 2 min · IA so via Gateway
        </p>
      </div>
    </div>
  );
}
