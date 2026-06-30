/**
 * @deprecated — arquivo movido para `@/lib/ai/client`.
 * Re-exportado aqui para compatibilidade com imports existentes.
 * Novos módulos devem importar de `@/lib/ai/client`.
 */
export { chatCompletion, default } from "@/lib/ai/client";
export type { AICallContext as GlmCallContext } from "@/lib/ai/usageLogger";
