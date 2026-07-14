/**
 * /admin/orion-campaign — ORION Campaign AI (ORION-AI-05)
 *
 * Campanhas nascem AUTOMATICAMENTE de pacotes montados (Package AI),
 * com plano explicável (canais, horários, frequência, grupos DA cidade,
 * orçamento do catálogo oficial). Publicação só via Motor (porta única);
 * otimização apenas SUGERE — aplicar é decisão do administrador.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiSummary } from "@/lib/ai/orionAiGateway";
import {
  Megaphone, Loader2, Play, Pause, XCircle, CheckCircle2, Wand2,
  Activity, ChevronDown, ChevronUp, RefreshCw, Sparkles, Map,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const ST: Record<string, { label: string; cls: string }> = {
  planejada: { label: "Planejada", cls: "bg-sky-100 text-sky-700" },
  ativa:     { label: "Ativa",     cls: "bg-emerald-100 text-emerald-700" },
  pausada:   { label: "Pausada",   cls: "bg-amber-100 text-amber-700" },
  concluida: { label: "Concluída", cls: "bg-teal-100 text-teal-700" },
  cancelada: { label: "Cancelada", cls: "bg-zinc-100 text-zinc-500" },
  erro:      { label: "Erro",      cls: "bg-red-100 text-red-700" },
  dlq:       { label: "DLQ ⚠",     cls: "bg-red-100 text-red-700" },
};

type Aba = "campanhas" | "comando";

export default function AdminOrionCampaign() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("campanhas");
  const [aberto, setAberto] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [sugestoes, setSugestoes] = useState<Record<string, any>>({});
  const [parecer, setParecer] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-campaign-dash"], queryFn: () => rpc("orion_campaign_dashboard"), refetchInterval: 30000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["orion-campaign-dash"] });

  const acao = async (id: string, fn: () => Promise<any>) => {
    setOcupado(id);
    try { await fn(); refresh(); }
    catch (e: any) { alert("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const iniciar = (c: any) => acao(c.id, async () => {
    const canais = window.prompt("Canais:", ((c.plano?.canais || ["feed", "whatsapp"]) as string[]).join(","));
    if (!canais) throw new Error("cancelado");
    const r = await rpc("orion_campaign_iniciar", {
      p_campanha: c.id, p_canais: canais.split(",").map((x) => x.trim()).filter(Boolean),
    });
    alert("Campanha iniciada via Motor: " + JSON.stringify(r.requests));
  });

  const otimizar = (c: any) => acao(c.id, async () => {
    const r = await rpc("orion_campaign_otimizar", { p_campanha: c.id });
    setSugestoes((s) => ({ ...s, [c.id]: r }));
  });

  const estrategista = async () => {
    setOcupado("orion");
    try {
      const r = await orionAiSummary("campaign",
        `Você é o estrategista de campanhas da VIAGG-TX8. Analise e escreva um parecer curto (5-8 frases, pt-BR) com prioridades. Dados: ${JSON.stringify({ status: dash?.por_status, risco: dash?.em_risco, motor: dash?.motor, expansao: dash?.expansao })}`,
        { maxTokens: 500 });
      setParecer(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(""); }
  };

  const st = (dash?.por_status || {}) as Record<string, number>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        <div className="rounded-3xl bg-gradient-to-r from-[#31041f] via-[#5e0a3c] to-[#31041f] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Megaphone className="h-8 w-8 text-pink-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Campaign AI</h1>
              <p className="text-sm text-pink-200/80">
                ORION-AI-05 · campanha nasce do pacote, publica só pelo Motor, otimização é sugestão
                {dash?.atualizado_em ? ` · atualizado ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <button onClick={() => acao("novas", () => rpc("orion_campaign_processar_novos", { p_limite: 10 }))}
              disabled={!!ocupado}
              className="flex items-center gap-2 rounded-xl bg-pink-400 px-4 py-2.5 text-sm font-black text-[#31041f] hover:brightness-110 disabled:opacity-50">
              {ocupado === "novas" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Processar pacotes novos
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Planejadas", st.planejada], ["Ativas", st.ativa], ["Pausadas", st.pausada],
              ["Concluídas", st.concluida], ["Em risco", ((dash?.em_risco || []) as any[]).length],
              ["DLQ", st.dlq]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
                <p className="text-[10px] font-bold uppercase tracking-wider text-pink-200/70">{l}</p>
                <p className="text-xl font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["campanhas", Megaphone, "Campanhas"], ["comando", Activity, "Command Center"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#5e0a3c] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-pink-500" /></div>}

        {/* CAMPANHAS */}
        {aba === "campanhas" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!((dash?.campanhas || []) as any[]).length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">
                Nenhuma campanha — elas nascem automaticamente quando a Package AI monta um pacote.
              </div>
            ) : ((dash?.campanhas || []) as any[]).map((c: any) => {
              const b = ST[c.status] || { label: c.status, cls: "bg-zinc-100 text-zinc-500" };
              const exp = aberto === c.id;
              const sug = sugestoes[c.id];
              return (
                <div key={c.id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-bold">{c.nome}</p>
                    <span className="text-[10px] text-zinc-400">v{c.versao} · {c.prioridade}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${b.cls}`}>{b.label}</span>
                    {["planejada", "pausada"].includes(c.status) && (
                      <button onClick={() => iniciar(c)} disabled={ocupado === c.id}
                        className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                        <Play className="h-3.5 w-3.5" /> Iniciar
                      </button>
                    )}
                    {c.status === "ativa" && (
                      <button onClick={() => acao(c.id, () => rpc("orion_campaign_estado", { p_campanha: c.id, p_acao: "pausar" }))}
                        className="flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-black text-white">
                        <Pause className="h-3.5 w-3.5" /> Pausar
                      </button>
                    )}
                    {!["concluida", "cancelada"].includes(c.status) && (
                      <>
                        <button onClick={() => otimizar(c)} disabled={ocupado === c.id}
                          className="flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                          <Wand2 className="h-3.5 w-3.5" /> Otimizar
                        </button>
                        <button onClick={() => acao(c.id, () => rpc("orion_campaign_estado", { p_campanha: c.id, p_acao: "cancelar", p_motivo: "cancelada pelo admin" }))}
                          className="flex items-center gap-1 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-black text-white">
                          <XCircle className="h-3.5 w-3.5" /> Cancelar
                        </button>
                      </>
                    )}
                    <button onClick={() => setAberto(exp ? "" : c.id)} className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100">
                      {exp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    {c.cidade && <>📍 {c.cidade} · </>}{c.categoria} · criada {new Date(c.criado_em).toLocaleString("pt-BR")}
                    {c.metricas?.ctr_pct != null && <> · CTR {c.metricas.ctr_pct}%</>}
                    {c.erro && <span className="text-red-500"> · {String(c.erro).slice(0, 100)}</span>}
                  </p>

                  {exp && (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {c.plano && (
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Plano</p>
                          <p className="mt-1 text-xs text-zinc-700">
                            Canais: {(c.plano.canais || []).join(", ")} · Janela: {c.plano.janela_horario} ·
                            Freq: {c.plano.frequencia?.diaria}/dia ({c.plano.frequencia?.intervalo_min_horas}h mín) ·
                            Grupos na cidade: {c.plano.grupos_na_cidade} · Alcance: {c.plano.alcance_potencial}
                          </p>
                          <p className="mt-1 text-xs text-zinc-600">{c.plano.estrategia}</p>
                        </div>
                      )}
                      {c.recomendacao && (
                        <div className="rounded-2xl border border-pink-200 bg-pink-50 p-3">
                          <p className="text-[10px] font-black uppercase tracking-wider text-pink-600">
                            Recomendação · confiança {Math.round(Number(c.recomendacao.confianca || 0) * 100)}% ·
                            sucesso {c.recomendacao.probabilidade_sucesso}
                          </p>
                          <p className="mt-1 text-xs text-zinc-700">{c.recomendacao.motivo}</p>
                          <p className="mt-1 text-[11px] text-zinc-500">
                            Riscos: {(c.recomendacao.riscos || []).join("; ")}
                          </p>
                        </div>
                      )}
                      {c.metricas && (
                        <div className="rounded-2xl bg-slate-50 p-3 md:col-span-2">
                          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Métricas & ROI</p>
                          <p className="mt-1 text-xs text-zinc-700">
                            {c.metricas.views} views · {c.metricas.cliques} cliques · {c.metricas.conversoes} conversões
                            {c.metricas.ctr_pct != null && <> · CTR {c.metricas.ctr_pct}%</>}
                            {c.metricas.roi != null && <> · ROI {c.metricas.roi}%</>}
                            {c.metricas.cpc != null && <> · CPC R$ {c.metricas.cpc}</>}
                          </p>
                          {c.metricas.nota && <p className="mt-1 text-[11px] text-zinc-400">{c.metricas.nota}</p>}
                        </div>
                      )}
                      {sug && (
                        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3 md:col-span-2">
                          <p className="text-[10px] font-black uppercase tracking-wider text-violet-600">Sugestões de otimização (aplicação manual)</p>
                          {((sug.sugestoes || []) as any[]).map((s: any, i: number) => (
                            <p key={i} className="mt-1 text-xs text-zinc-700">• <b>{s.sugestao}</b> — {s.motivo}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* COMMAND CENTER */}
        {aba === "comando" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-zinc-700">Parecer do Estrategista ORION</h3>
                <button onClick={estrategista} disabled={!!ocupado}
                  className="flex items-center gap-1 rounded-xl bg-[#5e0a3c] px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                  {ocupado === "orion" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Gerar parecer
                </button>
              </div>
              {parecer && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{parecer}</p>}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">⚠ Campanhas em risco</h3>
                {!((dash?.em_risco || []) as any[]).length ? (
                  <p className="py-4 text-center text-sm text-zinc-400">Nenhuma campanha em risco.</p>
                ) : ((dash?.em_risco || []) as any[]).map((r: any) => (
                  <p key={r.id} className="text-xs text-zinc-600">• <b>{r.nome}</b> — {r.motivo}</p>
                ))}
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Motor de Publicação (campaign_ai)</h3>
                <p className="text-xs text-zinc-600">{JSON.stringify(dash?.motor || {})}</p>
                <h3 className="mb-1 mt-3 text-sm font-black text-zinc-700">🏆 Ranking CTR</h3>
                {!((dash?.ranking_ctr || []) as any[]).length ? (
                  <p className="text-xs text-zinc-400">Sem métricas ainda (aguardando GLM/Dispatcher).</p>
                ) : ((dash?.ranking_ctr || []) as any[]).map((r: any, i: number) => (
                  <p key={i} className="text-xs text-zinc-600">{i + 1}. {r.nome} — CTR {r.ctr}%</p>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 flex items-center gap-1 text-sm font-black text-zinc-700"><Map className="h-4 w-4" /> Oportunidades de expansão</h3>
              {!((dash?.expansao?.cidades_sem_grupos || []) as any[]).length ? (
                <p className="text-sm text-zinc-400">Todas as cidades com anúncios têm grupos ativos. ✅</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {((dash?.expansao?.cidades_sem_grupos || []) as any[]).map((c: any) => (
                      <span key={c.cidade} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                        📍 {c.cidade} ({c.anuncios} anúncio{c.anuncios > 1 ? "s" : ""}, 0 grupos)
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-400">{dash?.expansao?.recomendacao}</p>
                </>
              )}
            </div>

            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Eventos recentes</h3>
              {((dash?.eventos || []) as any[]).map((e: any, i: number) => (
                <p key={i} className="text-[11px] text-zinc-500">
                  <b className="text-zinc-700">{e.tipo}</b> · {new Date(e.quando).toLocaleString("pt-BR")}
                </p>
              ))}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Campaign AI v1.0 · ORION-AI-05 · Publisher → RIDV → Package → Campaign → Motor → Dispatcher M54 → GLM ·
          grupos sempre da cidade do anúncio · a ORION recomenda, o humano decide
        </p>
      </div>
    </div>
  );
}
