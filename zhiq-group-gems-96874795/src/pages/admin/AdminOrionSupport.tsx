/**
 * /admin/orion-support — ORION Support AI (ORION-AI-17)
 *
 * Camada de inteligência sobre o suporte: triagem por urgência/tema,
 * fila priorizada, sugestão de resposta (via Gateway+Registry, para o
 * atendente revisar — nunca envia sozinho), recorrências e SLA.
 * Read-only sobre os tickets (não muda status nem envia resposta).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Headphones, Loader2, Sparkles, ListChecks, Repeat, Bell, MessageSquare } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const PRIO: Record<string, string> = {
  critica: "bg-red-600 text-white", alta: "bg-orange-100 text-orange-700",
  media: "bg-amber-100 text-amber-700", baixa: "bg-sky-100 text-sky-700",
};

type Aba = "central" | "fila" | "recorrencias" | "alertas";

export default function AdminOrionSupport() {
  const [aba, setAba] = useState<Aba>("central");
  const [ocupado, setOcupado] = useState("");
  const [narrativa, setNarrativa] = useState("");
  const [sugestao, setSugestao] = useState<Record<string, string>>({});

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-support"], queryFn: () => rpc("support_dashboard"), refetchInterval: 30000,
  });

  const score = dash?.score || {};
  const metrics = dash?.metrics || {};
  const alertas = dash?.alertas || {};
  const fila = (dash?.fila_priorizada || []) as any[];
  const rec = dash?.recorrencias || {};

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado("narr"); setNarrativa("");
    try {
      const ctx = await rpc("support_summary");
      const r = await orionAiText("support", `Tipo: ${tipo}\nDados reais: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 500 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(""); }
  };

  const sugerir = async (item: any) => {
    setOcupado(item.ticket_id);
    try {
      const t = item.ticket || {};
      const r = await orionAiText("support",
        `Ticket (categoria: ${t.categoria}): assunto "${t.assunto}". Mensagem: ${t.mensagem}. Sugira uma resposta para o atendente revisar.`,
        { promptKey: "support.response", maxTokens: 450 });
      setSugestao((s) => ({ ...s, [item.ticket_id]: r.ok ? String(r.texto) : `IA indisponível (${r.error})` }));
    } finally { setOcupado(""); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        <div className="rounded-3xl bg-gradient-to-r from-[#04263b] via-[#0a4d73] to-[#04263b] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Headphones className="h-8 w-8 text-sky-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Support AI</h1>
              <p className="text-sm text-sky-200/80">
                ORION-AI-17 · inteligência de suporte · triagem + sugestão (o atendente revisa e envia)
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-200/70">Support Score</p>
              <p className="text-3xl font-black">{score.support_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Abertos", score.tickets_abertos], ["SLA estourado", alertas.sla_estourado],
              ["Críticos", alertas.criticos], ["Total tickets", metrics.total],
              ["Resp. por IA", metrics.respondidos_por_ia], ["Base conhecimento", metrics.base_conhecimento]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-sky-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["central", Sparkles, "Central"], ["fila", ListChecks, `Fila priorizada${fila.length ? ` (${fila.length})` : ""}`],
             ["recorrencias", Repeat, "Recorrências"], ["alertas", Bell, "Alertas & SLA"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#0a4d73] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>}

        {/* CENTRAL */}
        {aba === "central" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-sky-200 bg-sky-50/50 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["support.executive", "Resumo executivo"], ["support.triage", "Triagem"],
                  ["support.recurring", "Recorrências"], ["support.summary", "Panorama"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={!!ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-sky-200 hover:bg-sky-100 disabled:opacity-50">
                    {ocupado === "narr" ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-sky-100">{narrativa}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Componentes do Support Score</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries((score.componentes || {}) as Record<string, any>).map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{k.replaceAll("_", " ")}</p>
                    <p className="text-lg font-black text-zinc-800">{v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">
                {score.formula} · tempo médio resolução: {score.tempo_medio_resolucao_h ?? "—"}h
              </p>
            </div>
          </div>
        )}

        {/* FILA PRIORIZADA */}
        {aba === "fila" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!fila.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">
                🎉 Nenhum ticket aberto na fila. Rode o tick ou aguarde a triagem horária.
              </div>
            ) : fila.map((it: any) => (
              <div key={it.ticket_id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-black text-white">urg {it.urgencia}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${PRIO[it.prioridade] || ""}`}>{it.prioridade}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{it.tema}</span>
                  <p className="min-w-0 flex-1 truncate font-bold">{it.resumo}</p>
                  <button onClick={() => sugerir(it)} disabled={ocupado === it.ticket_id}
                    className="flex items-center gap-1 rounded-xl bg-[#0a4d73] px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                    {ocupado === it.ticket_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                    Sugerir resposta
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  {it.ticket?.categoria} · {it.ticket?.user_type} · {it.ticket?.criado_em && new Date(it.ticket.criado_em).toLocaleString("pt-BR")}
                </p>
                {it.ticket?.mensagem && <p className="mt-1 text-xs text-zinc-600">"{it.ticket.mensagem}"</p>}
                {sugestao[it.ticket_id] && (
                  <div className="mt-2 rounded-2xl bg-sky-50 p-3">
                    <p className="text-[10px] font-black uppercase text-sky-600">Sugestão para revisão (não enviada)</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">{sugestao[it.ticket_id]}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* RECORRÊNCIAS */}
        {aba === "recorrencias" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Temas mais recorrentes (30d)</h3>
              {((rec.por_tema || []) as any[]).map((t: any) => (
                <div key={t.tema} className="mb-1.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-xs font-semibold text-zinc-600">{t.tema}</span>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black text-sky-700">{t.n}</span>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Por categoria do ticket</h3>
              {((rec.por_categoria_ticket || []) as any[]).map((c: any) => (
                <div key={c.categoria} className="mb-1.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-xs font-semibold text-zinc-600">{c.categoria}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black text-zinc-600">{c.n}</span>
                </div>
              ))}
              <p className="mt-2 text-[10px] text-zinc-400">{rec.nota}</p>
            </div>
          </div>
        )}

        {/* ALERTAS */}
        {aba === "alertas" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-3 gap-3">
              {[["SLA estourado (24h)", alertas.sla_estourado, "red"], ["Críticos", alertas.criticos, "orange"],
                ["Backlog", alertas.backlog, "sky"]].map(([l, v, c]: any) => (
                <div key={l} className={`rounded-2xl bg-${c}-50 p-4 text-center`}>
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className={`text-2xl font-black text-${c}-700`}>{v ?? 0}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              SLA = ticket aberto há mais de 24h sem resposta. Tickets críticos são detectados pela triagem
              (urgência ≥ 75). O ORION Support AI recomenda — atender e responder é sempre humano.
            </p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Support AI v1.0 · ORION-AI-17 · read-only sobre os tickets · sugere, não envia ·
          triagem horária · integra Event Bus · IA só via Gateway + Prompt Registry
        </p>
      </div>
    </div>
  );
}
