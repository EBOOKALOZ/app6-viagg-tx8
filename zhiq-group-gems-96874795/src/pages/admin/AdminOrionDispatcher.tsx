/**
 * /admin/orion-dispatcher — ORION Dispatcher AI (ORION-AI-06)
 *
 * Command Center da execução: fila priorizada por grupo (sempre da
 * cidade do anúncio, com cooldowns), workers com heartbeat/failover,
 * retry com backoff → DLQ, throughput/latência/previsão. Inclui o
 * MODO OPERADOR HUMANO: o admin vira um worker GLM — puxa o próximo
 * item, copia o texto, posta no grupo e confirma (o Motor publica).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Waypoints, Loader2, RefreshCw, Users, AlertOctagon, Activity,
  Download, CheckCircle2, XCircle, Copy, Gauge,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const ST: Record<string, string> = {
  agendada: "bg-sky-100 text-sky-700", processando: "bg-violet-100 text-violet-700",
  confirmada: "bg-emerald-100 text-emerald-700", falha: "bg-amber-100 text-amber-700",
  dlq: "bg-red-100 text-red-700", cancelada: "bg-zinc-100 text-zinc-500",
};

type Aba = "comando" | "operador";

export default function AdminOrionDispatcher() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("comando");
  const [ocupado, setOcupado] = useState("");
  const [item, setItem] = useState<any | null>(null);

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-dispatcher-dash"], queryFn: () => rpc("orion_dispatcher_dashboard"), refetchInterval: 20000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["orion-dispatcher-dash"] });

  const tick = async () => {
    setOcupado("tick");
    try {
      const r = await rpc("orion_dispatcher_planejar", { p_limite: 20 });
      refresh();
      alert(`Planejador: ${r.requests_processados} request(s), ${r.itens_criados} item(ns) agendado(s).`);
    } catch (e: any) { alert("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const puxar = async () => {
    setOcupado("pull");
    try {
      const r = await rpc("orion_dispatcher_glm_pull", { p_worker: "humano-admin", p_limite: 1 });
      const it = (r.itens || [])[0] || null;
      setItem(it);
      refresh();
      if (!it) alert("Nenhum item vencido na fila agora (agenda/cooldowns respeitados).");
    } catch (e: any) { alert("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const confirmar = async (sucesso: boolean) => {
    if (!item) return;
    const erro = sucesso ? null : window.prompt("O que falhou? (vai para retry/backoff)");
    if (!sucesso && !erro) return;
    setOcupado("confirm");
    try {
      const r = await rpc("orion_dispatcher_glm_confirm", {
        p_item: item.item_id, p_sucesso: sucesso, p_erro: erro,
      });
      alert(sucesso ? "✅ Confirmado — o Motor registrou a publicação." : `Marcado como falha (${r.status}).`);
      setItem(null); refresh();
    } catch (e: any) { alert("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const f = dash?.fila_por_status || {};

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        <div className="rounded-3xl bg-gradient-to-r from-[#001a33] via-[#003a66] to-[#001a33] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Waypoints className="h-8 w-8 text-cyan-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Dispatcher AI</h1>
              <p className="text-sm text-cyan-200/80">
                ORION-AI-06 · orquestra a execução — quem publica é o Motor; quem posta é o GLM
                {dash?.atualizado_em ? ` · atualizado ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <button onClick={tick} disabled={!!ocupado}
              className="flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-[#001a33] hover:brightness-110 disabled:opacity-50">
              {ocupado === "tick" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Planejar agora
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {[["Motor aguard.", dash?.motor_aguardando], ["Agendadas", f.agendada],
              ["Processando", f.processando], ["Confirmadas", f.confirmada],
              ["Falhas", f.falha], ["DLQ", dash?.dlq],
              ["Throughput/h", dash?.throughput_hora],
              ["Latência méd.", dash?.latencia_media_ms ? `${Math.round(dash.latencia_media_ms / 1000)}s` : "—"],
            ].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
                <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["comando", Activity, "Command Center"], ["operador", Download, "Operador Humano (GLM)"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#003a66] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-cyan-500" /></div>}

        {/* COMMAND CENTER */}
        {aba === "comando" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 flex items-center gap-1 text-sm font-black text-zinc-700"><Users className="h-4 w-4" /> Workers</h3>
                {!((dash?.workers || []) as any[]).length ? (
                  <p className="text-xs text-zinc-400">Nenhum worker registrado ainda.</p>
                ) : ((dash?.workers || []) as any[]).map((w: any) => (
                  <p key={w.id} className="text-xs text-zinc-600">
                    <span className={`mr-1 inline-block h-2 w-2 rounded-full ${w.ativo ? "bg-emerald-500" : "bg-zinc-300"}`} />
                    <b>{w.id}</b> ({w.tipo}) · {new Date(w.heartbeat).toLocaleTimeString("pt-BR")}
                  </p>
                ))}
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 flex items-center gap-1 text-sm font-black text-zinc-700"><Gauge className="h-4 w-4" /> Previsão & Saúde</h3>
                <p className="text-xs text-zinc-600">Fila: {dash?.previsao?.fila_pendente} ·
                  {dash?.previsao?.tempo_estimado_min != null ? ` conclusão ~${dash.previsao.tempo_estimado_min} min` : ` ${dash?.previsao?.nota || ""}`}</p>
                <p className="mt-1 text-xs text-zinc-600">TPS: {dash?.tps} · Latência máx: {dash?.latencia_max_ms ? Math.round(dash.latencia_max_ms / 1000) + "s" : "—"}</p>
                <p className="mt-1 text-xs text-zinc-600">Cron: {dash?.health?.cron_ativo ? "✅ ativo (5min)" : "❌"} ·
                  Grupos em cooldown: {dash?.health?.grupos_em_cooldown}</p>
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Por cidade</h3>
                <div className="flex flex-wrap gap-1.5">
                  {((dash?.por_cidade || []) as any[]).map((c: any) => (
                    <span key={c.cidade} className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-bold text-cyan-700">
                      📍 {c.cidade}: {c.n}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Fila priorizada (agendadas, processando, falhas, DLQ)</h3>
              {!((dash?.itens || []) as any[]).length ? (
                <p className="p-6 text-center text-sm text-zinc-400">Fila vazia — nenhum despacho pendente.</p>
              ) : ((dash?.itens || []) as any[]).map((q: any) => (
                <div key={q.id} className="mb-1.5 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 p-2.5">
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-black text-white">P{q.prioridade}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${ST[q.status] || ""}`}>{q.status}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-700">
                    {q.grupo_nome || q.canal} · 📍 {q.cidade}
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {new Date(q.agendado_para).toLocaleString("pt-BR")}
                    {q.worker_id && ` · ${q.worker_id}`}
                    {q.tentativas > 0 && ` · tent. ${q.tentativas}`}
                  </span>
                  {q.erro && <p className="w-full text-[10px] text-red-500">{String(q.erro).slice(0, 100)}</p>}
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 flex items-center gap-1 text-sm font-black text-zinc-700"><AlertOctagon className="h-4 w-4" /> Eventos em tempo real</h3>
              {((dash?.eventos || []) as any[]).map((e: any, i: number) => (
                <p key={i} className="text-[11px] text-zinc-500">
                  <b className={e.tipo.includes("failed") || e.tipo.includes("alert") ? "text-red-600" : "text-zinc-700"}>{e.tipo}</b>
                  {" · "}{new Date(e.quando).toLocaleTimeString("pt-BR")}
                  {e.dados?.worker && ` · ${e.dados.worker}`}
                  {e.dados?.grupo && ` · ${e.dados.grupo}`}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* OPERADOR HUMANO */}
        {aba === "operador" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs text-zinc-400">
              Você é um <b>worker GLM humano</b>: puxe o próximo item da fila, copie o texto, poste no grupo
              indicado e confirme. A confirmação faz o Motor registrar a publicação oficialmente.
              Se ninguém puxar, nada se perde — a fila espera e o auto-poster GLM pode assumir.
            </p>
            <button onClick={puxar} disabled={!!ocupado}
              className="flex items-center gap-2 rounded-xl bg-[#003a66] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
              {ocupado === "pull" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Puxar próximo item
            </button>

            {item && (
              <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
                <p className="text-sm font-black text-zinc-800">
                  📱 Grupo: {item.grupo} · 📍 {item.cidade} · prioridade {item.prioridade}
                </p>
                {item.grupo_link && (
                  <a href={item.grupo_link} target="_blank" rel="noreferrer"
                    className="text-xs font-semibold text-cyan-700 underline">Abrir grupo no WhatsApp</a>
                )}
                <div className="mt-2 whitespace-pre-wrap rounded-xl bg-white p-3 text-sm text-zinc-800">
                  {typeof item.conteudo === "string" ? item.conteudo : (item.conteudo?.whatsapp || JSON.stringify(item.conteudo))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => navigator.clipboard.writeText(
                    typeof item.conteudo === "string" ? item.conteudo : (item.conteudo?.whatsapp || ""))}
                    className="flex items-center gap-1 rounded-xl bg-zinc-700 px-3 py-2 text-xs font-black text-white">
                    <Copy className="h-3.5 w-3.5" /> Copiar texto
                  </button>
                  <button onClick={() => confirmar(true)} disabled={!!ocupado}
                    className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Postei — confirmar
                  </button>
                  <button onClick={() => confirmar(false)} disabled={!!ocupado}
                    className="flex items-center gap-1 rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                    <XCircle className="h-3.5 w-3.5" /> Falhou
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Dispatcher AI v1.0 · ORION-AI-06 · grupos só da cidade · cooldowns automáticos · retry backoff → DLQ ·
          failover por heartbeat · quem publica é o Motor, sempre
        </p>
      </div>
    </div>
  );
}
