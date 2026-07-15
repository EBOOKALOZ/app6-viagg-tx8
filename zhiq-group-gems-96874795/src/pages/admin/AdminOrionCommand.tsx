/**
 * /admin/orion-command — ORION COMMAND CENTER (ORION-AI-12)
 *
 * Painel executivo definitivo: a empresa inteira em 30 segundos.
 * AGREGAÇÃO PURA — consome só APIs certificadas (executive_* no banco,
 * que por sua vez reusam health/core/performance/finance/growth/
 * campaign). IA Executiva via Gateway v3 + Prompt Registry
 * (executive.summary). Toda consulta é auditada com trace_id.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Crown, Loader2, Sparkles, Send, ExternalLink, Siren, Map as MapIcon, Clock } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const DOT: Record<string, string> = {
  operacional: "bg-emerald-500", sem_trafego: "bg-emerald-300", ocioso: "bg-sky-400",
  sem_dados: "bg-zinc-300", atencao: "bg-amber-500", degradado: "bg-orange-500",
  parado: "bg-red-600", indisponivel: "bg-red-600",
};
const SEV_ORD = ["critico", "alto", "medio", "atencao", "baixo", "urgente", "importante", "informativo", "observacao"];
const SEV_CLS: Record<string, string> = {
  critico: "bg-red-100 text-red-700", urgente: "bg-orange-100 text-orange-700",
  alto: "bg-orange-100 text-orange-700", medio: "bg-amber-100 text-amber-700",
  atencao: "bg-amber-100 text-amber-700", importante: "bg-amber-100 text-amber-700",
  baixo: "bg-sky-100 text-sky-700", informativo: "bg-sky-100 text-sky-700", observacao: "bg-sky-100 text-sky-700",
};

export default function AdminOrionCommand() {
  const nav = useNavigate();
  const [ocupado, setOcupado] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-command"], queryFn: () => rpc("executive_dashboard"), refetchInterval: 30000,
  });

  const score = dash?.score || {};
  const kpis = dash?.kpis || {};
  const alertas = dash?.alertas || {};
  const fmt = (v: any) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const perguntar = async (texto?: string) => {
    const q = texto || pergunta;
    if (!q.trim()) return;
    setOcupado("ia"); setResposta("");
    try {
      const ctx = await rpc("executive_summary");
      const r = await orionAiText("executive",
        `Pergunta da diretoria: ${q}\nEstado consolidado real: ${JSON.stringify(ctx)}`,
        { promptKey: "executive.summary", maxTokens: 600 });
      setResposta(r.ok ? String(r.texto) : `IA indisponível (${r.error}) — os dados continuam no painel.`);
    } catch (e: any) { setResposta("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const listaAlertas: any[] = SEV_ORD.flatMap((s) => ((alertas.por_severidade || {})[s] || []).map((a: any) => ({ ...a, severidade: s })));

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* CABEÇALHO EXECUTIVO */}
        <div className="rounded-3xl bg-gradient-to-r from-[#000000] via-[#1f2937] to-[#000000] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/20 ring-1 ring-amber-300/40">
              <Crown className="h-8 w-8 text-amber-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Command Center</h1>
              <p className="text-sm text-zinc-300">
                ORION-AI-12 · a empresa inteira em 30 segundos · agregação pura das APIs certificadas
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-amber-400/15 px-6 py-3 text-center ring-1 ring-amber-300/40">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200">Executive Score</p>
              <p className="text-4xl font-black text-amber-300">{score.executive_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {[["Health", score.fontes?.health_score], ["Performance", score.fontes?.performance_score],
              ["Disponib.", score.fontes?.disponibilidade],
              ["Receita hoje", fmt(kpis.receita?.ordens_pagas_hoje)],
              ["Pedidos hoje", kpis.pedidos_hoje], ["Marketplace", kpis.marketplace_itens],
              ["Custo IA", `US$ ${Number(kpis.custos_ia?.total_usd || 0).toFixed(3)}`],
              ["Alertas", alertas.total]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-zinc-400">{l}</p>
                <p className="truncate text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>}

        {!isLoading && (
          <div className="mt-4 space-y-4">

            {/* DECISION PANEL */}
            <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
              <h3 className="mb-2 flex items-center gap-1 text-sm font-black text-zinc-800">
                <Sparkles className="h-4 w-4 text-amber-600" /> Decision Panel — IA Executiva (executive.summary)
              </h3>
              <div className="flex flex-wrap gap-2">
                {["O que merece atenção agora?", "Resumo executivo", "Resumo financeiro", "Resumo operacional",
                  "Resumo comercial", "Resumo tecnológico", "Resumo da IA"].map((q) => (
                  <button key={q} onClick={() => perguntar(q)} disabled={!!ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-amber-200 hover:bg-amber-100 disabled:opacity-50">
                    {q}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input value={pergunta} onChange={(e) => setPergunta(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && perguntar()}
                  placeholder="Ou pergunte qualquer decisão…"
                  className="h-10 min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 text-sm" />
                <button onClick={() => perguntar()} disabled={!!ocupado}
                  className="flex h-10 items-center gap-1 rounded-xl bg-zinc-900 px-4 text-sm font-black text-white disabled:opacity-50">
                  {ocupado === "ia" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              {resposta && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-amber-100">{resposta}</p>}
            </div>

            {/* MAPA DOS MÓDULOS */}
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Mapa dos módulos (tempo real)</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {((dash?.modulos || []) as any[]).map((m: any) => (
                  <button key={m.modulo} onClick={() => nav(m.link)}
                    className="flex items-center gap-2 rounded-2xl border border-zinc-100 p-2.5 text-left hover:bg-slate-50">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[m.status] || "bg-zinc-300"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-zinc-700">{m.modulo.replaceAll("_", " ")}</p>
                      <p className="text-[10px] text-zinc-400">{m.status}{m.score != null && ` · ${m.score}`}</p>
                    </div>
                    <ExternalLink className="h-3 w-3 shrink-0 text-zinc-300" />
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* CENTRAL DE ALERTAS */}
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 flex items-center gap-1 text-sm font-black text-zinc-700">
                  <Siren className="h-4 w-4" /> Central de Alertas ({alertas.total ?? 0} ativos)
                </h3>
                {!listaAlertas.length ? (
                  <p className="py-6 text-center text-sm text-zinc-400">✅ Nenhum alerta ativo.</p>
                ) : listaAlertas.map((a: any, i: number) => (
                  <p key={i} className="mb-1 text-xs text-zinc-600">
                    <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-black ${SEV_CLS[a.severidade] || ""}`}>{a.severidade}</span>
                    <b>[{a.fonte}]</b> {a.titulo} · {new Date(a.quando).toLocaleString("pt-BR")}
                  </p>
                ))}
              </div>

              {/* GEOGRÁFICO */}
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 flex items-center gap-1 text-sm font-black text-zinc-700">
                  <MapIcon className="h-4 w-4" /> Painel geográfico (scores Growth por cidade)
                </h3>
                {((dash?.geografico || []) as any[]).map((g: any) => (
                  <div key={g.cidade} className="mb-1.5 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs font-bold capitalize text-zinc-700">
                      📍 {g.cidade}{g.uf ? ` — ${g.uf}` : ""}
                    </p>
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${g.score}%` }} />
                    </div>
                    <span className="text-xs font-black">{g.score}</span>
                  </div>
                ))}
                <p className="mt-1 text-[10px] text-zinc-400">Fonte: orion_growth_scores (nada recalculado)</p>
              </div>
            </div>

            {/* KPIs */}
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">KPIs executivos</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[["Receita total", fmt(kpis.receita?.ordens_pagas_total)],
                  ["Receita mês", fmt(kpis.receita?.ordens_pagas_mes)],
                  ["Comissões", fmt(kpis.receita?.comissoes_plataforma)],
                  ["Previsão mensal", fmt(kpis.previsao?.mensal)],
                  ["Lojas", kpis.lojas], ["Profissionais", kpis.profissionais],
                  ["Usuários", kpis.usuarios], ["Campanhas ativas", kpis.campanhas_ativas]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-sm font-black text-zinc-800">{String(v ?? 0)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">CAC/LTV/ROI: {kpis.cac_ltv_roi}</p>
            </div>

            {/* TIMELINE + AÇÕES */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 flex items-center gap-1 text-sm font-black text-zinc-700">
                  <Clock className="h-4 w-4" /> Linha do tempo
                </h3>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {((dash?.timeline || []) as any[]).map((t: any, i: number) => (
                    <p key={i} className="text-[11px] text-zinc-500">
                      <b className="text-zinc-700">{t.tipo}</b> · {t.origem} · {new Date(t.quando).toLocaleString("pt-BR")}
                    </p>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Centro de Ações</h3>
                <div className="grid grid-cols-2 gap-2">
                  {((dash?.acoes || []) as any[]).map((a: any) => (
                    <button key={a.url} onClick={() => nav(a.url)}
                      className="rounded-xl bg-zinc-900 px-3 py-2.5 text-xs font-black text-white hover:bg-zinc-700">
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Command Center v1.0 · ORION-AI-12 · Executive Intelligence · agregação pura, zero lógica duplicada ·
          consulta auditada com trace_id · IA só via Gateway v3 + Prompt Registry
        </p>
      </div>
    </div>
  );
}
