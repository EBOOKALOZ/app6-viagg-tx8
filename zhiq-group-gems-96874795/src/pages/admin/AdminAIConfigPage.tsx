import { useState, useEffect }       from "react";
import { useAIConfig, type AIConfig } from "@/hooks/useAIConfig";
import { PROVIDER_CONFIGS }           from "@/lib/ai/config";
import {
  BrainCircuit, Save, Loader2, CheckCircle2, AlertCircle, Zap,
  Bot, Key, Thermometer, Hash, Link2, TestTube2, Info,
} from "lucide-react";

/* ── Tipos auxiliares ───────────────────────────────────────────────────── */

type Provider = "openai" | "deepseek" | "gemini" | "claude";

interface ProviderMeta {
  id:          Provider;
  name:        string;
  description: string;
  icon:        string;
  color:       string;
  border:      string;
  models:      string[];
  keyName:     string;
  note?:       string;
}

/* ── Metadados dos provedores ───────────────────────────────────────────── */

const PROVIDERS: ProviderMeta[] = [
  {
    id:          "openai",
    name:        "OpenAI",
    description: "GPT-5 Mini e família GPT — compatibilidade máxima",
    icon:        "🟢",
    color:       "from-emerald-500/20 to-emerald-600/5",
    border:      "border-emerald-500/40",
    models:      ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
    keyName:     "AI_API_KEY ou OPENAI_API_KEY",
  },
  {
    id:          "deepseek",
    name:        "DeepSeek",
    description: "Modelos DeepSeek — custo-benefício superior",
    icon:        "🔵",
    color:       "from-blue-500/20 to-blue-600/5",
    border:      "border-blue-500/40",
    models:      ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
    keyName:     "DEEPSEEK_API_KEY",
  },
  {
    id:          "gemini",
    name:        "Google Gemini",
    description: "Gemini Flash/Pro via endpoint OpenAI-compatível",
    icon:        "🔴",
    color:       "from-red-500/20 to-red-600/5",
    border:      "border-red-500/40",
    models:      ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    keyName:     "GEMINI_API_KEY",
  },
  {
    id:          "claude",
    name:        "Anthropic Claude",
    description: "Claude Haiku/Sonnet — requer adaptador custom",
    icon:        "🟠",
    color:       "from-orange-500/20 to-orange-600/5",
    border:      "border-orange-500/40",
    models:      ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-8"],
    keyName:     "ANTHROPIC_API_KEY",
    note:        "Protocolo diferente de OpenAI — pode exigir adaptador.",
  },
];

/* ── Componente principal ───────────────────────────────────────────────── */

export default function AdminAIConfigPage() {
  const { config, isLoading, isError, saveConfig, isSaving, saveError } = useAIConfig();

  const [form,        setForm]        = useState<Omit<AIConfig, "updated_at"> | null>(null);
  const [testStatus,  setTestStatus]  = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [saved,       setSaved]       = useState(false);

  // Sincroniza form com dados do banco quando carregados
  useEffect(() => {
    if (config && !form) {
      setForm({
        provider:    config.provider,
        model:       config.model,
        base_url:    config.base_url,
        temperature: config.temperature,
        max_tokens:  config.max_tokens,
        notes:       config.notes ?? "",
      });
    }
  }, [config]);

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-orange-400" size={32} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-3 p-6 bg-red-900/20 border border-red-500/30 rounded-xl m-8">
        <AlertCircle className="text-red-400 shrink-0" size={20} />
        <p className="text-red-300 text-sm">
          Erro ao carregar configurações. Verifique se a migration <code>create_ai_platform_config.sql</code> foi executada.
        </p>
      </div>
    );
  }

  const selectedProvider = PROVIDERS.find(p => p.id === form.provider) ?? PROVIDERS[0];

  function pickProvider(p: ProviderMeta) {
    const cfg = PROVIDER_CONFIGS[p.id];
    setForm(f => f ? {
      ...f,
      provider: p.id,
      model:    cfg.model,
      base_url: cfg.baseUrl,
    } : f);
    setTestStatus("idle");
  }

  function pickModel(model: string) {
    setForm(f => f ? { ...f, model } : f);
  }

  async function handleSave() {
    if (!form) return;
    setSaved(false);
    try {
      await saveConfig(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // erro exibido via saveError
    }
  }

  async function handleTestConnection() {
    setTestStatus("testing");
    setTestMessage("");
    try {
      // Usa o client.ts que já lê a config do banco
      const { chatCompletion } = await import("@/lib/ai/client");
      const resp = await chatCompletion(
        "Responda apenas: OK",
        form.model,
        "Você é um sistema de diagnóstico. Responda com uma única palavra.",
        { operationType: "test", module: "admin-config" },
      );
      setTestStatus("ok");
      setTestMessage(resp.trim().slice(0, 80));
    } catch (e: any) {
      setTestStatus("fail");
      setTestMessage(e?.message ?? "Falha na conexão");
    }
  }

  return (
    <div className="min-h-screen bg-[#0D0F12] text-[#F5F7FA] p-6 space-y-8">

      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-orange-500/15 border border-orange-500/25">
          <BrainCircuit className="text-orange-400" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Configuração da IA</h1>
          <p className="text-sm text-[#A7B0BE]">
            Provedor, modelo e parâmetros usados em toda a plataforma
          </p>
        </div>
      </div>

      {/* ── Seletor de provedor ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#A7B0BE] uppercase tracking-wider">
          Provedor de IA
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {PROVIDERS.map(p => {
            const active = form.provider === p.id;
            return (
              <button
                key={p.id}
                onClick={() => pickProvider(p)}
                className={[
                  "relative text-left p-4 rounded-xl border transition-all",
                  "hover:scale-[1.01] active:scale-[0.99]",
                  active
                    ? `bg-gradient-to-br ${p.color} ${p.border} border-2 shadow-lg`
                    : "bg-[#1B1F24] border-[#2A3038] hover:border-[#3A4048]",
                ].join(" ")}
              >
                {active && (
                  <span className="absolute top-3 right-3">
                    <CheckCircle2 size={14} className="text-white/70" />
                  </span>
                )}
                <span className="text-2xl">{p.icon}</span>
                <p className="mt-2 font-semibold text-sm text-white">{p.name}</p>
                <p className="mt-0.5 text-xs text-[#A7B0BE] leading-snug">{p.description}</p>
                {p.note && (
                  <p className="mt-1.5 text-xs text-yellow-400/80 leading-snug">{p.note}</p>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Linha: modelo + base URL ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Modelo */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#A7B0BE] uppercase tracking-wider">
            <Bot size={14} />
            Modelo
          </h2>
          <div className="bg-[#1B1F24] border border-[#2A3038] rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 gap-2">
              {selectedProvider.models.map(m => (
                <button
                  key={m}
                  onClick={() => pickModel(m)}
                  className={[
                    "text-left px-3 py-2 rounded-lg border text-sm transition-all",
                    form.model === m
                      ? "bg-orange-500/15 border-orange-500/40 text-orange-300 font-medium"
                      : "border-[#2A3038] text-[#A7B0BE] hover:border-[#3A4048] hover:text-white",
                  ].join(" ")}
                >
                  {m}
                </button>
              ))}
            </div>
            {/* Campo livre para modelo customizado */}
            <div>
              <label className="text-xs text-[#A7B0BE] mb-1 block">Ou insira manualmente:</label>
              <input
                type="text"
                value={form.model}
                onChange={e => setForm(f => f ? { ...f, model: e.target.value } : f)}
                className="w-full bg-[#0D0F12] border border-[#2A3038] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50 placeholder:text-[#4A5568]"
                placeholder="nome-do-modelo"
              />
            </div>
          </div>
        </section>

        {/* Base URL */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#A7B0BE] uppercase tracking-wider">
            <Link2 size={14} />
            Base URL
          </h2>
          <div className="bg-[#1B1F24] border border-[#2A3038] rounded-xl p-4 space-y-3">
            <input
              type="text"
              value={form.base_url}
              onChange={e => setForm(f => f ? { ...f, base_url: e.target.value } : f)}
              className="w-full bg-[#0D0F12] border border-[#2A3038] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-orange-500/50"
              placeholder="https://api.openai.com/v1"
            />
            <p className="text-xs text-[#A7B0BE] leading-relaxed">
              Usado pela Edge Function <code className="text-orange-300 bg-orange-900/20 px-1 rounded">ai-chat</code> como
              endpoint do provedor. Preenchido automaticamente ao trocar de provedor.
            </p>

            {/* Chave de API necessária */}
            <div className="flex gap-2 items-start p-3 bg-yellow-900/10 border border-yellow-700/25 rounded-lg">
              <Key size={14} className="text-yellow-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-yellow-300">Chave de API necessária</p>
                <p className="text-xs text-yellow-400/80 mt-0.5 font-mono">
                  {selectedProvider.keyName}
                </p>
                <p className="text-xs text-[#A7B0BE] mt-1">
                  Configure nos Secrets da Edge Function no painel do Supabase.
                  A chave nunca transita pelo frontend.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── Parâmetros de geração ────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#A7B0BE] uppercase tracking-wider">
          <Zap size={14} />
          Parâmetros de Geração
        </h2>
        <div className="bg-[#1B1F24] border border-[#2A3038] rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Temperature */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-sm font-medium text-white">
                <Thermometer size={14} className="text-orange-400" />
                Temperatura
              </label>
              <span className="text-lg font-bold text-orange-400">
                {Number(form.temperature).toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0} max={2} step={0.05}
              value={form.temperature}
              onChange={e => setForm(f => f ? { ...f, temperature: parseFloat(e.target.value) } : f)}
              className="w-full accent-orange-500"
            />
            <div className="flex justify-between text-xs text-[#A7B0BE]">
              <span>0 — Determinístico</span>
              <span>1 — Balanceado</span>
              <span>2 — Criativo</span>
            </div>
            <div className="flex items-start gap-2 p-2.5 bg-[#0D0F12] rounded-lg border border-[#2A3038]">
              <Info size={12} className="text-[#A7B0BE] mt-0.5 shrink-0" />
              <p className="text-xs text-[#A7B0BE]">
                Valores entre 0.3–0.8 são ideais para respostas consistentes.
                Use 1.0+ para textos criativos como anúncios.
              </p>
            </div>
          </div>

          {/* Max Tokens */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-sm font-medium text-white">
                <Hash size={14} className="text-orange-400" />
                Máximo de Tokens
              </label>
              <span className="text-lg font-bold text-orange-400">
                {form.max_tokens.toLocaleString("pt-BR")}
              </span>
            </div>
            <input
              type="range"
              min={64} max={8192} step={64}
              value={form.max_tokens}
              onChange={e => setForm(f => f ? { ...f, max_tokens: parseInt(e.target.value) } : f)}
              className="w-full accent-orange-500"
            />
            <div className="flex justify-between text-xs text-[#A7B0BE]">
              <span>64</span>
              <span>4 096</span>
              <span>8 192</span>
            </div>
            <input
              type="number"
              min={64} max={128000}
              value={form.max_tokens}
              onChange={e => setForm(f => f ? { ...f, max_tokens: Math.max(64, parseInt(e.target.value) || 64) } : f)}
              className="w-full bg-[#0D0F12] border border-[#2A3038] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50"
            />
          </div>
        </div>
      </section>

      {/* ── Notas ───────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[#A7B0BE] uppercase tracking-wider">
          Notas internas (opcional)
        </h2>
        <textarea
          rows={2}
          value={form.notes ?? ""}
          onChange={e => setForm(f => f ? { ...f, notes: e.target.value } : f)}
          placeholder="Ex: Migrado para DeepSeek em 25/06 para redução de custos…"
          className="w-full bg-[#1B1F24] border border-[#2A3038] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-orange-500/50 placeholder:text-[#4A5568] resize-none"
        />
      </section>

      {/* ── Ações ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 pt-2 pb-6">

        {/* Testar conexão */}
        <button
          onClick={handleTestConnection}
          disabled={testStatus === "testing" || isSaving}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1B1F24] border border-[#2A3038] hover:border-[#3A4048] rounded-xl text-sm text-[#F5F7FA] transition-all disabled:opacity-50"
        >
          {testStatus === "testing"
            ? <Loader2 size={14} className="animate-spin" />
            : <TestTube2 size={14} className="text-cyan-400" />}
          Testar Conexão
        </button>

        {/* Resultado do teste */}
        {testStatus === "ok" && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-400">
            <CheckCircle2 size={14} />
            Conectado — &ldquo;{testMessage}&rdquo;
          </span>
        )}
        {testStatus === "fail" && (
          <span className="flex items-center gap-1.5 text-sm text-red-400">
            <AlertCircle size={14} />
            {testMessage}
          </span>
        )}

        <div className="flex-1" />

        {/* Salvar */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/50 rounded-xl text-sm font-semibold text-white transition-all"
        >
          {isSaving
            ? <Loader2 size={14} className="animate-spin" />
            : saved
              ? <CheckCircle2 size={14} />
              : <Save size={14} />}
          {isSaving ? "Salvando…" : saved ? "Salvo!" : "Salvar Configuração"}
        </button>

        {saveError && (
          <p className="w-full text-xs text-red-400 flex items-center gap-1">
            <AlertCircle size={12} />
            {(saveError as Error)?.message ?? "Erro ao salvar"}
          </p>
        )}
      </div>

      {/* ── Info: quando entra em vigor ─────────────────────────────────── */}
      <div className="flex gap-3 items-start p-4 bg-[#1B1F24] border border-[#2A3038] rounded-xl">
        <Info size={16} className="text-[#A7B0BE] mt-0.5 shrink-0" />
        <div className="text-sm text-[#A7B0BE] space-y-1">
          <p className="font-medium text-white">Como a configuração é aplicada</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            <li>A configuração é salva no banco e entra em vigor em até <strong className="text-white">60 segundos</strong> (cache TTL).</li>
            <li>O frontend e a Edge Function <code>ai-chat</code> lêem a config do banco — sem necessidade de redeploy.</li>
            <li>A chave de API <strong className="text-white">não</strong> é armazenada aqui — deve estar nos Secrets do Supabase.</li>
            <li>O botão "Testar Conexão" usa a configuração <em>atualmente no formulário</em> (não salva ainda).</li>
          </ul>
        </div>
      </div>

    </div>
  );
}
