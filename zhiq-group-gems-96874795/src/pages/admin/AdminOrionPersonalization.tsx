/**
 * /admin/orion-personalization — ORION Personalization AI (ORION-AI-19)
 *
 * Inteligência de personalização: Home inteligente, recomendação de
 * produtos/lojas e descoberta por usuário, com base em sinais
 * comportamentais REAIS e AUTORIZADOS (cliques/carrinho/cidade/horário)
 * — nunca atributos sensíveis. Read-only sobre as fontes; explicável;
 * respeita opt-out. IA só via Gateway + Prompt Registry.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { UserCog, Loader2, Sparkles, Users, ListChecks, ShieldCheck } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const TIPO: Record<string, string> = {
  loja: "bg-violet-100 text-violet-700", produto: "bg-emerald-100 text-emerald-700",
  tendencia: "bg-amber-100 text-amber-700", campanha: "bg-sky-100 text-sky-700",
};

type Aba = "visao" | "perfis" | "recomendacoes" | "privacidade";

export default function AdminOrionPersonalization() {
  const [aba, setAba] = useState<Aba>("visao");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-personalization"], queryFn: () => rpc("perso_dashboard"), refetchInterval: 60000,
  });

  const score = dash?.score || {};
  const metrics = dash?.metrics || {};
  const perfis = (dash?.perfis_amostra || []) as any[];
  const recs = (dash?.recomendacoes_recentes || []) as any[];
  const priv = dash?.privacidade || {};

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("perso_summary");
      const r = await orionAiText("personalization", `Tipo: ${tipo}\nDados reais: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 550 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const kpis: [string, any][] = [
    ["Usuários ativos", score.usuarios_ativos_45d], ["Perfis", score.perfis],
    ["Recomendações 7d", score.recomendacoes_7d], ["Opt-out", score.optout],
    ["Recs totais", metrics.recomendacoes_total], ["Cidades", Object.keys(metrics.cidades_perfis || {}).length],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#2b1055] via-[#5b21b6] to-[#2b1055] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <UserCog className="h-8 w-8 text-violet-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Personalization AI</h1>
              <p className="text-sm text-violet-200/80">
                ORION-AI-19 · experiência adaptativa por usuário · explicável · respeita privacidade
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-200/70">Personalization Score</p>
              <p className="text-3xl font-black">{score.personalization_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {kpis.map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-violet-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["visao", Sparkles, "Visão geral"], ["perfis", Users, `Perfis${perfis.length ? ` (${perfis.length})` : ""}`],
             ["recomendacoes", ListChecks, "Recomendações"], ["privacidade", ShieldCheck, "Privacidade"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#5b21b6] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-violet-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "visao" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-violet-200 bg-violet-50/50 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["perso.executive", "Resumo executivo"], ["perso.discovery", "Descobertas"],
                  ["perso.summary", "Panorama"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-violet-200 hover:bg-violet-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-violet-100">{narrativa}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Componentes do Personalization Score</h3>
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
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Recomendações por tipo · cidades com perfil</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries((metrics.recomendacoes_por_tipo || {}) as Record<string, any>).map(([k, v]) => (
                  <span key={k} className={`rounded-full px-3 py-1 text-[11px] font-black ${TIPO[k] || "bg-zinc-100 text-zinc-600"}`}>{k}: {v}</span>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries((metrics.cidades_perfis || {}) as Record<string, any>).map(([k, v]) => (
                  <span key={k} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">{k}: {v}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PERFIS */}
        {aba === "perfis" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!perfis.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">
                Nenhum perfil ainda. O motor roda de hora em hora (tick :33) sobre usuários ativos.
              </div>
            ) : perfis.map((p: any) => (
              <div key={p.user_id} className="flex flex-wrap items-center gap-2 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700">{p.cidade || "sem cidade"}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-500">{p.user_id}</span>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-black text-white">{p.sinais} sinais</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{p.lojas} lojas</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{p.produtos} produtos</span>
              </div>
            ))}
            <p className="text-center text-[10px] text-zinc-400">
              Perfis são agregados comportamentais (top-N). Sem atributos sensíveis. RLS: cada usuário só vê o próprio.
            </p>
          </div>
        )}

        {/* RECOMENDAÇÕES */}
        {aba === "recomendacoes" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!recs.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">
                Sem recomendações recentes.
              </div>
            ) : recs.map((r: any, i: number) => (
              <div key={i} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${TIPO[r.tipo] || "bg-zinc-100 text-zinc-600"}`}>{r.tipo}</span>
                  <p className="min-w-0 flex-1 font-bold text-zinc-800">{r.titulo}</p>
                  <span className="rounded-full bg-violet-600 px-2.5 py-1 text-[10px] font-black text-white">score {r.score}</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">{r.motivo}</p>
                <p className="mt-0.5 font-mono text-[10px] text-zinc-300">{r.user_id}</p>
              </div>
            ))}
          </div>
        )}

        {/* PRIVACIDADE */}
        {aba === "privacidade" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-800">
                <ShieldCheck className="h-5 w-5" />
                <h3 className="text-sm font-black">Privacidade por desenho</h3>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white p-3 text-center ring-1 ring-emerald-100">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">Opt-out</p>
                  <p className="text-2xl font-black text-zinc-800">{priv.optout_total ?? 0}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-zinc-600">{priv.principio}</p>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 text-xs text-zinc-500 shadow-sm">
              <p className="font-black text-zinc-700">Garantias implementadas</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li><b>Minimização:</b> só agregados top-N (cidade, lojas, produtos, horários) — nunca cpf, nascimento ou dados sensíveis.</li>
                <li><b>Opt-out real:</b> <code>perso_set_optout(true)</code> apaga o perfil derivado E as recomendações do usuário.</li>
                <li><b>Consentimento por RLS:</b> cada usuário só acessa o próprio perfil/recomendações (admin vê o agregado).</li>
                <li><b>Read-only:</b> nunca altera as fontes; nenhuma decisão financeira/comercial automática.</li>
                <li><b>Explicabilidade:</b> toda recomendação carrega motivo, fatores, módulos, score e data.</li>
              </ul>
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Personalization AI v1.0 · ORION-AI-19 · sinais comportamentais autorizados · read-only · explicável ·
          opt-out honrado · tick :33 · IA só via Gateway + Prompt Registry
        </p>
      </div>
    </div>
  );
}
