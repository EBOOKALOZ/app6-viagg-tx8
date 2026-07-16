/**
 * /admin/orion-automation — ORION Automation AI (ORION-AI-21)
 *
 * Camada oficial de automação: NUNCA decide — apenas EXECUTA ações
 * aprovadas sob POLÍTICA + PERMISSÃO + IDEMPOTÊNCIA + AUDITORIA.
 * Financeiro/destrutivo é sempre bloqueado (dupla trava). Read-only
 * sobre dados de negócio. IA só via Gateway + Prompt Registry.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Zap, Loader2, Sparkles, ListChecks, ShieldAlert, ClipboardList, Check, X } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const MODO: Record<string, string> = {
  auto: "bg-emerald-100 text-emerald-700", aprovacao: "bg-amber-100 text-amber-700", bloqueado: "bg-red-600 text-white",
};
const STATUS: Record<string, string> = {
  concluida: "bg-emerald-100 text-emerald-700", falha: "bg-red-100 text-red-700",
  bloqueada: "bg-red-600 text-white", aguardando_aprovacao: "bg-amber-100 text-amber-700",
  pronta: "bg-sky-100 text-sky-700", executando: "bg-indigo-100 text-indigo-700",
  rejeitada: "bg-zinc-200 text-zinc-600", delegada: "bg-violet-100 text-violet-700",
};

type Aba = "visao" | "fila" | "execucoes" | "politicas";

export default function AdminOrionAutomation() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("visao");
  const [ocupado, setOcupado] = useState("");
  const [narrativa, setNarrativa] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-automation"], queryFn: () => rpc("automation_dashboard"), refetchInterval: 30000,
  });

  const score = dash?.score || {};
  const metrics = dash?.metrics || {};
  const politicas = (dash?.politicas || []) as any[];
  const fila = (dash?.fila || []) as any[];
  const historico = (dash?.historico || []) as any[];
  const pendentes = fila.filter((f) => f.status === "aguardando_aprovacao");

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado("narr"); setNarrativa("");
    try {
      const ctx = await rpc("automation_summary");
      const r = await orionAiText("automation", `Tipo: ${tipo}\nDados reais: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 550 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(""); }
  };

  const decidir = async (id: string, aprovar: boolean) => {
    setOcupado(id);
    try {
      await rpc(aprovar ? "automation_approve" : "automation_reject", aprovar ? { p_id: id } : { p_id: id, p_motivo: "rejeitado no painel" });
      await qc.invalidateQueries({ queryKey: ["orion-automation"] });
    } catch (e: any) {
      alert(e.message);
    } finally { setOcupado(""); }
  };

  const kpis: [string, any][] = [
    ["Concluídas", score.concluidas], ["Falhas", score.falhas],
    ["Pendentes", score.pendentes], ["Bloqueadas", score.bloqueadas],
    ["Total", metrics.total], ["Tempo médio", score.tempo_medio_ms ? `${score.tempo_medio_ms}ms` : "—"],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0a2a2a] via-[#0d7a6e] to-[#0a2a2a] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Zap className="h-8 w-8 text-teal-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Automation AI</h1>
              <p className="text-sm text-teal-200/80">
                ORION-AI-21 · executa, nunca decide · política + permissão + auditoria
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-200/70">Automation Score</p>
              <p className="text-3xl font-black">{score.automation_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {kpis.map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-teal-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["visao", Sparkles, "Visão geral"], ["fila", ListChecks, `Aprovações${pendentes.length ? ` (${pendentes.length})` : ""}`],
             ["execucoes", ClipboardList, "Execuções"], ["politicas", ShieldAlert, "Políticas"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#0d7a6e] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "visao" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-teal-200 bg-teal-50/50 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["automation.summary", "Panorama"], ["automation.audit", "Auditoria"], ["automation.plan", "Plano"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={!!ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-teal-200 hover:bg-teal-100 disabled:opacity-50">
                    {ocupado === "narr" ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-teal-100">{narrativa}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Componentes do Automation Score</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries((score.componentes || {}) as Record<string, any>).map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{k.replaceAll("_", " ")}</p>
                    <p className="text-lg font-black text-zinc-800">{v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">{score.formula}</p>
            </div>
            <div className="rounded-3xl border border-red-100 bg-red-50/40 p-4 text-xs text-red-700 shadow-sm">
              <b>Dupla trava de governança:</b> ações financeiras, PIX, estornos, exclusão de usuário, alteração de
              permissões/RLS/políticas são <b>sempre bloqueadas</b> — mesmo que a política seja afrouxada. O Automation AI
              executa apenas ações seguras de uma allowlist idempotente; workflows são delegados aos donos.
            </div>
          </div>
        )}

        {/* APROVAÇÕES / FILA */}
        {aba === "fila" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!fila.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">
                Fila vazia. Requests entram por `automation_request` e são processados no tick :16.
              </div>
            ) : fila.map((f: any) => (
              <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${STATUS[f.status] || "bg-zinc-100"}`}>{f.status}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${MODO[f.modo] || "bg-zinc-100"}`}>{f.modo}</span>
                <span className="min-w-0 flex-1 truncate font-bold text-zinc-800">{f.acao}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{f.origem_modulo}</span>
                {f.status === "aguardando_aprovacao" && (
                  <div className="flex gap-1">
                    <button onClick={() => decidir(f.id, true)} disabled={ocupado === f.id}
                      className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-black text-white disabled:opacity-50">
                      {ocupado === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Aprovar
                    </button>
                    <button onClick={() => decidir(f.id, false)} disabled={ocupado === f.id}
                      className="flex items-center gap-1 rounded-lg bg-zinc-200 px-2.5 py-1 text-[11px] font-black text-zinc-700 disabled:opacity-50">
                      <X className="h-3 w-3" /> Rejeitar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* EXECUÇÕES (histórico + auditoria) */}
        {aba === "execucoes" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!historico.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">Sem execuções ainda.</div>
            ) : historico.map((h: any) => (
              <div key={h.id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${STATUS[h.status] || "bg-zinc-100"}`}>{h.status}</span>
                  <span className="min-w-0 flex-1 truncate font-bold text-zinc-800">{h.acao}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{h.politica_aplicada}</span>
                  {h.duracao_ms != null && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{h.duracao_ms}ms</span>}
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  origem: {h.origem_modulo} · {h.criado_em && new Date(h.criado_em).toLocaleString("pt-BR")}
                  {h.erro ? ` · erro: ${h.erro}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* POLÍTICAS */}
        {aba === "politicas" && !isLoading && (
          <div className="mt-4 space-y-2">
            {politicas.map((p: any) => (
              <div key={p.acao} className="flex flex-wrap items-center gap-2 rounded-3xl border border-zinc-100 bg-white p-3 shadow-sm">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${MODO[p.modo] || "bg-zinc-100"}`}>{p.modo}</span>
                <span className="font-bold text-zinc-800">{p.acao}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{p.categoria}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-400">{p.descricao}</span>
              </div>
            ))}
            <p className="text-center text-[11px] text-zinc-400">
              Políticas configuráveis (auto / aprovação / bloqueado). Categorias financeira/destrutiva/segurança
              não podem virar automáticas — trava de governança.
            </p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Automation AI v1.0 · ORION-AI-21 · executa, nunca decide · allowlist idempotente · financeiro/destrutivo bloqueado ·
          auditoria completa · tick :16 · IA só via Gateway + Prompt Registry
        </p>
      </div>
    </div>
  );
}
