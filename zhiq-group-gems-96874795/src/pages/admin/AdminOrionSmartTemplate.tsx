/**
 * /admin/orion-smart-template — ORION Smart Template AI (ORION-AI-62)
 *
 * Biblioteca inteligente de templates: recomenda o layout ideal por
 * segmento/objetivo/rede RESPEITANDO a Brand Identity AI (nunca sugere
 * estilo incompativel). Ranking sobe por uso/conversao REAIS. Gerencia
 * DEFINICOES de template; a renderizacao final e do Design Studio AI.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { LayoutTemplate, Loader2, Sparkles, Library, Wand2, Trophy, Search, Play } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};
const NIVEL: Record<string, string> = {
  gratuito: "bg-slate-100 text-slate-500", premium: "bg-amber-100 text-amber-700",
  oficial: "bg-sky-100 text-sky-700", exclusivo: "bg-purple-100 text-purple-700",
  patrocinado: "bg-emerald-100 text-emerald-700", ia: "bg-fuchsia-100 text-fuchsia-700",
};
type Aba = "dashboard" | "biblioteca" | "recomendar" | "ranking";
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
    <h3 className="mb-2 text-sm font-black text-zinc-700">{title}</h3>{children}
  </div>
);

export default function AdminOrionSmartTemplate() {
  const [aba, setAba] = useState<Aba>("dashboard");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");
  const [msg, setMsg] = useState("");
  const [seg, setSeg] = useState("restaurantes");
  const [obj, setObj] = useState("promocao");
  const [rede, setRede] = useState("instagram");
  const [rec, setRec] = useState<any>(null);
  const [busca, setBusca] = useState("");

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-smart-template"], queryFn: () => rpc("template_dashboard"), refetchInterval: 60000,
  });
  const kpis = dash?.kpis || {};
  const porSeg = dash?.por_segmento || {};
  const porTipo = dash?.por_tipo || {};
  const porNivel = dash?.por_nivel || {};
  const ranking = (dash?.ranking || []) as any[];
  const segmentos = (dash?.segmentos || []) as any[];
  const objetivos = (dash?.objetivos || []) as any[];
  const formatos = (dash?.formatos || []) as any[];
  const biblioteca = ranking.filter((t) => !busca || String(t.nome).toLowerCase().includes(busca.toLowerCase()));
  const redes = Array.from(new Set(formatos.map((f) => f.rede)));

  const narrar = async (promptKey: string, rotulo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("template_summary");
      const r = await orionAiText("smart_template", `Pedido: ${rotulo}\nBiblioteca: ${JSON.stringify(ctx)}`, { promptKey, maxTokens: 700 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponivel (${r.error}).`);
    } finally { setOcupado(false); }
  };
  const recomendar = async () => {
    setOcupado(true); setRec(null); setMsg("");
    try { const r = await rpc("recommend_template", { p_ctx: { segmento: seg, objetivo: obj, rede } }); setRec(r); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); } finally { setOcupado(false); }
  };
  const ranquear = async () => {
    setOcupado(true); setMsg("");
    try { const r = await rpc("run_template_ranking", { p_trace: `painel_${Date.now()}` }); setMsg(`✓ Ranking atualizado · ${r.templates} templates · TPS ${r.tps}.`); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); } finally { setOcupado(false); }
  };

  const TABS: [Aba, any, string][] = [
    ["dashboard", Sparkles, "Dashboard"], ["biblioteca", Library, "Biblioteca"],
    ["recomendar", Wand2, "Recomendar"], ["ranking", Trophy, "Ranking"],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
        <div className="rounded-3xl bg-gradient-to-r from-[#1a0a24] via-[#a21caf] to-[#1a0a24] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <LayoutTemplate className="h-8 w-8 text-fuchsia-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">ORION Smart Template AI</h1>
                <span className="rounded-full bg-fuchsia-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ring-fuchsia-300/40">Template</span>
              </div>
              <p className="text-sm text-fuchsia-200/80">
                ORION-AI-62 · biblioteca inteligente · recomenda respeitando a Brand Identity · ranking por conversao real
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-200/70">Template Score (TPS)</p>
              <p className="text-3xl font-black">{kpis.tps ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Templates", kpis.total], ["Ativos", kpis.ativos], ["Premium", kpis.premium],
              ["Usos", kpis.usos], ["Conversoes", kpis.conversoes], ["Creative (CVS)", kpis.cvs]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-fuchsia-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {TABS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#a21caf] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
          <button onClick={ranquear} disabled={ocupado}
            className="ml-auto flex items-center gap-2 rounded-full bg-fuchsia-700 px-4 py-2 text-sm font-black text-white shadow hover:bg-fuchsia-800 disabled:opacity-50">
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Atualizar ranking
          </button>
        </div>
        {msg && <p className="mt-2 text-[12px] font-bold text-zinc-600">{msg}</p>}
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-fuchsia-600" /></div>}

        {aba === "dashboard" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-fuchsia-200 bg-fuchsia-50/40 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["template.summary", "Resumo da biblioteca"], ["template.analyze", "Analisar ranking"],
                  ["template.recommend", "Boas praticas"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l)} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-fuchsia-200 hover:bg-fuchsia-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-fuchsia-100">{narrativa}</p>}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Card title="Por segmento"><div className="flex flex-wrap gap-1">
                {Object.entries(porSeg as Record<string, any>).map(([k, v]) => <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{k}: {String(v)}</span>)}
              </div></Card>
              <Card title="Por tipo"><div className="flex flex-wrap gap-1">
                {Object.entries(porTipo as Record<string, any>).map(([k, v]) => <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{k}: {String(v)}</span>)}
              </div></Card>
              <Card title="Por nivel"><div className="flex flex-wrap gap-1">
                {Object.entries(porNivel as Record<string, any>).map(([k, v]) => <span key={k} className={`rounded-full px-2 py-0.5 text-[10px] font-black ${NIVEL[k] || ""}`}>{k}: {String(v)}</span>)}
              </div></Card>
            </div>
            <Card title="Catalogo de dominio">
              <p className="text-xs text-zinc-600"><b>{segmentos.length}</b> segmentos · <b>{objetivos.length}</b> objetivos · <b>{formatos.length}</b> formatos ({redes.length} redes)</p>
              <p className="mt-1 text-[11px] text-zinc-400">Aprendizado continuo: o score sobe pela conversao real (uso comeca vazio no pre-lancamento — DECLARADO). Renderizacao = Design Studio AI.</p>
            </Card>
          </div>
        )}

        {aba === "biblioteca" && !isLoading && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 ring-1 ring-zinc-200">
              <Search className="h-4 w-4 text-zinc-400" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar template…" className="w-full bg-transparent text-sm outline-none" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {biblioteca.map((t: any) => (
                <div key={t.template_id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${NIVEL[t.nivel] || ""}`}>{t.nivel}</span>
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{t.tipo}</span>
                    <span className="ml-auto rounded-full bg-fuchsia-600 px-2 py-0.5 text-[10px] font-black text-white">score {t.score}</span>
                  </div>
                  <p className="text-sm font-black text-zinc-800">{t.nome}</p>
                  <p className="text-[11px] text-zinc-500">{t.segmento || "universal"} · {t.objetivo || "geral"}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {aba === "recomendar" && !isLoading && (
          <div className="mt-4 space-y-4">
            <Card title="Recomendar template (respeita a Brand Identity)">
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs font-bold text-zinc-600">Segmento
                  <select value={seg} onChange={(e) => setSeg(e.target.value)} className="mt-1 block rounded-2xl border border-zinc-200 px-3 py-2 text-sm">
                    {segmentos.map((s: any) => <option key={s.segmento} value={s.segmento}>{s.icone} {s.segmento}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-zinc-600">Objetivo
                  <select value={obj} onChange={(e) => setObj(e.target.value)} className="mt-1 block rounded-2xl border border-zinc-200 px-3 py-2 text-sm">
                    {objetivos.map((o: any) => <option key={o.objetivo} value={o.objetivo}>{o.objetivo}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-zinc-600">Rede
                  <select value={rede} onChange={(e) => setRede(e.target.value)} className="mt-1 block rounded-2xl border border-zinc-200 px-3 py-2 text-sm">
                    {redes.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <button onClick={recomendar} disabled={ocupado} className="rounded-full bg-fuchsia-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Recomendar</button>
              </div>
              {rec?.template && (
                <div className="mt-3 rounded-2xl bg-fuchsia-50 p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-fuchsia-800">{rec.template.nome}</span>
                    <span className="rounded-full bg-fuchsia-600 px-2 py-0.5 text-[10px] font-black text-white">confianca {rec.confianca}%</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-600">{rec.motivo}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">Brand: {rec.brand_compat}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(rec.template.componentes || []).map((c: string) => <span key={c} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-fuchsia-700 ring-1 ring-fuchsia-200">{c}</span>)}
                  </div>
                  <div className="mt-2 flex gap-1">
                    {(rec.template.cores || []).map((c: string) => <span key={c} className="h-6 w-6 rounded-full ring-1 ring-zinc-200" style={{ backgroundColor: c }} title={c} />)}
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {aba === "ranking" && !isLoading && (
          <div className="mt-4 space-y-2">
            {ranking.map((t: any, i: number) => (
              <div key={t.template_id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 bg-white p-3 text-sm shadow-sm">
                <span className="w-6 text-center font-black text-zinc-400">#{i + 1}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${NIVEL[t.nivel] || ""}`}>{t.nivel}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-zinc-700">{t.nome}</span>
                <span className="text-[10px] text-zinc-400">{t.segmento || "universal"}</span>
                <span className="text-[10px] text-zinc-400">base {t.base_score}</span>
                <span className="rounded-full bg-fuchsia-600 px-2.5 py-1 text-[10px] font-black text-white">{t.score}</span>
              </div>
            ))}
            <p className="text-[11px] text-zinc-400">Score = qualidade curada (base) + boost por conversao real. Suite: <code className="rounded bg-zinc-100 px-1">SELECT orion_tpl_selftest()</code> — 6 checks (COMANDO TESTE).</p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Smart Template AI v1.0 · ORION-AI-62 · biblioteca inteligente · recomenda respeitando a Brand Identity · adapta multi-formato ·
          ranking por conversao real · versoes imutaveis (anti-exclusao) · renderizacao delegada ao Design Studio AI · tick 30 min · IA so via Gateway
        </p>
      </div>
    </div>
  );
}
