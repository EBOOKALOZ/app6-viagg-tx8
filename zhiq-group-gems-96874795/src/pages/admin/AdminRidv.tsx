/**
 * /admin/ridv — RIDV AI V2.0 (ORION-AI-02) — Central de Moderação Inteligente
 *
 * Dashboard em tempo real da moderação obrigatória: fila pendente com
 * decisão humana (aprovar / rejeitar / reanalisar), histórico auditado
 * com filtros e busca, indicadores (taxas, motivos, categorias, cidades,
 * tempo médio, uso da IA) e disparo manual do worker.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ShieldCheck, Loader2, RefreshCw, CheckCircle2, XCircle, RotateCcw,
  Gavel, History, BarChart3, Search, Ban, Eye, Zap,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, Tooltip, Legend,
} from "recharts";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const TABELA_INFO: Record<string, { label: string; emoji: string }> = {
  real_estate_listings: { label: "Imóveis",   emoji: "🏠" },
  vehicle_listings:     { label: "Veículos",  emoji: "🚗" },
  travel_listings:      { label: "Viagens",   emoji: "✈️" },
  freight_listings:     { label: "Fretes",    emoji: "🚚" },
  service_listings:     { label: "Serviços",  emoji: "🛠️" },
  product_listings:     { label: "Produtos",  emoji: "🛍️" },
  advertiser_listings:  { label: "Anúncios",  emoji: "📦" },
  marketplace_products: { label: "Mercado",   emoji: "🛒" },
  auction_listings:     { label: "Leilões",   emoji: "🔨" },
};

const STATUS_LOG: Record<string, { label: string; cls: string }> = {
  approved:      { label: "Aprovado",       cls: "bg-emerald-100 text-emerald-700" },
  blocked:       { label: "Bloqueado",      cls: "bg-red-100 text-red-700" },
  manual_review: { label: "Revisão manual", cls: "bg-amber-100 text-amber-700" },
};

type Aba = "fila" | "historico" | "indicadores";

export default function AdminRidv() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("fila");
  const [fStatus, setFStatus] = useState("");
  const [fCategoria, setFCategoria] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");

  const { data: dash } = useQuery({
    queryKey: ["ridv-dash"], queryFn: () => rpc("ridv_dashboard"), refetchInterval: 30000,
  });
  const fila = ((dash?.pendentes_agora || []) as any[]);

  const { data: historico, isLoading: histLoading } = useQuery({
    queryKey: ["ridv-hist", fStatus, fCategoria, buscaAtiva],
    queryFn: () => rpc("ridv_historico", {
      p_status: fStatus || null, p_categoria: fCategoria || null,
      p_busca: buscaAtiva || null, p_limite: 80,
    }),
    refetchInterval: 30000,
  });

  const [decidindo, setDecidindo] = useState("");
  const decidir = async (item: any, acao: "aprovar" | "rejeitar" | "reanalisar") => {
    let motivo: string | null = null;
    if (acao === "rejeitar") {
      motivo = window.prompt("Motivo da rejeição (o anunciante poderá vê-lo):");
      if (!motivo) return;
    }
    setDecidindo(item.id);
    try {
      if (acao === "reanalisar") {
        await rpc("ridv_reprocessar", { p_tabela: item.tabela, p_id: item.id });
      } else {
        await rpc("ridv_manual_review", {
          p_tabela: item.tabela, p_id: item.id, p_decisao: acao, p_motivo: motivo,
        });
      }
      qc.invalidateQueries({ queryKey: ["ridv-dash"] });
      qc.invalidateQueries({ queryKey: ["ridv-hist"] });
    } catch (e: any) { alert("Erro: " + e.message); }
    finally { setDecidindo(""); }
  };

  const [processando, setProcessando] = useState(false);
  const processarFila = async () => {
    setProcessando(true);
    try {
      const { data, error } = await supabase.functions.invoke("ridv-worker", { body: {} });
      if (error) throw new Error(error.message);
      qc.invalidateQueries({ queryKey: ["ridv-dash"] });
      qc.invalidateQueries({ queryKey: ["ridv-hist"] });
      alert(`Worker executado: ${data?.processados ?? 0} anúncio(s) processado(s)` +
        (data?.ia_disponivel === false ? " — IA indisponível, encaminhados para revisão manual." : "."));
    } catch (e: any) { alert("Erro: " + e.message); }
    finally { setProcessando(false); }
  };

  const st30 = (dash?.por_status_30d || {}) as Record<string, number>;
  const tot30 = (st30.approved || 0) + (st30.blocked || 0) + (st30.manual_review || 0);
  const pct = (n?: number) => (tot30 ? Math.round(((n || 0) * 100) / tot30) : 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* Header */}
        <div className="rounded-3xl bg-gradient-to-r from-[#2b0a3d] via-[#4a1a63] to-[#2b0a3d] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <ShieldCheck className="h-8 w-8 text-fuchsia-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">RIDV AI — Moderação Inteligente</h1>
              <p className="text-sm text-fuchsia-200/80">
                ORION-AI-02 · nenhum anúncio entra no ar sem passar por aqui
                {dash?.atualizado_em ? ` · atualizado ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <button onClick={processarFila} disabled={processando}
              className="flex items-center gap-2 rounded-xl bg-fuchsia-400 px-4 py-2.5 text-sm font-black text-[#2b0a3d] hover:brightness-110 disabled:opacity-50">
              {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Processar fila agora
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Pendentes agora", fila.length, Gavel],
              ["Decisões hoje", dash?.decisoes_hoje, Eye],
              ["Decisões (total)", dash?.decisoes_total, History],
              ["Aprovação 30d", `${pct(st30.approved)}%`, CheckCircle2],
              ["Bloqueio 30d", `${pct(st30.blocked)}%`, Ban],
              ["Tempo médio IA", dash?.tempo_medio_ms ? `${dash.tempo_medio_ms}ms` : "—", Zap],
            ].map(([l, v, Icon]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
                <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-fuchsia-200/70">
                  {Icon && <Icon className="h-3 w-3" />} {l}
                </p>
                <p className="text-xl font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Abas */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([
            ["fila", Gavel, `Fila de Revisão${fila.length ? ` (${fila.length})` : ""}`],
            ["historico", History, "Histórico Auditado"],
            ["indicadores", BarChart3, "Indicadores"],
          ] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#4a1a63] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {/* FILA */}
        {aba === "fila" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs text-zinc-400">
              Anúncios aguardando decisão. A IA processa automaticamente ao publicar; caem aqui os
              ambíguos e os casos em que a IA está indisponível. Enquanto pendentes, <strong>não aparecem
              ao público</strong>. Toda decisão é auditada (autor, data, motivo).
            </p>
            {!fila.length ? (
              <div className="p-10 text-center text-zinc-400">🎉 Nenhum anúncio aguardando revisão.</div>
            ) : (
              <div className="space-y-2">
                {fila.map((item: any) => {
                  const info = TABELA_INFO[item.tabela] || { label: item.tabela, emoji: "📦" };
                  const ocupado = decidindo === item.id;
                  return (
                    <div key={`${item.tabela}-${item.id}`} className="rounded-2xl border border-zinc-100 p-3 hover:bg-slate-50/60">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg">{info.emoji}</span>
                        <p className="min-w-0 flex-1 truncate font-bold">{item.titulo || "(sem título)"}</p>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${item.status === "manual_review" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>
                          {item.status === "manual_review" ? "Revisão manual" : "Aguardando IA"}
                        </span>
                        <button onClick={() => decidir(item, "aprovar")} disabled={ocupado}
                          className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:brightness-110 disabled:opacity-50">
                          {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Aprovar
                        </button>
                        <button onClick={() => decidir(item, "rejeitar")} disabled={ocupado}
                          className="flex items-center gap-1 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-black text-white hover:brightness-110 disabled:opacity-50">
                          <XCircle className="h-3.5 w-3.5" /> Rejeitar
                        </button>
                        <button onClick={() => decidir(item, "reanalisar")} disabled={ocupado}
                          title="Devolver para análise da IA"
                          className="flex items-center gap-1 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-black text-white hover:brightness-110 disabled:opacity-50">
                          <RotateCcw className="h-3.5 w-3.5" /> Reanalisar
                        </button>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                        <span>{info.label}</span>
                        {item.cidade && <span>· 📍 {item.cidade}</span>}
                        {item.criado_em && <span>· {new Date(item.criado_em).toLocaleString("pt-BR")}</span>}
                      </div>
                      {item.motivo && <p className="mt-1.5 text-xs font-medium text-amber-700">• {item.motivo}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* HISTÓRICO */}
        {aba === "historico" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}
                className="h-9 rounded-xl border border-zinc-200 bg-white px-2 text-sm font-semibold">
                <option value="">Todos os status</option>
                <option value="approved">Aprovados</option>
                <option value="blocked">Bloqueados</option>
                <option value="manual_review">Revisão manual</option>
              </select>
              <select value={fCategoria} onChange={(e) => setFCategoria(e.target.value)}
                className="h-9 rounded-xl border border-zinc-200 bg-white px-2 text-sm font-semibold">
                <option value="">Todas as categorias</option>
                {["real_estate", "vehicle", "travel", "freight", "service", "product", "auction", "reanalise"].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <div className="flex flex-1 items-center gap-1">
                <input value={busca} onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setBuscaAtiva(busca)}
                  placeholder="Buscar por motivo, cidade, título ou ID do anúncio…"
                  className="h-9 min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 text-sm" />
                <button onClick={() => setBuscaAtiva(busca)}
                  className="flex h-9 items-center gap-1 rounded-xl bg-[#4a1a63] px-3 text-xs font-black text-white">
                  <Search className="h-3.5 w-3.5" /> Buscar
                </button>
              </div>
            </div>
            {histLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-fuchsia-500" /></div>
            ) : !((historico || []) as any[]).length ? (
              <div className="p-10 text-center text-zinc-400">Nenhuma decisão encontrada com esses filtros.</div>
            ) : (
              <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
                {((historico || []) as any[]).map((h: any) => {
                  const badge = STATUS_LOG[h.status] || { label: h.status, cls: "bg-zinc-100 text-zinc-500" };
                  const info = h.tabela ? (TABELA_INFO[h.tabela] || { label: h.tabela, emoji: "📦" }) : null;
                  return (
                    <div key={h.id} className="rounded-2xl border border-zinc-100 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${badge.cls}`}>{badge.label}</span>
                        {info && <span className="text-sm">{info.emoji} <b>{info.label}</b></span>}
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{h.categoria}</span>
                        {h.confianca != null && (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700">
                            confiança {Math.round(Number(h.confianca))}%
                          </span>
                        )}
                        {h.tempo_ms && <span className="text-[10px] text-zinc-400">{h.tempo_ms}ms</span>}
                        <span className="ml-auto text-[11px] text-zinc-400">{new Date(h.criado_em).toLocaleString("pt-BR")}</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-600">{h.motivo}</p>
                      <p className="mt-0.5 text-[10px] text-zinc-400">
                        IA: {h.ia || "—"} · veredito: {h.verdict || "—"}
                        {h.cidade ? ` · 📍 ${h.cidade}` : ""}
                        {h.revisor ? " · decidido por administrador" : ""}
                        {" · análise "}{String(h.id).slice(0, 8)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* INDICADORES */}
        {aba === "indicadores" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Decisões por dia (14 dias)</h3>
              {!((dash?.por_dia_14d || []) as any[]).length ? (
                <p className="p-6 text-center text-sm text-zinc-400">Sem decisões no período.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={(dash?.por_dia_14d || []).map((d: any) => ({
                      ...d, dia: new Date(d.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
                    }))}>
                      <XAxis dataKey="dia" fontSize={11} />
                      <YAxis allowDecimals={false} fontSize={11} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="aprovados" name="Aprovados" stackId="a" fill="#059669" />
                      <Bar dataKey="revisao" name="Revisão" stackId="a" fill="#d97706" />
                      <Bar dataKey="bloqueados" name="Bloqueados" stackId="a" fill="#dc2626" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {[
                ["Motivos mais frequentes", dash?.top_motivos, (x: any) => x.motivo, (x: any) => x.n],
                ["Categorias mais rejeitadas", dash?.top_categorias_rejeitadas, (x: any) => x.categoria, (x: any) => x.n],
                ["Cidades com mais rejeição", dash?.top_cidades_rejeicao, (x: any) => x.cidade, (x: any) => x.n],
                ["Uso da IA por provedor", Object.entries((dash?.uso_ia || {}) as Record<string, number>).map(([k, v]) => ({ k, v })), (x: any) => x.k, (x: any) => x.v],
              ].map(([titulo, lista, fLabel, fN]: any) => (
                <div key={titulo} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                  <h3 className="mb-2 text-sm font-black text-zinc-700">{titulo}</h3>
                  {!((lista || []) as any[]).length ? (
                    <p className="py-4 text-center text-sm text-zinc-400">Sem dados ainda.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {(lista as any[]).map((x, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs">
                          <span className="min-w-0 flex-1 truncate text-zinc-600">{fLabel(x)}</span>
                          <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 font-black text-fuchsia-700">{fN(x)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Volume por mês (6 meses)</h3>
              <div className="flex flex-wrap gap-2">
                {((dash?.por_mes_6m || []) as any[]).map((m: any) => (
                  <span key={m.mes} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-zinc-600">
                    {m.mes}: <b>{m.n}</b>
                  </span>
                ))}
                {!((dash?.por_mes_6m || []) as any[]).length && (
                  <p className="text-sm text-zinc-400">Sem dados ainda.</p>
                )}
              </div>
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          RIDV AI V2.0 · ORION-AI-02 · pipeline automático: publicar → Publisher AI → RIDV (texto+imagem) → no ar
          · decisões auditadas em ridv_decisions_log · fail-safe: IA indisponível ⇒ revisão manual
        </p>
      </div>
    </div>
  );
}
