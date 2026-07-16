/**
 * /admin/orion-customer-success — ORION Customer Success AI (ORION-AI-26)
 *
 * Centro de Customer Success: retém, engaja e reduz abandono após a
 * conversão. Customer Health Score (0-100 explicável) + Churn Risk +
 * reengajamento + recorrência. Analisa e RECOMENDA — nunca executa nem
 * altera dados do usuário. Read-only. IA via Gateway + Prompt Registry.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { HeartHandshake, Loader2, Sparkles, AlertTriangle, RefreshCw, Repeat } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const RISK: Record<string, string> = {
  muito_baixo: "bg-emerald-100 text-emerald-700", baixo: "bg-sky-100 text-sky-700",
  medio: "bg-amber-100 text-amber-700", alto: "bg-orange-100 text-orange-700", critico: "bg-red-600 text-white",
};
const scoreColor = (s: number) => s >= 60 ? "text-emerald-600" : s >= 40 ? "text-amber-600" : "text-red-600";

type Aba = "visao" | "risco" | "reengajamento" | "recorrencia";

export default function AdminOrionCustomerSuccess() {
  const [aba, setAba] = useState<Aba>("visao");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-cs"], queryFn: () => rpc("cs_dashboard"), refetchInterval: 60000,
  });

  const score = dash?.score || {};
  const metrics = dash?.metrics || {};
  const emRisco = (dash?.em_risco || []) as any[];
  const reeng = dash?.reengajamento || {};
  const rec = dash?.recorrencia || {};

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("cs_summary");
      const r = await orionAiText("customer_success", `Tipo: ${tipo}\nDados de retenção reais: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 600 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const kpis: [string, any][] = [
    ["CS Score", score.customer_success_score], ["Health médio", score.health_medio],
    ["Em risco", score.em_risco], ["Usuários", score.usuarios],
    ["Inativos 30d", reeng.inativos_30d], ["Recorrentes", rec.compradores_recorrentes],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#3b0a2e] via-[#9d174d] to-[#3b0a2e] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <HeartHandshake className="h-8 w-8 text-rose-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Customer Success AI</h1>
              <p className="text-sm text-rose-200/80">
                ORION-AI-26 · retém e engaja · Customer Health Score · recomenda, nunca executa
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-rose-200/70">CS Score</p>
              <p className="text-3xl font-black">{score.customer_success_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {kpis.map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-rose-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["visao", Sparkles, "Health Score"], ["risco", AlertTriangle, `Em risco${emRisco.length ? ` (${emRisco.length})` : ""}`],
             ["reengajamento", RefreshCw, "Reengajamento"], ["recorrencia", Repeat, "Recorrência"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#9d174d] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-rose-500" /></div>}

        {/* HEALTH SCORE / VISÃO */}
        {aba === "visao" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["customer.summary", "Panorama"], ["customer.churn", "Churn"],
                  ["customer.retention", "Retenção"], ["customer.reengagement", "Reengajamento"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-rose-200 hover:bg-rose-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-rose-100">{narrativa}</p>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Distribuição por churn risk</h3>
                {Object.entries((metrics.por_risco || {}) as Record<string, any>).map(([k, v]) => (
                  <div key={k} className="mb-1.5 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${RISK[k] || "bg-zinc-100"}`}>{k.replaceAll("_", " ")}</span>
                    <span className="min-w-0 flex-1"></span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black text-zinc-600">{v}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Por segmento · componentes do CS Score</h3>
                <div className="mb-2 flex flex-wrap gap-1">
                  {Object.entries((metrics.por_segmento || {}) as Record<string, any>).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{k}: {v}</span>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries((score.componentes || {}) as Record<string, any>).map(([k, v]) => (
                    <div key={k} className="rounded-2xl bg-slate-50 p-2 text-center">
                      <p className="text-[10px] font-bold uppercase text-zinc-400">{k}</p>
                      <p className="text-base font-black text-zinc-800">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EM RISCO */}
        {aba === "risco" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!emRisco.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">
                🎉 Nenhum cliente em risco médio/alto/crítico. Motor roda de hora em hora (tick :19).
              </div>
            ) : emRisco.map((c: any) => (
              <div key={c.user_id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-sm font-black ${scoreColor(c.health_score)}`}>{c.health_score}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${RISK[c.churn_risk] || ""}`}>{c.churn_risk?.replaceAll("_", " ")}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{c.segmento}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-400">{c.user_id}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-700">{c.recomendacao}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries((c.fatores || {}) as Record<string, any>).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">{k}: {v}</span>
                  ))}
                  {c.ultima_atividade && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-bold text-zinc-400">última: {new Date(c.ultima_atividade).toLocaleDateString("pt-BR")}</span>}
                </div>
              </div>
            ))}
            <p className="text-center text-[11px] text-zinc-400">
              O Customer Success AI <b>recomenda</b> retenção — a execução segue políticas (Automation AI-21). Nunca altera dados do usuário.
            </p>
          </div>
        )}

        {/* REENGAJAMENTO */}
        {aba === "reengajamento" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[["Inativos 30d", reeng.inativos_30d], ["Vendedores sem anúncio", reeng.vendedores_sem_anuncio],
                ["Compradores sem retorno", reeng.compradores_sem_retorno]].map(([l, v]: any) => (
                <div key={l} className="rounded-2xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-2xl font-black text-zinc-800">{String(v ?? 0)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-amber-100 bg-amber-50/50 p-4 text-xs text-amber-700">{reeng.nota}</div>
          </div>
        )}

        {/* RECORRÊNCIA */}
        {aba === "recorrencia" && !isLoading && (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[["Compradores recorrentes", rec.compradores_recorrentes], ["Visitantes recorrentes", rec.visitantes_recorrentes],
              ["Ticket médio", rec.ticket_medio != null ? `R$ ${Number(rec.ticket_medio).toLocaleString("pt-BR")}` : "—"]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                <p className="text-2xl font-black text-zinc-800">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Customer Success AI v1.0 · ORION-AI-26 · Customer Health Score explicável + churn risk · read-only ·
          recomenda, nunca executa · tick :19 · IA só via Gateway + Prompt Registry
        </p>
      </div>
    </div>
  );
}
