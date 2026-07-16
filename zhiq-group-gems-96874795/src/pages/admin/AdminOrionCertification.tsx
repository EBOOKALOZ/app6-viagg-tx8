/**
 * /admin/orion-certification — ORION Certification Engine (OCE) — ORION CORE
 *
 * Auditor oficial da VIAGG-TX8. Roda verificações reais (arquitetura,
 * banco, segurança, gateway, event bus, financeiro read-only) ao vivo
 * sobre o catálogo e emite certificação com veredito. NUNCA modifica —
 * analisa, certifica e RECOMENDA patch. Browser/stress ficam DECLARADOS
 * (transparente). IA via Gateway + Prompt Registry.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { BadgeCheck, Loader2, Sparkles, ListChecks, Wrench, History, PlayCircle } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const ST: Record<string, string> = {
  pass: "bg-emerald-100 text-emerald-700", warn: "bg-amber-100 text-amber-700",
  fail: "bg-red-600 text-white", declarado: "bg-zinc-200 text-zinc-500",
};
const scoreColor = (s: number) => s >= 99 ? "text-emerald-600" : s >= 90 ? "text-emerald-500" : s >= 75 ? "text-amber-600" : "text-red-600";

type Aba = "visao" | "dimensoes" | "patches" | "historico";

export default function AdminOrionCertification() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("visao");
  const [ocupado, setOcupado] = useState("");
  const [narrativa, setNarrativa] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-oce"], queryFn: () => rpc("oce_dashboard"), refetchInterval: 60000,
  });

  const score = dash?.score || {};
  const resultados = (dash?.resultados || []) as any[];
  const patches = (dash?.patches || []) as any[];
  const historico = (dash?.historico || []) as any[];
  const scores = (score.scores || {}) as Record<string, any>;

  const certificar = async () => {
    setOcupado("cert");
    try {
      await rpc("oce_certify");
      await qc.invalidateQueries({ queryKey: ["orion-oce"] });
    } catch (e: any) { alert(e.message); }
    finally { setOcupado(""); }
  };

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado("narr"); setNarrativa("");
    try {
      const ctx = await rpc("oce_summary");
      const r = await orionAiText("certification", `Tipo: ${tipo}\nCertificação real: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 650 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(""); }
  };

  const porCategoria = resultados.reduce((acc: Record<string, any[]>, r: any) => {
    (acc[r.categoria] = acc[r.categoria] || []).push(r); return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0a1f14] via-[#065f46] to-[#0a1f14] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <BadgeCheck className="h-8 w-8 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Certification Engine</h1>
              <p className="text-sm text-emerald-200/80">
                ORION CORE · auditor oficial · verifica ao vivo, nunca modifica
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
              <p className="mt-1 text-sm font-black text-emerald-300">{score.veredito || "—"}</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">Score Geral</p>
              <p className="text-4xl font-black">{score.score_geral ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={certificar} disabled={!!ocupado}
              className="flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-black text-white shadow hover:bg-emerald-400 disabled:opacity-50">
              {ocupado === "cert" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              Certificar agora
            </button>
            {[["Verificados", score.passou != null ? (score.passou + score.falhou) : null], ["Passou", score.passou],
              ["Falhou", score.falhou], ["Declarados", score.declarados]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-1.5 ring-1 ring-white/10">
                <span className="text-[10px] font-bold uppercase text-emerald-200/70">{l}: </span>
                <span className="text-sm font-black">{String(v ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["visao", Sparkles, "Visão geral"], ["dimensoes", ListChecks, `Verificações${resultados.length ? ` (${resultados.length})` : ""}`],
             ["patches", Wrench, `Patches${patches.length ? ` (${patches.length})` : ""}`], ["historico", History, "Histórico"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#065f46] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "visao" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["certification.executive", "Parecer executivo"], ["certification.architecture", "Arquitetura"],
                  ["certification.security", "Segurança"], ["certification.summary", "Resumo"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={!!ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-emerald-200 hover:bg-emerald-100 disabled:opacity-50">
                    {ocupado === "narr" ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-emerald-100">{narrativa}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Score por dimensão (verificações reais)</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(scores).map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{k}</p>
                    <p className={`text-2xl font-black ${scoreColor(Number(v))}`}>{v}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-amber-100 bg-amber-50/40 p-4 text-xs text-amber-700 shadow-sm">
              <b>Transparência:</b> {score.declarados ?? 0} verificações (Front-End, UX, Visual, Mobile, Marketplace E2E, Stress,
              Visitor Simulator, IA Scenario) exigem navegador headless / teste de carga e ficam <b>DECLARADAS</b> — não são
              executadas neste motor DB-side nem contam no score. O OCE <b>nunca modifica</b> o sistema — só analisa e recomenda patch.
            </div>
          </div>
        )}

        {/* DIMENSÕES / VERIFICAÇÕES */}
        {aba === "dimensoes" && !isLoading && (
          <div className="mt-4 space-y-4">
            {Object.entries(porCategoria).map(([cat, items]) => (
              <div key={cat} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-zinc-700">{cat}</h3>
                <div className="space-y-1.5">
                  {(items as any[]).map((r: any) => (
                    <div key={r.chave} className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ST[r.status] || ""}`}>{r.status}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-zinc-700">{r.chave}</span>
                      {r.valor != null && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{r.valor}{r.esperado ? ` / ${r.esperado}` : ""}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PATCHES */}
        {aba === "patches" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!patches.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">
                🎉 Nenhum patch sugerido — nenhuma verificação real falhou.
              </div>
            ) : patches.map((p: any, i: number) => (
              <div key={i} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Wrench className="h-4 w-4 text-amber-600" />
                  <p className="min-w-0 flex-1 font-black text-zinc-800">{p.titulo}</p>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">{p.status}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-600">{p.problema}</p>
                <p className="mt-1 text-[11px] text-zinc-500">Sugestão: {p.patch_sugerido}</p>
                <p className="mt-0.5 text-[10px] text-zinc-400">impacto: {p.impacto} · risco: {p.risco} · rollback: {p.rollback}</p>
              </div>
            ))}
            <p className="text-center text-[11px] text-zinc-400">
              O OCE <b>nunca aplica</b> patches automaticamente — toda correção aguarda aprovação humana.
            </p>
          </div>
        )}

        {/* HISTÓRICO */}
        {aba === "historico" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!historico.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">Sem histórico ainda.</div>
            ) : historico.map((h: any, i: number) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-3xl border border-zinc-100 bg-white p-3 shadow-sm">
                <span className={`text-lg font-black ${scoreColor(Number(h.score))}`}>{h.score}</span>
                <span className="min-w-0 flex-1 font-bold text-zinc-700">{h.veredito}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">✓ {h.passou}</span>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">✗ {h.falhou}</span>
                <span className="text-[11px] text-zinc-400">{h.data}</span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Certification Engine v1.0 · ORION CORE · verificação automatizada read-only · nunca modifica ·
          browser/stress declarados · tick :50 · IA só via Gateway + Prompt Registry
        </p>
      </div>
    </div>
  );
}
