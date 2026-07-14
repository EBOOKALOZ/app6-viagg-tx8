/**
 * /admin/orion-ai — ORION AI Gateway (ORION-AI-00)
 *
 * Central de controle da camada única de IA: dashboard de uso/custo,
 * registro de modelos (novos modelos sem alterar código), preferência
 * de modelo por módulo, configurações (timeout, retry, cache, limites)
 * e health check dos provedores. A chave de API NUNCA aparece aqui —
 * vive somente nos secrets das Edge Functions.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiHealth, orionAiText } from "@/lib/ai/orionAiGateway";
import {
  BrainCircuit, Loader2, Activity, Settings2, Boxes, HeartPulse,
  CheckCircle2, XCircle, PlusCircle, Zap,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend,
} from "recharts";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const PROVIDER_EMOJI: Record<string, string> = {
  openai: "🟢", anthropic: "🟠", google: "🔵", xai: "⚫", deepseek: "🟣",
};

const CONFIG_LABELS: Record<string, string> = {
  modelo_padrao: "Modelo padrão", timeout_ms: "Timeout (ms)", temperatura: "Temperatura",
  max_tokens: "Máx. tokens", retry_max: "Tentativas (retry)", cache_enabled: "Cache ativo",
  cache_ttl_min: "Validade do cache (min)", limite_diario: "Limite diário (chamadas)",
  limite_mensal: "Limite mensal (chamadas)", rate_por_minuto: "Limite por minuto",
  rate_modulo_hora: "Limite por módulo/hora", rate_usuario_dia: "Limite por usuário/dia",
};

type Aba = "dashboard" | "modelos" | "config" | "health";

export default function AdminOrionAi() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("dashboard");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-ai-dash"], queryFn: () => rpc("orion_ai_dashboard"), refetchInterval: 30000,
  });

  // ── configurações ──
  const [cfgEdit, setCfgEdit] = useState<Record<string, string>>({});
  const salvarCfg = async (chave: string) => {
    const bruto = cfgEdit[chave];
    if (bruto === undefined) return;
    try {
      let valor: unknown = bruto;
      if (bruto === "true" || bruto === "false") valor = bruto === "true";
      else if (bruto !== "" && !isNaN(Number(bruto))) valor = Number(bruto);
      await rpc("orion_ai_config_set", { p_chave: chave, p_valor: JSON.stringify(valor) === bruto ? JSON.parse(bruto) : valor });
      qc.invalidateQueries({ queryKey: ["orion-ai-dash"] });
    } catch (e: any) { alert("Erro: " + e.message); }
  };

  // ── modelos ──
  const [novoModelo, setNovoModelo] = useState({ provider: "openai", model_code: "", label: "", custo_in: "0", custo_out: "0" });
  const salvarModelo = async (m: any, ativo?: boolean) => {
    try {
      await rpc("orion_ai_model_upsert", {
        p_provider: m.provider, p_model_code: m.model_code, p_label: m.label || m.model_code,
        p_ativo: ativo ?? m.ativo ?? true,
        p_custo_in: Number(m.custo_input_mtok ?? m.custo_in ?? 0),
        p_custo_out: Number(m.custo_output_mtok ?? m.custo_out ?? 0),
        p_max_tokens: Number(m.max_tokens_default ?? 800),
      });
      qc.invalidateQueries({ queryKey: ["orion-ai-dash"] });
      setNovoModelo({ provider: "openai", model_code: "", label: "", custo_in: "0", custo_out: "0" });
    } catch (e: any) { alert("Erro: " + e.message); }
  };

  const setPref = async (module: string, model_code: string) => {
    try {
      await rpc("orion_ai_module_pref_set", { p_module: module, p_model_code: model_code });
      qc.invalidateQueries({ queryKey: ["orion-ai-dash"] });
    } catch (e: any) { alert("Erro: " + e.message); }
  };

  // ── health ──
  const [health, setHealth] = useState<any>(null);
  const [testando, setTestando] = useState(false);
  const rodarHealth = async () => {
    setTestando(true);
    try {
      const h = await orionAiHealth();
      const teste = await orionAiText("health-check", "Responda apenas: OK", { maxTokens: 10 });
      setHealth({ ...h, teste });
      qc.invalidateQueries({ queryKey: ["orion-ai-dash"] });
    } catch (e: any) { setHealth({ ok: false, error: e.message }); }
    finally { setTestando(false); }
  };

  const hoje = dash?.hoje || {};
  const mes = dash?.mes || {};

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* Header */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0b1f3a] via-[#123a6b] to-[#0b1f3a] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <BrainCircuit className="h-8 w-8 text-sky-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION AI Gateway</h1>
              <p className="text-sm text-sky-200/80">
                Camada única de IA · todos os módulos passam por aqui · auditoria imutável
                {dash?.atualizado_em ? ` · atualizado ${dash.atualizado_em}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Chamadas hoje", hoje.chamadas],
              ["Erros hoje", hoje.erros],
              ["Cache hoje", hoje.cache],
              ["Tokens hoje", (Number(hoje.tokens_in || 0) + Number(hoje.tokens_out || 0)).toLocaleString("pt-BR")],
              ["Custo mês (US$)", Number(mes.custo_usd || 0).toFixed(4)],
              ["Tempo médio", hoje.tempo_medio_ms ? `${hoje.tempo_medio_ms}ms` : "—"],
            ].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
                <p className="text-[10px] font-bold uppercase tracking-wider text-sky-200/70">{l}</p>
                <p className="text-xl font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Abas */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([
            ["dashboard", Activity, "Dashboard"],
            ["modelos", Boxes, "Modelos & Módulos"],
            ["config", Settings2, "Configurações"],
            ["health", HeartPulse, "Health Check"],
          ] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#123a6b] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>}

        {/* DASHBOARD */}
        {aba === "dashboard" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Chamadas × custo (14 dias)</h3>
              {!((dash?.serie_14d || []) as any[]).length ? (
                <p className="p-6 text-center text-sm text-zinc-400">Sem chamadas no período.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={(dash?.serie_14d || []).map((d: any) => ({
                      ...d, dia: new Date(d.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
                    }))}>
                      <XAxis dataKey="dia" fontSize={11} />
                      <YAxis yAxisId="n" allowDecimals={false} fontSize={11} />
                      <YAxis yAxisId="c" orientation="right" fontSize={11} />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="n" dataKey="chamadas" name="Chamadas" fill="#0284c7" />
                      <Bar yAxisId="n" dataKey="erros" name="Erros" fill="#dc2626" />
                      <Line yAxisId="c" dataKey="custo" name="Custo US$" stroke="#059669" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {[
                ["Modelo mais utilizado (30d)", dash?.por_modelo, (x: any) => x.modelo, (x: any) => `${x.n} · US$ ${Number(x.custo).toFixed(4)}`],
                ["Módulo que mais consome (30d)", dash?.por_modulo, (x: any) => x.module, (x: any) => `${x.n} · US$ ${Number(x.custo).toFixed(4)}`],
              ].map(([titulo, lista, fL, fV]: any) => (
                <div key={titulo} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                  <h3 className="mb-2 text-sm font-black text-zinc-700">{titulo}</h3>
                  {!((lista || []) as any[]).length ? (
                    <p className="py-4 text-center text-sm text-zinc-400">Sem dados ainda.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {(lista as any[]).map((x, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs">
                          <span className="min-w-0 flex-1 truncate font-semibold text-zinc-600">{fL(x)}</span>
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 font-black text-sky-700">{fV(x)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Últimas chamadas</h3>
              {!((dash?.ultimas || []) as any[]).length ? (
                <p className="py-4 text-center text-sm text-zinc-400">Nenhuma chamada registrada ainda.</p>
              ) : (
                <div className="space-y-1">
                  {((dash?.ultimas || []) as any[]).map((u: any, i: number) => (
                    <p key={i} className="rounded-lg bg-slate-50 px-3 py-1.5 text-[12px] text-zinc-600">
                      <span className={`font-black ${u.status === "ok" ? "text-emerald-700" : u.status === "cache" ? "text-sky-600" : u.status === "fallback" ? "text-amber-600" : "text-red-600"}`}>
                        {u.status}
                      </span>
                      {" · "}{u.module}{u.model ? ` · ${u.model}` : ""}
                      {u.ms != null ? ` · ${u.ms}ms` : ""}
                      {u.tin != null && (u.tin > 0 || u.tout > 0) ? ` · ${u.tin}→${u.tout} tok` : ""}
                      {u.custo ? ` · US$ ${Number(u.custo).toFixed(6)}` : ""}
                      {u.erro ? ` · ${u.erro}` : ""}
                      {" · "}{new Date(u.quando).toLocaleTimeString("pt-BR")}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODELOS & MÓDULOS */}
        {aba === "modelos" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Modelos cadastrados</h3>
              <div className="space-y-2">
                {((dash?.modelos || []) as any[]).map((m: any) => (
                  <div key={m.model_code} className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 p-3">
                    <span>{PROVIDER_EMOJI[m.provider] || "⚪"}</span>
                    <span className="font-bold">{m.label}</span>
                    <code className="rounded bg-zinc-100 px-2 py-0.5 text-[11px]">{m.model_code}</code>
                    <span className="text-[11px] text-zinc-400">
                      US$ {Number(m.custo_input_mtok).toFixed(2)}/M in · US$ {Number(m.custo_output_mtok).toFixed(2)}/M out
                    </span>
                    <button onClick={() => salvarModelo(m, !m.ativo)}
                      className={`ml-auto rounded-full px-3 py-1 text-[11px] font-black ${m.ativo ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-400"}`}>
                      {m.ativo ? "ATIVO" : "inativo"}
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl bg-slate-50 p-3">
                <select value={novoModelo.provider} onChange={(e) => setNovoModelo({ ...novoModelo, provider: e.target.value })}
                  className="h-9 rounded-xl border border-zinc-200 bg-white px-2 text-sm">
                  {["openai", "anthropic", "google", "xai", "deepseek"].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input placeholder="model_code" value={novoModelo.model_code}
                  onChange={(e) => setNovoModelo({ ...novoModelo, model_code: e.target.value })}
                  className="h-9 w-48 rounded-xl border border-zinc-200 px-2 text-sm" />
                <input placeholder="Nome" value={novoModelo.label}
                  onChange={(e) => setNovoModelo({ ...novoModelo, label: e.target.value })}
                  className="h-9 w-36 rounded-xl border border-zinc-200 px-2 text-sm" />
                <input placeholder="US$/M in" value={novoModelo.custo_in}
                  onChange={(e) => setNovoModelo({ ...novoModelo, custo_in: e.target.value })}
                  className="h-9 w-24 rounded-xl border border-zinc-200 px-2 text-sm" />
                <input placeholder="US$/M out" value={novoModelo.custo_out}
                  onChange={(e) => setNovoModelo({ ...novoModelo, custo_out: e.target.value })}
                  className="h-9 w-24 rounded-xl border border-zinc-200 px-2 text-sm" />
                <button onClick={() => novoModelo.model_code && salvarModelo(novoModelo)}
                  className="flex h-9 items-center gap-1 rounded-xl bg-[#123a6b] px-3 text-xs font-black text-white">
                  <PlusCircle className="h-4 w-4" /> Adicionar
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Modelo por módulo (seleção inteligente)</h3>
              <div className="space-y-2">
                {((dash?.prefs || []) as any[]).map((p: any) => (
                  <div key={p.module} className="flex items-center gap-3 rounded-2xl border border-zinc-100 p-3">
                    <span className="w-28 font-bold capitalize">{p.module}</span>
                    <select value={p.model_code} onChange={(e) => setPref(p.module, e.target.value)}
                      className="h-9 flex-1 rounded-xl border border-zinc-200 bg-white px-2 text-sm">
                      {((dash?.modelos || []) as any[]).filter((m: any) => m.ativo).map((m: any) => (
                        <option key={m.model_code} value={m.model_code}>{m.label} ({m.provider})</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CONFIGURAÇÕES */}
        {aba === "config" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs text-zinc-400">
              🔒 A chave de API não é configurada aqui: ela vive apenas nos <b>secrets das Edge Functions</b>
              (OPENAI_API_KEY / ANTHROPIC_API_KEY) e nunca chega ao navegador nem aos logs.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(CONFIG_LABELS).map(([chave, label]) => {
                const atual = dash?.config?.[chave];
                return (
                  <div key={chave} className="flex items-center gap-2 rounded-2xl border border-zinc-100 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-zinc-600">{label}</p>
                      <input
                        defaultValue={typeof atual === "string" ? atual : JSON.stringify(atual)}
                        onChange={(e) => setCfgEdit({ ...cfgEdit, [chave]: e.target.value })}
                        className="mt-1 h-8 w-full rounded-lg border border-zinc-200 px-2 text-sm" />
                    </div>
                    <button onClick={() => salvarCfg(chave)}
                      className="rounded-xl bg-[#123a6b] px-3 py-1.5 text-[11px] font-black text-white">Salvar</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* HEALTH */}
        {aba === "health" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <button onClick={rodarHealth} disabled={testando}
              className="flex items-center gap-2 rounded-xl bg-[#123a6b] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
              {testando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Executar Health Check (inclui 1 chamada real de teste)
            </button>
            {health && (
              <div className="mt-4 space-y-3">
                <div>
                  <h4 className="text-sm font-black text-zinc-700">Chaves configuradas nos secrets</h4>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {Object.entries((health.chaves || {}) as Record<string, boolean>).map(([p, tem]) => (
                      <span key={p} className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${tem ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-400"}`}>
                        {tem ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {PROVIDER_EMOJI[p]} {p}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-black text-zinc-700">Teste real (latência ponta a ponta)</h4>
                  {health.teste?.ok ? (
                    <p className="mt-1 text-sm text-emerald-700">
                      ✅ {health.teste.provider} · {health.teste.model} respondeu: "{health.teste.texto}"
                      · {health.teste.tokens_in}→{health.teste.tokens_out} tokens
                      · US$ {Number(health.teste.custo_estimado || 0).toFixed(6)}
                      {health.teste.cache ? " · (cache)" : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-red-600">
                      ❌ Indisponível: {health.teste?.error || health.error} — solicitações caem no fail-safe (revisão manual). Nada se perde.
                    </p>
                  )}
                </div>
                {health.rate && (
                  <p className="text-xs text-zinc-400">
                    Consumo: {health.rate.minuto}/min · {health.rate.dia} hoje · {health.rate.mes} no mês
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION AI Gateway v1.0 · ORION-AI-00 · provedores: OpenAI + Anthropic (Gemini/Grok/DeepSeek prontos p/ cadastro)
          · cache + rate limit + retry + fallback + auditoria imutável
        </p>
      </div>
    </div>
  );
}
