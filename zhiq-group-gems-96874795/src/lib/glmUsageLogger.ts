/**
 * @deprecated — arquivo movido para `@/lib/ai/usageLogger`.
 * Re-exportado aqui para compatibilidade com imports existentes.
 */
export {
  logAIUsage,
  logAIUsage as logGlmUsage,
} from "@/lib/ai/usageLogger";

export type {
  AICallContext,
  AICallContext  as GlmCallContext,
  AIUsagePayload,
  AIUsagePayload as GlmUsagePayload,
} from "@/lib/ai/usageLogger";
