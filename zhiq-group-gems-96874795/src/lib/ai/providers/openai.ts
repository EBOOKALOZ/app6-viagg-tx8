/** Provider: OpenAI — protocolo nativo chat/completions */
export const openaiProvider = {
  name: "openai" as const,
  baseUrl: "https://api.openai.com/v1",
  defaultModel: "gpt-4o-mini",
  authHeader: (key: string) => ({ Authorization: `Bearer ${key}` }),
  supportsImages: true,       // DALL-E 3 via /images/generations
  supportsVision: true,       // gpt-4o-vision
  openAICompatible: true,
};
