/**
 * @deprecated — arquivo movido para `@/lib/ai/cardCapture`.
 * Re-exportado aqui para compatibilidade com imports existentes.
 */
export {
  fetchActiveCardSlots,
  captureCardAsImage,
  captureAndQueueCards,
} from "@/lib/ai/cardCapture";

export type {
  CardListingType,
  CardSlotData,
  AICaptureResult,
  AICaptureResult  as GlmCaptureResult,
  PostadorQueueItem,
} from "@/lib/ai/cardCapture";
