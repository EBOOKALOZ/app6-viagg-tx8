/** Provider: Google Gemini — endpoint OpenAI-compatible */
export const geminiProvider = {
  name: "gemini" as const,
  baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  defaultModel: "gemini-2.0-flash",
  authHeader: (key: string) => ({ Authorization: `Bearer ${key}` }),
  supportsImages: true,       // Gemini Vision
  supportsVision: true,
  openAICompatible: true,
};
