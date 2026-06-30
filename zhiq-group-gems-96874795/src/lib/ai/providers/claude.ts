/**
 * Provider: Anthropic Claude
 *
 * ⚠️ REQUER ADAPTER: a API oficial da Anthropic não é compatível com OpenAI.
 *    Para usar Claude, a edge function `ai-chat` precisa detectar
 *    o protocolo "anthropic" e usar headers/body específicos:
 *      - Header: x-api-key + anthropic-version: 2023-06-01
 *      - Body: { model, messages, max_tokens } (sem temperature no top-level)
 *
 * Alternativas OpenAI-compatible:
 *    - AWS Bedrock com Claude (via OpenAI adapter)
 *    - OpenRouter (https://openrouter.ai) suporta Claude e OpenAI SDK
 */
export const claudeProvider = {
  name: "claude" as const,
  baseUrl: "https://api.anthropic.com/v1",
  defaultModel: "claude-haiku-4-5-20251001",
  authHeader: (key: string) => ({
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  }),
  supportsImages: true,       // Claude Vision
  supportsVision: true,
  openAICompatible: false,    // Requer adapter na edge function
};
