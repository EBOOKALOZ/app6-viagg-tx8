/** Provider: DeepSeek — compatível com OpenAI SDK */
export const deepseekProvider = {
  name: "deepseek" as const,
  baseUrl: "https://api.deepseek.com/v1",
  defaultModel: "deepseek-chat",
  authHeader: (key: string) => ({ Authorization: `Bearer ${key}` }),
  supportsImages: false,
  supportsVision: false,
  openAICompatible: true,
};
