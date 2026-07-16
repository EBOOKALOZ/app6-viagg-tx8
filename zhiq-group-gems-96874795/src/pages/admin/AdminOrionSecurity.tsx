/**
 * /admin/orion-security — ORION Security AI (ORION-AI-24)
 *
 * Centro de Inteligência de Segurança: detecta anomalias, fraude e
 * abuso; gera alertas explicáveis e auditoria. NUNCA bloqueia
 * automaticamente — analisa, explica e recomenda (aprovação via
 * Automation AI-21 quando configurado). Read-only. IA via Gateway.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { ShieldAlert, Loader2, Sparkles, Bell, Activity, SlidersHorizontal } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const SEV: Record<string, string> = {
  alta: "bg-red-600 text-white", media: "bg-amber-100 text-amber-700", baixa: "bg-sky-100 text-sky-700",
};

type Aba = "visao" | "alertas" | "monitoramento" | "config";

export default function AdminOrionSecurity() {
  const [aba, setAba] = useState<Aba>("visao");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-security"], queryFn: () => rpc("sec_dashboard"), refetchInterval: 45000,
  });

  const score = dash?.score || {};
  const alertas = (dash?.alertas || []) as any[];
  const auth = dash?.auth || {};
  const sessoes = dash?.sessoes || {};
  const api = dash?.api || {};
  const anomalias = dash?.anomalias || {};
  const acoesCriticas = dash?.acoes_criticas || {};
  const fraude = dash?.fraude || {};
  const config = (dash?.config || []) as any[];

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("sec_summary");
      const r = await orionAiText("security", `Tipo: ${tipo}\nSinais de segurança reais: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 550 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const kpis: [string, any][] = [
    ["Security Score", score.security_score], ["Alertas altos 7d", score.alertas_altos_7d],
    ["Alertas médios 7d", score.alertas_medios_7d], ["Logins 24h", auth.logins_24h],
    ["Cadastros rep. 7d", auth.cadastros_repetidos_7d], ["Críticas bloq. 7d", acoesCriticas.bloqueadas_7d],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#3b0a0a] via-[#991b1b] to-[#3b0a0a] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <ShieldAlert className="h-8 w-8 text-red-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Security AI</h1>
              <p className="text-sm text-red-200/80">
                ORION-AI-24 · proteção inteligente e preventiva · analisa e alerta, nunca bloqueia sozinho
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-200/70">Security Score</p>
              <p className="text-3xl font-black">{score.security_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {kpis.map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-red-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["visao", Sparkles, "Visão geral"], ["alertas", Bell, `Alertas${alertas.length ? ` (${alertas.length})` : ""}`],
             ["monitoramento", Activity, "Monitoramento"], ["config", SlidersHorizontal, "Configurações"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#991b1b] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-red-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "visao" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-red-200 bg-red-50/40 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["security.summary", "Panorama"], ["security.anomaly", "Anomalias"],
                  ["security.risk", "Risco"], ["security.recommendation", "Recomendações"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-red-200 hover:bg-red-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-red-100">{narrativa}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Postura de segurança</h3>
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
            <div className="rounded-3xl border border-emerald-100 bg-emerald-50/40 p-4 text-xs text-emerald-700 shadow-sm">
              <b>Fraude (Trust AI):</b> {fraude.trust_alertas_14d ?? 0} alerta(s) em 14d ·
              <b> Ações críticas:</b> {acoesCriticas.bloqueadas_7d ?? 0} bloqueadas pela dupla trava do Automation AI-21.
              O Security AI <b>analisa e recomenda</b> — a execução segue políticas.
            </div>
          </div>
        )}

        {/* ALERTAS */}
        {aba === "alertas" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!alertas.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">
                🛡️ Nenhum alerta de segurança nos últimos 14 dias. Motor roda de hora em hora (tick :37).
              </div>
            ) : alertas.map((a: any, i: number) => (
              <div key={i} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${SEV[a.severidade] || ""}`}>{a.severidade}</span>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{a.tipo}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{a.entidade}</span>
                  {a.politica_aplicada && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">política: {a.politica_aplicada}</span>}
                  <span className="ml-auto rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-black text-white">risco {a.score_risco}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-700">{a.justificativa}</p>
                <p className="mt-0.5 text-[11px] text-zinc-400">fator: {a.fator_risco} · confiança {a.confianca}% · módulos: {((a.modulos || []) as string[]).join(", ")}</p>
              </div>
            ))}
            <p className="text-center text-[11px] text-zinc-400">
              O ORION Security AI <b>recomenda</b> ação humana — <b>nunca bloqueia automaticamente</b>. Toda decisão é explicável.
            </p>
          </div>
        )}

        {/* MONITORAMENTO (auth + sessões + api + anomalias) */}
        {aba === "monitoramento" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Autenticação (7d)</h3>
              <div className="flex flex-wrap gap-1">
                {Object.entries((auth.acoes_7d || {}) as Record<string, any>).map(([k, v]) => (
                  <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{k}: {v}</span>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-amber-600">{auth.ips?.status}</p>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Sessões (24h)</h3>
              <div className="grid grid-cols-2 gap-2">
                {[["Logins", sessoes.sessoes_ativas_estim], ["Logouts", sessoes.logouts_24h],
                  ["Token refresh", sessoes.token_refresh_24h], ["Usuários ativos 7d", sessoes.usuarios_ativos_7d]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-2 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-base font-black text-zinc-800">{String(v ?? 0)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">API / Gateway (24h)</h3>
              <div className="grid grid-cols-3 gap-2">
                {[["Chamadas", api.chamadas_24h], ["Erros", api.erros_24h], ["Retries", api.retries_24h]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-2 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-base font-black text-zinc-800">{String(v ?? 0)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Anomalias de evento</h3>
              <div className="grid grid-cols-3 gap-2">
                {[["Eventos 24h", anomalias.eventos_24h], ["Média diária", anomalias.media_diaria_7d], ["Contas 7d", anomalias.contas_criadas_7d]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-2 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-base font-black text-zinc-800">{String(v ?? 0)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CONFIGURAÇÕES */}
        {aba === "config" && !isLoading && (
          <div className="mt-4 space-y-2">
            {config.map((c: any) => (
              <div key={c.tipo} className="flex flex-wrap items-center gap-2 rounded-3xl border border-zinc-100 bg-white p-3 shadow-sm">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${c.modo === "aprovacao" ? "bg-amber-100 text-amber-700" : c.modo === "ignorar" ? "bg-zinc-200 text-zinc-500" : "bg-sky-100 text-sky-700"}`}>{c.modo}</span>
                <span className="font-bold text-zinc-800">{c.tipo}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.monitorado ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-400"}`}>{c.monitorado ? "monitorado" : "off"}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">limiar {c.limiar}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-400">{c.descricao}</span>
              </div>
            ))}
            <p className="text-center text-[11px] text-zinc-400">
              Modo <b>alerta</b> (padrão), <b>aprovação</b> (via Automation AI-21) ou <b>ignorar</b>. Nunca altera configurações críticas automaticamente.
            </p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Security AI v1.0 · ORION-AI-24 · detecção preventiva · read-only · analisa/alerta/audita, nunca bloqueia sozinho ·
          tick :37 · IA só via Gateway + Prompt Registry
        </p>
      </div>
    </div>
  );
}
