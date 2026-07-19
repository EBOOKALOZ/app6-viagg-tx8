/**
 * /admin/orion-publisher — ORION Publisher Control (v1.0)
 *
 * Porta oficial de entrada dos anúncios: todo anúncio novo (Mercado,
 * Imóveis, Veículos, Serviços, Fretes, Viagens) passa automaticamente
 * pela validação estrutural + detecção de duplicidade (gatilhos no banco).
 * Aqui o admin acompanha a fila, os erros, o índice de similaridade e o
 * histórico de eventos — e dispara a varredura retroativa.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Inbox, ShieldCheck, CopyX, AlertOctagon, RefreshCw, Loader2, Activity, ListChecks,
  CheckCircle2, XCircle, Gavel,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pronto_moderacao:   { label: "Pronto p/ moderação", cls: "bg-emerald-100 text-emerald-700" },
  erro_validacao:     { label: "Erro de validação",   cls: "bg-red-100 text-red-700" },
  duplicado_suspeito: { label: "Duplicado suspeito",  cls: "bg-amber-100 text-amber-700" },
  recebido:           { label: "Recebido",            cls: "bg-zinc-100 text-zinc-500" },
};

const MODULO_EMOJI: Record<string, string> = {
  mercado: "🛍️", imoveis: "🏠", veiculos: "🚗", servicos: "🛠️", fretes: "🚚", viagens: "✈️",
};

// Fila de revisão manual: tabela do banco → rótulo/emoji
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

type Aba = "fila" | "revisao" | "eventos";

export default function AdminOrionPublisher() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("fila");
  const [filtroStatus, setFiltroStatus] = useState<string>("");

  const { data: painel } = useQuery({
    queryKey: ["pub-painel"], queryFn: () => rpc("orion_publisher_painel"), refetchInterval: 30000,
  });
  const { data: fila, isLoading: filaLoading } = useQuery({
    queryKey: ["pub-fila", filtroStatus],
    queryFn: async () => {
      let q = (supabase.from("orion_publisher_log") as any)
        .select("*").order("processado_em", { ascending: false }).limit(100);
      if (filtroStatus) q = q.eq("status", filtroStatus);
      const { data, error } = await q;
      if (error) throw error; return data as any[];
    },
    refetchInterval: 30000,
  });
  const { data: eventos } = useQuery({
    queryKey: ["pub-eventos"],
    queryFn: async () => {
      const rows = (await rpc("orion_eventos_recentes", { p_limite: 120 })) as any[];
      return (rows || []).filter(e => String(e.tipo).startsWith("anuncio_"));
    },
    refetchInterval: 30000,
  });

  // Fila de revisão manual (anúncios presos aguardando decisão humana)
  const { data: revisao, isLoading: revisaoLoading } = useQuery({
    queryKey: ["ridv-fila-revisao"],
    queryFn: async () => ((await rpc("ridv_fila_revisao")) || []) as any[],
    refetchInterval: 30000,
  });
  const [decidindo, setDecidindo] = useState<string>("");
  const decidir = async (item: any, decisao: "aprovar" | "rejeitar") => {
    let motivo: string | null = null;
    if (decisao === "rejeitar") {
      motivo = window.prompt("Motivo da rejeição (o anunciante poderá vê-lo):");
      if (!motivo) return;
    }
    setDecidindo(item.id);
    try {
      await rpc("ridv_manual_review", {
        p_tabela: item.tabela, p_id: item.id, p_decisao: decisao, p_motivo: motivo,
      });
      qc.invalidateQueries({ queryKey: ["ridv-fila-revisao"] });
    } catch (e: any) { alert("Erro: " + e.message); }
    finally { setDecidindo(""); }
  };

  const [varrendo, setVarrendo] = useState(false);
  const varrer = async () => {
    setVarrendo(true);
    try {
      const n = await rpc("orion_publisher_varredura");
      qc.invalidateQueries({ queryKey: ["pub-painel"] });
      qc.invalidateQueries({ queryKey: ["pub-fila"] });
      alert(`Varredura concluída: ${n} anúncio(s) processado(s).`);
    } catch (e: any) { alert("Erro: " + e.message); }
    finally { setVarrendo(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* Header */}
        <div className="rounded-3xl bg-gradient-to-r from-[#052e2b] via-[#0a4f47] to-[#052e2b] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Inbox className="h-8 w-8 text-teal-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Publisher Control</h1>
              <p className="text-sm text-teal-200/80">
                Porta oficial de entrada dos anúncios — validação automática em 6 módulos
                {painel?.atualizado_em ? ` · atualizado ${painel.atualizado_em}` : ""}
              </p>
            </div>
            <button onClick={varrer} disabled={varrendo}
              className="flex items-center gap-2 rounded-xl bg-teal-400 px-4 py-2.5 text-sm font-black text-[#052e2b] hover:brightness-110 disabled:opacity-50">
              {varrendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Executar varredura
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Processados", painel?.total_processados, ShieldCheck],
              ["Prontos p/ moderação", painel?.prontos_moderacao, ListChecks],
              ["Erros de validação", painel?.erros_validacao, AlertOctagon],
              ["Duplicados suspeitos", painel?.duplicados, CopyX],
              ["Taxa de aprovação", painel?.taxa_aprovacao_pct != null ? `${painel.taxa_aprovacao_pct}%` : "—", null],
              ["Última hora", painel?.ultima_hora, Activity],
            ].map(([l, v, Icon]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
                <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-teal-200/70">
                  {Icon && <Icon className="h-3 w-3" />} {l}
                </p>
                <p className="text-xl font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>

          {/* por módulo */}
          {painel?.por_modulo && (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {Object.entries(painel.por_modulo as Record<string, number>).map(([m, n]) => (
                <span key={m} className="rounded-full bg-white/10 px-2.5 py-1 font-bold ring-1 ring-white/10">
                  {MODULO_EMOJI[m] || "📦"} {m}: {n}
                </span>
              ))}
              {(painel?.por_cidade || []).map((c: any) => (
                <span key={c.cidade} className="rounded-full bg-white/5 px-2.5 py-1 ring-1 ring-white/10">
                  📍 {c.cidade}: {c.n}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Abas */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button onClick={() => setAba("fila")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === "fila" ? "bg-[#0a4f47] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
            <ListChecks className="h-4 w-4" /> Fila & Log
          </button>
          <button onClick={() => setAba("revisao")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === "revisao" ? "bg-[#0a4f47] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
            <Gavel className="h-4 w-4" /> Revisão Manual
            {((revisao || []) as any[]).length > 0 && (
              <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-amber-950">
                {(revisao as any[]).length}
              </span>
            )}
          </button>
          <button onClick={() => setAba("eventos")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === "eventos" ? "bg-[#0a4f47] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
            <Activity className="h-4 w-4" /> Eventos
          </button>
          {aba === "fila" && (
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}
              className="ml-auto h-9 rounded-xl border border-zinc-200 bg-white px-2 text-sm font-semibold">
              <option value="">Todos os status</option>
              <option value="pronto_moderacao">Prontos p/ moderação</option>
              <option value="erro_validacao">Erros de validação</option>
              <option value="duplicado_suspeito">Duplicados suspeitos</option>
            </select>
          )}
        </div>

        {/* FILA & LOG */}
        {aba === "fila" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            {filaLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-500" /></div>
            ) : !((fila || []) as any[]).length ? (
              <div className="p-10 text-center text-zinc-400">Nenhum anúncio no log — execute a varredura.</div>
            ) : (
              <div className="space-y-2">
                {((fila || []) as any[]).map((f: any) => {
                  const badge = STATUS_BADGE[f.status] || STATUS_BADGE.recebido;
                  const probs = (f.problemas || []) as string[];
                  return (
                    <div key={f.id} className="rounded-2xl border border-zinc-100 p-3 hover:bg-slate-50/60">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg">{MODULO_EMOJI[f.modulo] || "📦"}</span>
                        <p className="min-w-0 flex-1 truncate font-bold">{f.titulo || "(sem título)"}</p>
                        {f.similaridade?.pct != null && Number(f.similaridade.pct) > 0 && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${Number(f.similaridade.pct) >= 65 ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-500"}`}>
                            similaridade {f.similaridade.pct}%
                          </span>
                        )}
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${badge.cls}`}>{badge.label}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                        <span>{f.modulo}</span>
                        {f.cidade && <span>· 📍 {f.cidade}</span>}
                        <span>· {new Date(f.processado_em || f.recebido_em).toLocaleString("pt-BR")}</span>
                      </div>
                      {probs.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {probs.map((p, i) => (
                            <li key={i} className="text-xs font-medium text-red-600">• {p}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* REVISÃO MANUAL */}
        {aba === "revisao" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs text-zinc-400">
              Anúncios aguardando decisão humana. Eles caem aqui quando a IA de moderação está
              indisponível (ex.: sem créditos de API) ou pede revisão. Enquanto não forem aprovados,
              <strong> não aparecem</strong> nas vitrines públicas. Toda decisão fica auditada no
              histórico RIDV com autor, data e motivo.
            </p>
            {revisaoLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-500" /></div>
            ) : !((revisao || []) as any[]).length ? (
              <div className="p-10 text-center text-zinc-400">
                🎉 Nenhum anúncio aguardando revisão manual.
              </div>
            ) : (
              <div className="space-y-2">
                {((revisao || []) as any[]).map((item: any) => {
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
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                        <span>{info.label}</span>
                        {item.cidade && <span>· 📍 {item.cidade}</span>}
                        {item.criado_em && <span>· {new Date(item.criado_em).toLocaleString("pt-BR")}</span>}
                      </div>
                      {item.motivo && (
                        <p className="mt-1.5 text-xs font-medium text-amber-700">• {item.motivo}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* EVENTOS */}
        {aba === "eventos" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs text-zinc-400">
              API interna do ecossistema: estes eventos (anuncio_validado, anuncio_reprovado, anuncio_duplicado,
              anuncio_pronto_para_moderacao) ficam no sistema nervoso ORION e serão consumidos pela RIDV AI e pela ORION Campaign AI.
            </p>
            {!((eventos || []) as any[]).length ? (
              <div className="p-10 text-center text-zinc-400">Nenhum evento de anúncio registrado ainda.</div>
            ) : (
              <div className="max-h-[32rem] space-y-1 overflow-y-auto">
                {((eventos || []) as any[]).map((e: any) => (
                  <p key={e.id} className="rounded-lg bg-slate-50 px-3 py-1.5 text-[12px] text-zinc-600">
                    <span className={`font-black ${e.tipo === "anuncio_reprovado" ? "text-red-600" : e.tipo === "anuncio_duplicado" ? "text-amber-600" : "text-emerald-700"}`}>
                      {e.tipo}
                    </span>
                    {" · "}{e.dados?.modulo || e.origem}
                    {e.dados?.similaridade_pct ? ` · sim ${e.dados.similaridade_pct}%` : ""}
                    {" · "}{new Date(e.criado_em).toLocaleString("pt-BR")}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Publisher AI v1.0 · gatilhos automáticos em 6 módulos (INSERT + edição de conteúdo) · handoff para a moderação RIDV integrado (aba Revisão Manual)
        </p>
      </div>
    </div>
  );
}
