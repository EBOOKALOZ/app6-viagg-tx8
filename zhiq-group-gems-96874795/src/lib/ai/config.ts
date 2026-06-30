/**
 * ai/config.ts — Configuração central do provedor de IA.
 *
 * ÚNICO ARQUIVO a alterar para trocar de provedor em toda a plataforma.
 * Altere ACTIVE_PROVIDER e o modelo correspondente em PROVIDER_CONFIGS.
 *
 * Env vars necessárias no Supabase (Edge Functions → Secrets):
 *   AI_API_KEY      — chave do provedor ativo (genérica, prioritária)
 *   AIAPI_BASE_URL  — base URL do provedor ativo (sobrescreve o padrão abaixo)
 *
 *   Legado (fallback):
 *     OPENAI_API_KEY, AIAPI_KEY, GLM_API_KEY
 */

export type AIProvider = "openai" | "deepseek" | "gemini" | "claude";

/** Protocolo de autenticação e request */
export type AIProtocol =
  | "openai"      // Authorization: Bearer — formato chat/completions
  | "anthropic";  // x-api-key + anthropic-version — formato messages (requer adapter)

export interface AIProviderConfig {
  provider: AIProvider;
  protocol: AIProtocol;
  model: string;
  baseUrl: string;
  /** Nome do env var da chave no Supabase */
  envKeyName: string;
  /** Se verdadeiro, a edge function ai-chat precisa de adapter customizado */
  requiresCustomAdapter?: boolean;
}

/** Configurações por provedor */
export const PROVIDER_CONFIGS: Record<AIProvider, AIProviderConfig> = {
  openai: {
    provider: "openai",
    protocol: "openai",
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    envKeyName: "OPENAI_API_KEY",
  },
  deepseek: {
    provider: "deepseek",
    protocol: "openai",          // DeepSeek é compatível com OpenAI SDK
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/v1",
    envKeyName: "DEEPSEEK_API_KEY",
  },
  gemini: {
    provider: "gemini",
    protocol: "openai",          // Gemini tem endpoint OpenAI-compatible
    model: "gemini-2.0-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    envKeyName: "GEMINI_API_KEY",
  },
  claude: {
    provider: "claude",
    protocol: "anthropic",       // Requer adapter: header x-api-key + anthropic-version
    model: "claude-haiku-4-5-20251001",
    baseUrl: "https://api.anthropic.com/v1",
    envKeyName: "ANTHROPIC_API_KEY",
    requiresCustomAdapter: true,
  },
};

// ─── ÚNICA LINHA A ALTERAR PARA TROCAR DE PROVEDOR ───────────────────────────
export const ACTIVE_PROVIDER: AIProvider = "openai";
// ─────────────────────────────────────────────────────────────────────────────

/** Configuração do provedor ativo */
export const AI_CONFIG: AIProviderConfig = PROVIDER_CONFIGS[ACTIVE_PROVIDER];

/** Modelo padrão (usado pelo frontend ao chamar chatCompletion sem model explícito) */
export const AI_MODEL = AI_CONFIG.model;

/** Base URL padrão do provedor ativo */
export const AI_BASE_URL = AI_CONFIG.baseUrl;

/**
 * Tabela de log de uso da IA.
 * Quando a migration `supabase/migrations/rename_ai_usage_table.sql` for executada,
 * altere para "ai_usage_log".
 */
export const AI_USAGE_TABLE = "glm_usage_log" as const;
