/**
 * /admin/orion-business-intelligence — ORION Business Intelligence AI (ORION-AI-22)
 *
 * Centro Executivo: consolida (SÓ LEITURA) o que todos os módulos ORION
 * produziram em KPIs executivo/financeiro/comercial/operacional/
 * inteligência/IA, com evolução histórica e narrativa explicável.
 * Não executa, não move dinheiro, não altera dados. IA via Gateway.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { BarChart3, Loader2, Sparkles, DollarSign, ShoppingCart, Brain, Cpu } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const fmt = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString("pt-BR");
  if (typeof v === "object") return Array.isArray(v) ? `${v.length}` : JSON.stringify(v).slice(0, 40);
  return String(v);
};

type Aba = "executivo" | "financeiro" | "comercial" | "inteligencia";

const HIDE = new Set(["origem", "modulos", "nota", "status", "por_vertical", "por_modulo", "por_provider", "growth_cidades", "ultimo_finance_snapshot"]);

function LensCards({ data }: { data: Record<string, any> }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Object.entries(data || {}).filter(([k]) => !HIDE.has(k)).map(([k, v]) => (
        <div key={k} className="rounded-2xl border border-zinc-100 bg-white p-3 text-center shadow-sm">
          <p className="truncate text-[10px] font-bold uppercase text-zinc-400">{k.replaceAll("_", " ")}</p>
          <p className="text-xl font-black text-zinc-800">{fmt(v)}</p>
        </div>
      ))}
    </div>
  );
}

export default function AdminOrionBusinessIntelligence() {
  const [aba, setAba] = useState<Aba>("executivo");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-bi"], queryFn: () => rpc("bi_dashboard"), refetchInterval: 60000,
  });

  const score = dash?.score || {};

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("bi_summary");
      const r = await orionAiText("business", `Tipo: ${tipo}\nKPIs consolidados reais: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 700 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const modulosDe = (lens: any) => (lens?.modulos || []) as string[];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0f172a] via-[#334155] to-[#0f172a] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <BarChart3 className="h-8 w-8 text-cyan-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Business Intelligence AI</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-22 · Centro Executivo · consolida todos os módulos · somente leitura
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300/70">BI Score</p>
              <p className="text-3xl font-black">{score.bi_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Domínios", score.dominios_cobertos], ["KPIs hoje", score.kpis_snapshot_hoje],
              ["Receita (BRL)", dash?.financeiro?.receita_paga], ["Trust médio", dash?.inteligencia?.trust_medio]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{fmt(v)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* NARRATIVA IA */}
        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {[["business.summary", "Panorama executivo"], ["business.analysis", "Análise"],
              ["business.executive", "Resumo board"], ["business.forecast", "Projeção"]].map(([pk, l]) => (
              <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50">
                <Sparkles className="h-3.5 w-3.5" /> {ocupado ? "…" : l}
              </button>
            ))}
          </div>
          {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-slate-100">{narrativa}</p>}
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["executivo", BarChart3, "Executivo"], ["financeiro", DollarSign, "Financeiro"],
             ["comercial", ShoppingCart, "Comercial/Op."], ["inteligencia", Brain, "Inteligência/IA"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#334155] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-cyan-500" /></div>}

        {/* EXECUTIVO */}
        {aba === "executivo" && !isLoading && (
          <div className="mt-4 space-y-3">
            <LensCards data={dash?.executivo} />
            <p className="text-[10px] text-zinc-400">Fonte: {dash?.executivo?.origem} · módulos: {modulosDe(dash?.executivo).join(", ")}</p>
          </div>
        )}

        {/* FINANCEIRO */}
        {aba === "financeiro" && !isLoading && (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-2 text-center text-[11px] font-bold text-emerald-700">
              💰 SOMENTE LEITURA — o BI nunca altera dados financeiros.
            </div>
            <LensCards data={dash?.financeiro} />
            <p className="text-[10px] text-zinc-400">Fonte: {dash?.financeiro?.origem} · módulos: {modulosDe(dash?.financeiro).join(", ")}</p>
          </div>
        )}

        {/* COMERCIAL + OPERACIONAL */}
        {aba === "comercial" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-black text-zinc-700">Comercial</h3>
              <LensCards data={dash?.comercial} />
              {dash?.comercial?.por_vertical && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(dash.comercial.por_vertical as Record<string, any>).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{k}: {v}</span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-black text-zinc-700">Operacional</h3>
              <LensCards data={dash?.operacional} />
              {dash?.operacional?.status && <p className="mt-1 text-[10px] text-amber-600">{dash.operacional.status}</p>}
            </div>
          </div>
        )}

        {/* INTELIGÊNCIA + IA */}
        {aba === "inteligencia" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-black text-zinc-700">Inteligência consolidada</h3>
              <LensCards data={dash?.inteligencia} />
              {!!(dash?.inteligencia?.growth_cidades || []).length && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(dash.inteligencia.growth_cidades as any[]).map((g: any) => (
                    <span key={g.cidade} className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{g.cidade}: {g.score}</span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-1 text-sm font-black text-zinc-700"><Cpu className="h-4 w-4" /> IA / Gateway</h3>
              <LensCards data={dash?.ia} />
              {dash?.ia?.por_modulo && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(dash.ia.por_modulo as Record<string, any>).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{k}: {v}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Business Intelligence AI v1.0 · ORION-AI-22 · exclusivamente analítico · read-only · snapshot/dia ·
          explicável (origem/módulos/metodologia/confiança) · tick :09 · IA só via Gateway + Prompt Registry
        </p>
      </div>
    </div>
  );
}
