/**
 * /admin/orion-os — ORION OS · Centro de Inteligência Operacional (Fase 1)
 *
 *  - Painel Nacional em tempo real (totais + crescimento dia/7d/30d)
 *  - Índice de Cobertura por cidade (Excelente→Crítica, IOD explicável)
 *  - Crescimento 30 dias (gráfico) · Oferta × Demanda (picos, utilização)
 *  - EDITOR MANUAL de diretrizes (versão, autor, aprovação, rollback) —
 *    viram contexto AUTORIZADO da IA ORION
 *  - Eventos Operacionais com vigência (influenciam as análises)
 *  - Pergunte à ORION com rastreabilidade (data, fonte, confiança)
 * O banco da plataforma é a única fonte oficial — nada é duplicado aqui.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionPerguntar, type OrionResposta } from "@/lib/orion/orionCore";
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  Cpu, Brain, Globe2, Gauge, TrendingUp, Scale, BookMarked, CalendarDays,
  Loader2, Send, Check, RotateCcw, Trash2, Plus,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const CLASSE_COB: Record<string, string> = {
  Excelente: "bg-emerald-100 text-emerald-700",
  Boa:       "bg-sky-100 text-sky-700",
  Regular:   "bg-amber-100 text-amber-700",
  Baixa:     "bg-orange-100 text-orange-700",
  Crítica:   "bg-red-100 text-red-700",
};

const TIPOS_DIRETRIZ = ["regra","objetivo","prioridade","campanha","meta","politica","cronograma","acao"];
const TIPOS_EVENTO = ["expansao","promocao","campanha","mudanca_regra","feriado","evento_local","festival","show","esportivo","feira","outro"];

type Aba = "nacional" | "cobertura" | "crescimento" | "oferta" | "diretrizes" | "eventos";

export default function AdminOrionOS() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("nacional");

  /* Pergunte à ORION */
  const [pergunta, setPergunta] = useState("");
  const [pensando, setPensando] = useState(false);
  const [core, setCore] = useState<OrionResposta | null>(null);
  const perguntar = async () => {
    const q = pergunta.trim();
    if (!q || pensando) return;
    setPensando(true); setCore(null);
    try { setCore(await orionPerguntar(q)); }
    catch (e: any) { setCore({ resposta: "⚠️ Falha na análise: " + (e?.message || ""), confianca: 0, motores: [] }); }
    finally { setPensando(false); }
  };

  /* Dados */
  const { data: nac } = useQuery({ queryKey: ["os-nac"], queryFn: () => rpc("orion_os_nacional"), refetchInterval: 60000 });
  const { data: cobertura } = useQuery({ queryKey: ["os-cob"], queryFn: () => rpc("orion_os_cobertura") });
  const { data: cresc } = useQuery({ queryKey: ["os-cresc"], queryFn: () => rpc("orion_os_crescimento") });
  const { data: od } = useQuery({ queryKey: ["os-od"], queryFn: () => rpc("orion_os_oferta_demanda"), refetchInterval: 60000 });
  const { data: diretrizes } = useQuery({
    queryKey: ["os-dir"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("orion_diretrizes") as any)
        .select("*").order("chave").order("versao", { ascending: false });
      if (error) throw error; return data as any[];
    },
  });
  const { data: eventos } = useQuery({
    queryKey: ["os-ev"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("orion_eventos_operacionais") as any)
        .select("*").order("inicio", { ascending: false }).limit(50);
      if (error) throw error; return data as any[];
    },
  });

  /* Editor de diretriz */
  const [dTipo, setDTipo] = useState("regra");
  const [dTitulo, setDTitulo] = useState("");
  const [dConteudo, setDConteudo] = useState("");
  const [dComentario, setDComentario] = useState("");
  const [salvando, setSalvando] = useState(false);
  const salvarDiretriz = async () => {
    if (!dTitulo.trim() || !dConteudo.trim()) return;
    setSalvando(true);
    try {
      await rpc("orion_diretriz_salvar", {
        p_chave: null, p_tipo: dTipo, p_titulo: dTitulo.trim(),
        p_conteudo: dConteudo.trim(), p_comentario: dComentario.trim() || null,
      });
      setDTitulo(""); setDConteudo(""); setDComentario("");
      qc.invalidateQueries({ queryKey: ["os-dir"] });
    } catch (e: any) { alert("Erro: " + e.message); }
    finally { setSalvando(false); }
  };
  const aprovar = async (id: string) => {
    try { await rpc("orion_diretriz_aprovar", { p_id: id }); qc.invalidateQueries({ queryKey: ["os-dir"] }); }
    catch (e: any) { alert("Erro: " + e.message); }
  };
  const rollback = async (chave: string, versao: number) => {
    try { await rpc("orion_diretriz_rollback", { p_chave: chave, p_versao: versao }); qc.invalidateQueries({ queryKey: ["os-dir"] }); }
    catch (e: any) { alert("Erro: " + e.message); }
  };

  /* Novo evento operacional */
  const [ev, setEv] = useState({ tipo: "evento_local", titulo: "", cidade: "", uf: "", inicio: "", fim: "", descricao: "" });
  const [salvandoEv, setSalvandoEv] = useState(false);
  const salvarEvento = async () => {
    if (!ev.titulo.trim() || !ev.inicio || !ev.fim) return;
    setSalvandoEv(true);
    try {
      const { error } = await (supabase.from("orion_eventos_operacionais") as any).insert({
        tipo: ev.tipo, titulo: ev.titulo.trim(), cidade: ev.cidade.trim() || null,
        uf: ev.uf.trim().toUpperCase() || null, inicio: ev.inicio, fim: ev.fim,
        descricao: ev.descricao.trim() || null,
      });
      if (error) throw error;
      setEv({ tipo: "evento_local", titulo: "", cidade: "", uf: "", inicio: "", fim: "", descricao: "" });
      qc.invalidateQueries({ queryKey: ["os-ev"] });
    } catch (e: any) { alert("Erro: " + e.message); }
    finally { setSalvandoEv(false); }
  };
  const excluirEvento = async (id: string) => {
    const { error } = await (supabase.from("orion_eventos_operacionais") as any).delete().eq("id", id);
    if (error) alert("Erro: " + error.message);
    else qc.invalidateQueries({ queryKey: ["os-ev"] });
  };

  const cres = nac?.crescimento || {};
  const hojeISO = new Date().toISOString().slice(0, 10);
  const abas: { id: Aba; label: string; icon: any }[] = [
    { id: "nacional",   label: "Painel Nacional",  icon: Globe2 },
    { id: "cobertura",  label: "Cobertura",        icon: Gauge },
    { id: "crescimento",label: "Crescimento",      icon: TrendingUp },
    { id: "oferta",     label: "Oferta × Demanda", icon: Scale },
    { id: "diretrizes", label: "Diretrizes",       icon: BookMarked },
    { id: "eventos",    label: "Eventos",          icon: CalendarDays },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* Header + Pergunte à ORION */}
        <div className="rounded-3xl bg-gradient-to-r from-[#02121f] via-[#06263f] to-[#02121f] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Cpu className="h-8 w-8 text-cyan-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION OS · Inteligência Territorial</h1>
              <p className="text-sm text-cyan-200/80">
                Centro de Inteligência Operacional — fonte única: banco oficial VIAGG-TX8
                {nac?.atualizado_em ? ` · atualizado ${nac.atualizado_em}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 shrink-0 text-cyan-300" />
              <input
                value={pergunta} onChange={(e) => setPergunta(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && perguntar()}
                placeholder='Pergunte à ORION — ex.: "onde falta motorista?" ou "qual cidade precisa de divulgação?"'
                className="h-10 flex-1 rounded-xl border-0 bg-white/90 px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                disabled={pensando}
              />
              <button onClick={perguntar} disabled={pensando || !pergunta.trim()}
                className="flex h-10 items-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-black text-[#02121f] hover:brightness-110 disabled:opacity-50">
                {pensando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Analisar
              </button>
            </div>
            {core && (
              <div className="mt-3 rounded-xl bg-white/95 p-4 text-sm leading-relaxed text-zinc-800">
                <p className="whitespace-pre-wrap">{core.resposta}</p>
                {core.motores.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-2 text-[11px] text-zinc-500">
                    {core.motores.map(m => <span key={m} className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold">{m}</span>)}
                    <span className="ml-auto font-black text-cyan-700">Confiança {Math.round(core.confianca * 100)}%</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Abas */}
        <div className="mt-6 flex flex-wrap gap-2">
          {abas.map(a => (
            <button key={a.id} onClick={() => setAba(a.id)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                aba === a.id ? "bg-[#06263f] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <a.icon className="h-4 w-4" /> {a.label}
            </button>
          ))}
        </div>

        {/* PAINEL NACIONAL */}
        {aba === "nacional" && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[
              ["Profissionais", nac?.profissionais], ["Usuários", nac?.usuarios],
              ["Lojistas", nac?.lojistas], ["Cidades com presença", nac?.cidades_com_presenca],
              ["Estados com presença", nac?.estados_com_presenca], ["Pedidos (total)", nac?.pedidos_total],
              ["Entregas concluídas", nac?.entregas_total], ["Corridas (motorista)", nac?.corridas_total],
              ["Cadastros hoje", cres.cadastros_hoje], ["Cadastros 7 dias", cres.cadastros_7d],
              ["Cadastros 30 dias", cres.cadastros_30d],
            ].map(([l, v]: any) => (
              <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{l}</p>
                <p className="mt-1 text-2xl font-black text-[#06263f]">{Number(v || 0).toLocaleString("pt-BR")}</p>
              </div>
            ))}
          </div>
        )}

        {/* COBERTURA */}
        {aba === "cobertura" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs text-zinc-400">Índice de Cobertura (IOD v1): capacidade diária ÷ demanda estimada, por cidade com presença ou demanda. Fórmula documentada em orion_indices.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-[11px] font-black uppercase tracking-wider text-zinc-400">
                    <th className="py-2 pr-2">Cidade</th><th className="py-2 pr-2">População</th>
                    <th className="py-2 pr-2">Profissionais</th><th className="py-2 pr-2">Lojas</th>
                    <th className="py-2 pr-2">Demanda/dia</th><th className="py-2 pr-2">Capacidade/dia</th>
                    <th className="py-2 pr-2">Índice</th><th className="py-2">Classificação</th>
                  </tr>
                </thead>
                <tbody>
                  {((cobertura || []) as any[]).map((c: any) => (
                    <tr key={`${c.cidade}-${c.uf}`} className="border-b border-zinc-50 align-top hover:bg-slate-50/60">
                      <td className="py-2 pr-2">
                        <p className="font-bold">{c.cidade}{c.uf ? <span className="text-zinc-400">/{c.uf}</span> : null}</p>
                        <details className="text-[11px] text-zinc-500">
                          <summary className="cursor-pointer select-none text-cyan-700">como foi calculado</summary>
                          {c.justificativa}
                        </details>
                      </td>
                      <td className="py-2 pr-2 tabular-nums">{Number(c.populacao || 0).toLocaleString("pt-BR")}</td>
                      <td className="py-2 pr-2">{Number(c.motoboys) + Number(c.motoristas)} ({c.motoboys}🏍️ {c.motoristas}🚘)</td>
                      <td className="py-2 pr-2">{c.lojas}</td>
                      <td className="py-2 pr-2 font-bold tabular-nums">{c.demanda_dia}</td>
                      <td className="py-2 pr-2 font-bold tabular-nums">{c.capacidade_dia}</td>
                      <td className="py-2 pr-2 font-black tabular-nums">{c.indice ?? "—"}</td>
                      <td className="py-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${CLASSE_COB[c.classe] || "bg-zinc-100 text-zinc-500"}`}>{c.classe}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CRESCIMENTO */}
        {aba === "crescimento" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
            <h3 className="font-black">Últimos 30 dias — cadastros e pedidos por dia</h3>
            <div className="mt-4 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={((cresc || []) as any[]).map((d: any) => ({
                  dia: String(d.dia).slice(8, 10) + "/" + String(d.dia).slice(5, 7),
                  Profissionais: Number(d.cadastros_profissionais),
                  Usuários: Number(d.cadastros_usuarios),
                  Pedidos: Number(d.pedidos),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="Pedidos" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="Profissionais" stroke="#0891b2" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Usuários" stroke="#a855f7" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* OFERTA × DEMANDA */}
        {aba === "oferta" && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
              <h3 className="font-black">Agora</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {[
                  ["Profissionais online", od?.profissionais_online],
                  ["Capacidade/dia", od?.capacidade_dia],
                  ["Solicitações médias/dia", od?.solicitacoes_media_dia],
                  ["Utilização", od?.utilizacao_pct != null ? `${od.utilizacao_pct}%` : "—"],
                  ["Pedidos hoje", od?.pedidos_hoje],
                ].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{l}</p>
                    <p className="text-xl font-black text-[#06263f]">{String(v ?? 0)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-zinc-400">{od?.premissas}</p>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
              <h3 className="font-black">Horários de pico (30 dias)</h3>
              <div className="mt-3 space-y-2">
                {((od?.horarios_pico || []) as any[]).map((h: any) => (
                  <div key={h.hora} className="flex items-center gap-3">
                    <span className="w-12 text-sm font-black">{h.hora}h</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-sky-400"
                        style={{ width: `${Math.min(100, h.pedidos * 8)}%` }} />
                    </div>
                    <span className="text-xs text-zinc-500">{h.pedidos} pedidos</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* DIRETRIZES (Editor Manual) */}
        {aba === "diretrizes" && (
          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm lg:col-span-2">
              <h3 className="flex items-center gap-2 font-black"><Plus className="h-5 w-5 text-cyan-600" /> Nova diretriz</h3>
              <p className="mt-1 text-[11px] text-zinc-400">Após APROVAR, a diretriz vira contexto autorizado da IA ORION em todas as análises. Cada salvamento cria uma versão (histórico completo).</p>
              <div className="mt-3 space-y-2">
                <select value={dTipo} onChange={(e) => setDTipo(e.target.value)}
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-2 text-sm font-semibold">
                  {TIPOS_DIRETRIZ.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input value={dTitulo} onChange={(e) => setDTitulo(e.target.value)} placeholder="Título"
                  className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-cyan-400" />
                <textarea value={dConteudo} onChange={(e) => setDConteudo(e.target.value)} rows={4}
                  placeholder="Conteúdo (o que a ORION deve considerar)"
                  className="w-full rounded-xl border border-zinc-200 p-3 text-sm outline-none focus:border-cyan-400" />
                <input value={dComentario} onChange={(e) => setDComentario(e.target.value)} placeholder="Comentário (opcional)"
                  className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-cyan-400" />
                <button onClick={salvarDiretriz} disabled={salvando || !dTitulo.trim() || !dConteudo.trim()}
                  className="h-10 w-full rounded-xl bg-[#06263f] text-sm font-black text-white hover:brightness-125 disabled:opacity-50">
                  {salvando ? "Salvando..." : "Salvar nova versão"}
                </button>
              </div>
            </div>
            <div className="space-y-3 lg:col-span-3">
              {!((diretrizes || []) as any[]).length && (
                <div className="rounded-3xl border border-dashed border-zinc-200 bg-white p-10 text-center text-zinc-400">Nenhuma diretriz cadastrada ainda.</div>
              )}
              {((diretrizes || []) as any[]).map((d: any) => (
                <div key={d.id} className={`rounded-3xl border p-4 shadow-sm ${d.status === "aprovada" ? "border-emerald-100 bg-emerald-50/40" : "border-zinc-100 bg-white"}`}>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase">
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700">{d.tipo}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">v{d.versao}</span>
                    <span className={`rounded-full px-2 py-0.5 ${
                      d.status === "aprovada" ? "bg-emerald-100 text-emerald-700" :
                      d.status === "rascunho" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-500"}`}>{d.status}</span>
                    <span className="ml-auto font-medium normal-case text-zinc-400">{new Date(d.criado_em).toLocaleString("pt-BR")}</span>
                  </div>
                  <h4 className="mt-1.5 font-black">{d.titulo}</h4>
                  <p className="text-sm text-zinc-700">{d.conteudo}</p>
                  {d.comentario && <p className="mt-1 text-[11px] italic text-zinc-400">“{d.comentario}”</p>}
                  <div className="mt-2 flex gap-2">
                    {d.status === "rascunho" && (
                      <button onClick={() => aprovar(d.id)}
                        className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:brightness-110">
                        <Check className="h-3.5 w-3.5" /> Aprovar
                      </button>
                    )}
                    {d.status === "arquivada" && (
                      <button onClick={() => rollback(d.chave, d.versao)}
                        className="flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-black text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50">
                        <RotateCcw className="h-3.5 w-3.5" /> Rollback para v{d.versao}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EVENTOS OPERACIONAIS */}
        {aba === "eventos" && (
          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm lg:col-span-2">
              <h3 className="flex items-center gap-2 font-black"><Plus className="h-5 w-5 text-cyan-600" /> Novo evento</h3>
              <p className="mt-1 text-[11px] text-zinc-400">Eventos dentro da vigência influenciam as análises e recomendações da ORION.</p>
              <div className="mt-3 space-y-2">
                <select value={ev.tipo} onChange={(e) => setEv({ ...ev, tipo: e.target.value })}
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-2 text-sm font-semibold">
                  {TIPOS_EVENTO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input value={ev.titulo} onChange={(e) => setEv({ ...ev, titulo: e.target.value })} placeholder="Título"
                  className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-cyan-400" />
                <div className="flex gap-2">
                  <input value={ev.cidade} onChange={(e) => setEv({ ...ev, cidade: e.target.value })} placeholder="Cidade (opcional)"
                    className="h-10 flex-1 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-cyan-400" />
                  <input value={ev.uf} onChange={(e) => setEv({ ...ev, uf: e.target.value })} placeholder="UF" maxLength={2}
                    className="h-10 w-16 rounded-xl border border-zinc-200 px-2 text-center text-sm outline-none focus:border-cyan-400" />
                </div>
                <div className="flex gap-2">
                  <input type="date" value={ev.inicio} onChange={(e) => setEv({ ...ev, inicio: e.target.value })}
                    className="h-10 flex-1 rounded-xl border border-zinc-200 px-2 text-sm" />
                  <input type="date" value={ev.fim} onChange={(e) => setEv({ ...ev, fim: e.target.value })}
                    className="h-10 flex-1 rounded-xl border border-zinc-200 px-2 text-sm" />
                </div>
                <textarea value={ev.descricao} onChange={(e) => setEv({ ...ev, descricao: e.target.value })} rows={2}
                  placeholder="Descrição (opcional)"
                  className="w-full rounded-xl border border-zinc-200 p-3 text-sm outline-none focus:border-cyan-400" />
                <button onClick={salvarEvento} disabled={salvandoEv || !ev.titulo.trim() || !ev.inicio || !ev.fim}
                  className="h-10 w-full rounded-xl bg-[#06263f] text-sm font-black text-white hover:brightness-125 disabled:opacity-50">
                  {salvandoEv ? "Salvando..." : "Cadastrar evento"}
                </button>
              </div>
            </div>
            <div className="space-y-3 lg:col-span-3">
              {!((eventos || []) as any[]).length && (
                <div className="rounded-3xl border border-dashed border-zinc-200 bg-white p-10 text-center text-zinc-400">Nenhum evento cadastrado.</div>
              )}
              {((eventos || []) as any[]).map((e: any) => {
                const ativo = e.inicio <= hojeISO && e.fim >= hojeISO;
                return (
                  <div key={e.id} className={`rounded-3xl border p-4 shadow-sm ${ativo ? "border-cyan-100 bg-cyan-50/50" : "border-zinc-100 bg-white"}`}>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase">
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700">{e.tipo}</span>
                      {ativo && <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-cyan-700">ATIVO AGORA</span>}
                      <span className="ml-auto font-medium normal-case text-zinc-400">
                        {new Date(e.inicio + "T12:00:00").toLocaleDateString("pt-BR")} → {new Date(e.fim + "T12:00:00").toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <h4 className="mt-1.5 font-black">{e.titulo}{e.cidade ? <span className="font-bold text-zinc-500"> · {e.cidade}{e.uf ? `/${e.uf}` : ""}</span> : null}</h4>
                    {e.descricao && <p className="text-sm text-zinc-600">{e.descricao}</p>}
                    <button onClick={() => excluirEvento(e.id)}
                      className="mt-2 flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-red-500 ring-1 ring-red-100 hover:bg-red-50">
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION OS Fase 1 · banco oficial como fonte única · diretrizes aprovadas viram contexto autorizado da IA · mapa geográfico interativo na Fase 2
        </p>
      </div>
    </div>
  );
}
