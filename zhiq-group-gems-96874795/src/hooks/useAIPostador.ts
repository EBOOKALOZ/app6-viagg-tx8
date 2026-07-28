/**
 * useAIPostador — Hook React para disparar a ponte IA → Postador.
 */
import { useState, useCallback } from "react";
import {
  bridgeProfileToPostador,
  type ProfileType,
  type BridgeResult,
} from "@/lib/ai/postadorBridge";

interface AIPostadorState {
  sending: boolean;
  result:  BridgeResult | null;
  error:   string | null;
}

export function useAIPostador(profile: ProfileType) {
  const [state, setState] = useState<AIPostadorState>({ sending: false, result: null, error: null });

  const sendToPostador = useCallback(async () => {
    setState({ sending: true, result: null, error: null });
    try {
      const result = await bridgeProfileToPostador(profile);
      setState({ sending: false, result, error: null });
      return result;
    } catch (err: unknown) {
      const msg = err?.message ?? "Erro ao enviar ao Impulsionar";
      setState({ sending: false, result: null, error: msg });
      return null;
    }
  }, [profile]);

  const reset = useCallback(() => setState({ sending: false, result: null, error: null }), []);

  return { ...state, sendToPostador, sendToImpulsionar: sendToPostador, reset };
}

/** Aliases */
export const useGlmPostador = useAIPostador;
export const useAIImpulsionar = useAIPostador;
