/**
 * useGlmPostador.ts
 * Hook React para disparar a ponte GLM → Postador a partir do painel do anunciante.
 */

import { useState, useCallback } from "react";
import {
  bridgeProfileToPostador,
  type ProfileType,
  type BridgeResult,
} from "@/lib/glmPostadorBridge";

interface GlmPostadorState {
  sending: boolean;
  result: BridgeResult | null;
  error: string | null;
}

export function useGlmPostador(profile: ProfileType) {
  const [state, setState] = useState<GlmPostadorState>({
    sending: false,
    result: null,
    error: null,
  });

  const sendToPostador = useCallback(async () => {
    setState({ sending: true, result: null, error: null });
    try {
      const result = await bridgeProfileToPostador(profile);
      setState({ sending: false, result, error: null });
      return result;
    } catch (err: any) {
      const msg = err?.message ?? "Erro ao enviar ao Postador";
      setState({ sending: false, result: null, error: msg });
      return null;
    }
  }, [profile]);

  const reset = useCallback(() => {
    setState({ sending: false, result: null, error: null });
  }, []);

  return { ...state, sendToPostador, reset };
}
