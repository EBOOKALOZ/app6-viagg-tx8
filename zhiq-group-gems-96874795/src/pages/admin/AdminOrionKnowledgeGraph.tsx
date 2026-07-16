/**
 * /admin/orion-knowledge-graph — ORION Knowledge Graph AI (ORION-AI-34)
 *
 * O coração semântico: constrói um grafo de entidades e relações reutilizando
 * SÓ dados reais. Toda relação tem evidência (origem/destino/tipo/confiança/
 * evidência). VIAGG Knowledge Index (VKI) classifica cada entidade
 * (💎 Expert / 🥇 Muito / 🥈 Bem / 🥉 Pouco conectada). Read-only — nunca altera o marketplace.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Share2, Loader2, Sparkles, Boxes, GitBranch, PieChart, AlertTriangle, ListChecks } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const vkiColor = (s: number) => s >= 85 ? "text-fuchsia-300" : s >= 70 ? "text-amber-300" : s >= 50 ? "text-slate-200" : "text-orange-300";
const CLASSE: Record<string, string> = {
  expert: "bg-fuchsia-100 text-fuchsia-800", muito: "bg-amber-100 text-amber-800",
  bem: "bg-slate-200 text-slate-700", pouco: "bg-orange-100 text-orange-700",
};
const CLASSE_EMOJI: Record<string, string> = { expert: "💎", muito: "🥇", bem: "🥈", pouco: "🥉" };
const CLASSE_LABEL: Record<string, string> = { expert: "Expertamente conectada", muito: "Muito conectada", bem: "Bem conectada", pouco: "Pouco conectada" };
const TIPO_EMOJI: Record<string, string> = { anuncio: "📦", produto: "🏷️", categoria: "🗂️", cidade: "🏙️", estado: "🗺️", loja: "🏪", lojista: "🧑‍💼" };

type Aba = "resumo" | "entidades" | "relacoes" | "cobertura" | "lacunas" | "recomendacoes";

export default function AdminOrionKnowledgeGraph() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");
  const [sel, setSel] = useState<any>(null);
  const [rel, setRel] = useState<any>(null);

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-kg"], queryFn: () => rpc("knowledge_dashboard"), refetchInterval: 60000,
  });
  const { data: entidades = [] } = useQuery({
    queryKey: ["orion-kg-entities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orion_knowledge_entities").select("*")
        .order("dia", { ascending: false }).order("vki", { ascending: false }).limit(500);
      if (error) throw new Error(error.message);
      const ultimo = (data || []).map((r: any) => r.dia).sort().reverse()[0];
      return (data || []).filter((r: any) => r.dia === ultimo).sort((a: any, b: any) => b.vki - a.vki);
    },
  });
  const { data: relacoes = [] } = useQuery({
    queryKey: ["orion-kg-relations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orion_knowledge_relations").select("*")
        .order("dia", { ascending: false }).order("confianca", { ascending: false }).limit(500);
      if (error) throw new Error(error.message);
      const ultimo = (data || []).map((r: any) => r.dia).sort().reverse()[0];
      return (data || []).filter((r: any) => r.dia === ultimo);
    },
  });

  const score = dash?.score || {};
  const analytics = dash?.analytics || {};
  const gaps = dash?.gaps || {};
  const recs = dash?.recommendations || {};
  const dist = score.distribuicao || {};
  const porTipo = analytics.entidades_por_tipo || {};

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("knowledge_summary");
      const r = await orionAiText("knowledge_graph", `Tipo: ${tipo}\nEstado do grafo: ${JSON.stringify(ctx)}`, { promptKey, maxTokens: 700 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const verRelacoes = async (e: any) => {
    if (sel?.entity_key === e.entity_key) { setSel(null); setRel(null); return; }
    setSel(e); setRel(null);
    setRel(await rpc("knowledge_related", { p_entity_key: e.entity_key }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER — VKI Ecosystem */}
        <div className="rounded-3xl bg-gradient-to-r from-[#1a0b2e] via-[#3b1e5e] to-[#1a0b2e] p-6 text-white shadow-xl ring-1 ring-fuchsia-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-fuchsia-500/10 ring-1 ring-fuchsia-500/30">
              <Share2 className="h-8 w-8 text-fuchsia-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Knowledge Graph AI</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-34 · coração semântico · só relações com evidência, nunca inventa
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-fuchsia-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-200/70">VIAGG Knowledge Index</p>
              <p className={`text-4xl font-black ${vkiColor(score.vki_ecosystem)}`}>{score.vki_ecosystem ?? "—"}</p>
              <p className="text-[11px] font-bold text-fuchsia-200/80">{score.entidades ?? 0} entidades · {score.relacoes ?? 0} relações</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["KG Score méd.", score.knowledge_graph_score_medio], ["Órfãs", score.orfas],
              ["💎 Expert", dist.expert], ["🥇 Muito", dist.muito], ["🥈 Bem", dist.bem], ["🥉 Pouco", dist.pouco]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Sparkles, "Visão Geral"], ["entidades", Boxes, `Entidades${entidades.length ? ` (${entidades.length})` : ""}`],
             ["relacoes", GitBranch, `Relações${relacoes.length ? ` (${relacoes.length})` : ""}`], ["cobertura", PieChart, "Cobertura"],
             ["lacunas", AlertTriangle, "Lacunas"], ["recomendacoes", ListChecks, "Recomendações"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#3b1e5e] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-fuchsia-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["knowledge.summary", "Resumo IA"], ["knowledge.analytics", "Analytics"], ["knowledge.recommendations", "Recomendações"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-slate-100">{narrativa}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Entidades por tipo</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(porTipo).map(([t, n]: any) => (
                  <span key={t} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">{TIPO_EMOJI[t] || "•"} {t}: {n}</span>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-zinc-400">Grau médio de conectividade: {analytics.grau_medio ?? 0} · pouco conectadas: {analytics.pouco_conectadas ?? 0}</p>
            </div>
          </div>
        )}

        {/* ENTIDADES */}
        {aba === "entidades" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!entidades.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">Sem entidades. O motor roda de hora em hora (tick :15).</div>
            ) : entidades.map((e: any) => (
              <div key={e.entity_key} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${CLASSE[e.classificacao] || "bg-zinc-100 text-zinc-600"}`}>{CLASSE_EMOJI[e.classificacao]} {CLASSE_LABEL[e.classificacao]}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{TIPO_EMOJI[e.entity_type]} {e.entity_type}</span>
                  <p className="min-w-0 flex-1 truncate font-black text-zinc-800">{e.rotulo || e.entity_key}</p>
                  <span className="rounded-2xl bg-[#3b1e5e] px-3 py-1 text-sm font-black text-white">VKI {e.vki}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {[["grau", e.grau], ["KG", e.kg_score], ["qualidade", e.entity_quality_score], ["Discovery", e.discovery_score], ["GEO", e.geo_score]].map(([l, v]: any) => (
                    (v > 0 || l === "grau" || l === "KG") && <span key={l} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{l}: {v}</span>
                  ))}
                </div>
                <button onClick={() => verRelacoes(e)} className="mt-2 text-[11px] font-bold text-fuchsia-700 hover:underline">
                  {sel?.entity_key === e.entity_key ? "▲ ocultar relações" : `▼ ver relações (grau ${e.grau})`}
                </button>
                {sel?.entity_key === e.entity_key && (
                  <div className="mt-2 space-y-1">
                    {!rel ? <Loader2 className="h-4 w-4 animate-spin text-fuchsia-500" /> :
                      (rel.relacoes || []).length === 0 ? <p className="text-[11px] text-zinc-400">Entidade órfã — sem relações.</p> :
                      (rel.relacoes || []).map((r: any, i: number) => (
                        <div key={i} className="rounded-2xl bg-fuchsia-50/60 p-2 ring-1 ring-fuchsia-100">
                          <p className="text-[11px] font-bold text-fuchsia-800">{r.tipo} → {r.rotulo || r.destino} <span className="font-normal text-fuchsia-500">(conf. {r.confianca})</span></p>
                          <p className="text-[10px] text-zinc-500">evidência: {r.evidencia}</p>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* RELAÇÕES */}
        {aba === "relacoes" && !isLoading && (
          <div className="mt-4 space-y-1.5">
            <p className="text-xs text-zinc-500">Toda relação carrega evidência real — nenhuma ligação artificial.</p>
            {relacoes.map((r: any) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{r.tipo}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-700">{r.origem_key} → {r.destino_key}</span>
                <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-black text-fuchsia-700">conf. {r.confianca}</span>
                <span className="w-full text-[10px] text-zinc-400">evidência: {r.evidencia}</span>
              </div>
            ))}
          </div>
        )}

        {/* COBERTURA */}
        {aba === "cobertura" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🗂️ Categorias mais conectadas</h3>
              {(analytics.categorias_mais_conectadas || []).map((c: any, i: number) => (
                <div key={i} className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{c.categoria}</span>
                  <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-black text-fuchsia-700">grau {c.grau}</span>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🏙️ Cidades (concentração)</h3>
              {(analytics.cidades_concentracao || []).map((c: any, i: number) => (
                <div key={i} className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{c.cidade}</span>
                  <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-black text-fuchsia-700">grau {c.grau}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LACUNAS */}
        {aba === "lacunas" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-orange-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-orange-700">👻 Entidades órfãs (sem relações)</h3>
              {!(gaps.entidades_orfas || []).length ? <p className="text-xs text-zinc-400">Nenhuma órfã 🎉</p> :
                (gaps.entidades_orfas || []).map((o: any, i: number) => (
                  <div key={i} className="mb-1 flex items-center gap-2">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{TIPO_EMOJI[o.tipo]} {o.tipo}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{o.entidade}</span>
                  </div>
                ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[["Anúncios sem categoria", gaps.anuncios_sem_categoria], ["Produtos (sem categoria estruturada)", gaps.produtos_sem_categoria]].map(([l, v]: any) => (
                <div key={l} className="rounded-2xl border border-zinc-100 bg-white p-3 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-2xl font-black text-zinc-800">{v ?? 0}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-amber-50 p-3 text-[11px] text-amber-700">
              ⚠ {gaps.nota_estado_listings}<br />⚠ {gaps.nota_leiloes}
            </div>
          </div>
        )}

        {/* RECOMENDAÇÕES */}
        {aba === "recomendacoes" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">🔗 Relações a fortalecer ({recs.total_pouco_conectadas ?? 0} pouco conectadas)</h3>
            <div className="space-y-1.5">
              {(recs.fortalecer || []).map((r: any, i: number) => (
                <div key={i} className="rounded-2xl bg-slate-50 p-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{TIPO_EMOJI[r.tipo]} {r.tipo}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">{r.entidade}</span>
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-700">grau {r.grau} · VKI {r.vki}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-fuchsia-700">→ {r.acao}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Knowledge Graph AI v1.0 · ORION-AI-34 · VIAGG Knowledge Index + entidades/relações com evidência ·
          read-only · descobre relações, nunca inventa · tick :15 · reusa AI-32/AI-33 · IA só via Gateway
        </p>
      </div>
    </div>
  );
}
