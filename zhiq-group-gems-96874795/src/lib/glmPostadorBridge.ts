/**
 * @deprecated — arquivo movido para `@/lib/ai/postadorBridge`.
 * Re-exportado aqui para compatibilidade com imports existentes.
 */
export {
  bridgeProfileToPostador,
  bridgeAllProfilesToPostador,
  fetchPromotedSlotsByProfile,
  createPostingLotFromSlots,
} from "@/lib/ai/postadorBridge";

export type {
  ProfileType,
  PromotedSlot,
  BridgeResult,
} from "@/lib/ai/postadorBridge";
