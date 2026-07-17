/**
 * /admin/orion-compliance — ORION Compliance & LGPD AI (ORION-AI-48)
 *
 * Centro de governanca de privacidade: registro de tratamento VIVO (art.37),
 * direitos do titular com ciclo auditado, retencao medida em dados reais,
 * incidentes de privacidade com evidencia e controles verificados. NUNCA
 * modifica dados pessoais; NUNCA expoe dado sensivel (so contagens/ids).
 * Incidente alto/critico vira evento na base comum — o AI-45 responde.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import {
  Scale, Loader2, Sparkles, FileText, UserCheck, Timer, ShieldAlert, Bell, Play,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const ST: Record<string, string> = {
  conforme: "bg-emerald-100 text-emerald-700", nao_conforme: "bg-red-100 text-red-700",
  declarado: "bg-slate-100 text-slate-500", aberta: "bg-amber-100 text-amber-700",
  em_analise: "bg-sky-100 text-sky-700", concluida: "bg-emerald-100 text-emerald-700",
  negada: "bg-zinc-100 text-zinc-500", vencida: "bg-red-100 text-red-700",
  aberto: "bg-red-100 text-red-700", mitigado: "bg-amber-100 text-amber-700", resolvido: "bg-emerald-100 text-emerald-700",
};
const SEV: Record<string, string> = {
  critica: "bg-red-700 text-white", alta: "bg-red-600 text-white", media: "bg-amber-100 text-amber-700", baixa: "bg-sky-100 text-sky-700",
};

type Aba = "resumo" | "lgpd" | "tratamento" | "retencao" | "incidentes" | "alertas";

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
    <h3 className="mb-2 text-sm font-black text-zinc-700">{title}</h3>
    {children}
  </div>
);

export default function AdminOrionCompliance() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");
  const [msg, setMsg] = useState("");
  const [tipoReq, setTipoReq] = useState("acesso");

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-compliance"], queryFn: () => rpc("compliance_dashboard"), refetchInterval: 60000,
  });

  const scores = dash?.scores || {};
  const controles = (dash?.controles || []) as any[];
  const requests = (dash?.requests || []) as any[];
  const registry = (dash?.registry || []) as any[];
  const retention = (dash?.retention || []) as any[];
  const incidents = (dash?.incidents || []) as any[];
  const alerts = (dash?.alerts || []) as any[];

  const narrar = async (promptKey: string, rotulo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("compliance_summary");
      const r = await orionAiText("compliance_lgpd", `Pedido: ${rotulo}\nEstado real: ${JSON.stringify(ctx)}`, { promptKey, maxTokens: 700 });
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
    ["resumo", Sparkles, "Resumo"], ["lgpd", UserCheck, `LGPD & Direitos${requests.length ? ` (${requests.length})` : ""}`],
    ["tratamento", FileText, "Registro de Tratamento"], ["retencao", Timer, "Retencao"],
    ["incidentes", ShieldAlert, `Incidentes${incidents.filter((i) => i.status === "aberto").length ? ` (${incidents.filter((i) => i.status === "aberto").length})` : ""}`],
    ["alertas", Bell, "Alertas & Estatisticas"],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        <div className="rounded-3xl bg-gradient-to-r from-[#041f1a] via-[#065f46] to-[#041f1a] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Scale className="h-8 w-8 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">ORION Compliance & LGPD AI</h1>
                <span className="rounded-full bg-emerald-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ring-emerald-300/40">Compliance</span>
              </div>
              <p className="text-sm text-emerald-200/80">
                ORION-AI-48 · governanca de privacidade · monitora/evidencia/recomenda — NUNCA altera dados pessoais nem expoe dado sensivel
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">Compliance Score</p>
              <p className="text-3xl font-black">{scores.cps ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["LGPD (LCS)", scores.lcs], ["Risco dados (DRS)", scores.drs], ["Risco privacid. (PRS)", scores.prs],
              ["Solicitacoes abertas", requests.filter((r) => ["aberta", "em_analise"].includes(r.status)).length],
              ["Incidentes abertos", incidents.filter((i) => i.status === "aberto").length],
              ["Retencao vencida", retention.filter((r) => r.vencido).length]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {TABS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#065f46] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
          <button onClick={() => acao("run_compliance_check", { p_trace: `painel_${Date.now()}` }, "Verificacao de conformidade executada")} disabled={ocupado}
            className="ml-auto flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow hover:bg-emerald-700 disabled:opacity-50">
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Verificar agora
          </button>
        </div>
        {msg && <p className="mt-2 text-[12px] font-bold text-zinc-600">{msg}</p>}
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>}

        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["compliance.audit", "Explicar conformidade"], ["lgpd.evaluate", "Avaliar LGPD"],
                  ["privacy.summary", "Resumo de privacidade"], ["compliance.recommendation", "Priorizar correcoes"],
                  ["compliance.risk", "Explicar risco"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l)} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-emerald-200 hover:bg-emerald-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-emerald-100">{narrativa}</p>}
            </div>
            <Card title="Controles de conformidade (verificados automaticamente)">
              {controles.map((c: any) => (
                <div key={c.controle} className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ST[c.status] || ""}`}>{c.status}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{c.categoria}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-700">{c.nome}</span>
                  <span className="text-[10px] text-zinc-400">{String(c.ultima_verificacao).slice(5, 16).replace("T", " ")}</span>
                </div>
              ))}
              <p className="mt-2 text-[10px] text-zinc-400">{scores.formula}</p>
            </Card>
          </div>
        )}

        {aba === "lgpd" && !isLoading && (
          <div className="mt-4 space-y-4">
            <Card title="Registrar solicitacao do titular (canal admin)">
              <div className="flex flex-wrap items-center gap-2">
                <select value={tipoReq} onChange={(e) => setTipoReq(e.target.value)}
                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                  {["acesso", "correcao", "exclusao", "anonimizacao", "portabilidade", "revogacao", "oposicao"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={() => acao("lgpd_request_open", { p_tipo: tipoReq, p_detalhes: { origem: "painel" } }, `Solicitacao de ${tipoReq} registrada (prazo 15d)`)} disabled={ocupado}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Registrar</button>
                <p className="text-[11px] text-zinc-400">Execucao de exclusao/anonimizacao e HUMANA — aqui fica o registro auditado do ciclo.</p>
              </div>
            </Card>
            <Card title={`Solicitacoes (${requests.length})`}>
              {!requests.length ? <p className="py-4 text-center text-sm text-zinc-400">Nenhuma solicitacao.</p> : requests.map((r: any) => (
                <div key={r.request_id} className="mb-2 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50/60 p-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ST[r.status] || ""}`}>{r.status}</span>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{r.tipo}</span>
                  <span className="text-xs text-zinc-600">#{r.request_id}{r.user_id ? ` · titular ${String(r.user_id).slice(0, 8)}…` : ""}</span>
                  <span className="text-[10px] text-zinc-400">prazo {r.prazo}</span>
                  {["aberta", "em_analise", "vencida"].includes(r.status) && (
                    <span className="ml-auto flex gap-1">
                      {r.status !== "em_analise" && <button onClick={() => acao("lgpd_request_update", { p_id: r.request_id, p_status: "em_analise" }, "Em analise")} disabled={ocupado}
                        className="rounded-full bg-sky-600 px-2.5 py-1 text-[10px] font-black text-white disabled:opacity-50">Analisar</button>}
                      <button onClick={() => acao("lgpd_request_update", { p_id: r.request_id, p_status: "concluida", p_nota: "concluida pelo painel" }, "Concluida")} disabled={ocupado}
                        className="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black text-white disabled:opacity-50">Concluir</button>
                    </span>
                  )}
                </div>
              ))}
            </Card>
          </div>
        )}

        {aba === "tratamento" && !isLoading && (
          <div className="mt-4 space-y-2">
            {registry.map((g: any) => (
              <div key={g.atividade} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black text-zinc-800">{g.atividade}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${g.base_legal ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {g.base_legal || "SEM BASE LEGAL"}</span>
                  <span className="ml-auto text-[10px] text-zinc-400">{g.responsavel}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-600"><b>Dados:</b> {g.categoria_dados} · <b>Finalidade:</b> {g.finalidade}</p>
                <p className="text-[11px] text-zinc-500"><b>Origem:</b> {g.origem} · <b>Destino:</b> {g.destino} · <b>Retencao:</b> {g.retencao}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(g.tabelas || []).map((t: string) => <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[9px] text-slate-500">{t}</span>)}
                </div>
              </div>
            ))}
          </div>
        )}

        {aba === "retencao" && !isLoading && (
          <div className="mt-4 space-y-2">
            {retention.map((r: any) => (
              <div key={r.item} className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${r.vencido ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {r.vencido ? "vencido" : "ok"}</span>
                <span className="font-mono text-xs font-bold text-zinc-700">{r.tabela}</span>
                <span className="text-[11px] text-zinc-500">atual <b>{r.atual_dias ?? "—"}d</b> · politica <b>{r.politica_dias}d</b></span>
                {r.excecao_legal && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">excecao: {r.excecao_legal}</span>}
              </div>
            ))}
            <p className="text-[11px] text-zinc-400">Idade medida nos dados REAIS a cada tick (15 min). Descarte é decisão humana — o módulo alerta, nunca apaga.</p>
          </div>
        )}

        {aba === "incidentes" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!incidents.length ? <Card title="Incidentes de privacidade"><p className="py-6 text-center text-sm text-zinc-400">🛡️ Nenhum.</p></Card>
              : incidents.map((i: any) => (
              <div key={i.id} className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${SEV[i.severidade] || ""}`}>{i.severidade}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ST[i.status] || ""}`}>{i.status}</span>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{i.tipo}</span>
                  {i.encaminhado_ai45 && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-black text-purple-700">→ AI-45</span>}
                  <span className="ml-auto text-[10px] text-zinc-400">{String(i.criado_em).slice(0, 16).replace("T", " ")}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-700">{i.descricao}</p>
              </div>
            ))}
          </div>
        )}

        {aba === "alertas" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card title={`Alertas (14d)`}>
              {!alerts.length ? <p className="text-xs text-zinc-400">Nenhum alerta.</p> : alerts.map((a: any) => (
                <div key={a.id} className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[a.severidade] || ""}`}>{a.severidade}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{a.categoria}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-700">{a.alerta}</span>
                </div>
              ))}
            </Card>
            <Card title="Evidencias & Testes">
              <p className="text-sm text-zinc-700">Evidencias registradas: <b>{dash?.evidence_count ?? 0}</b> (append-only — nunca excluidas).</p>
              <p className="mt-2 text-[11px] text-zinc-400">Suite de testes: <code className="rounded bg-zinc-100 px-1">SELECT compliance_selftest()</code> — 14 checks (entrada oficial do COMANDO TESTE).</p>
            </Card>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Compliance & LGPD AI v1.0 · ORION-AI-48 · registro de tratamento vivo · direitos do titular auditados · retencao medida ·
          incidentes → AI-45 · CPS/LCS/DRS/PRS explicaveis · nunca altera dados pessoais · nunca expoe dado sensivel · tick 15 min · IA so via Gateway
        </p>
      </div>
    </div>
  );
}
