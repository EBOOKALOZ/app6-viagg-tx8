import { supabase } from "@/integrations/supabase/client";
import type { AIEngineRequest, AIEngineResponse } from "@/types/aiEngine";

export async function callAIEngine(
  req: AIEngineRequest
): Promise<AIEngineResponse> {
  // Passo 1: RPC cria o registro pending e retorna execution_id
  // O servidor resolve o prompt, interpola variáveis e salva a config.
  const { data: callData, error: callError } = await supabase.rpc(
    "ai_engine_call",
    {
      p_module:   req.module,
      p_action:   req.action,
      p_profile:  req.profile  ?? null,
      p_context:  req.context  ?? {},
      p_language: req.language ?? "pt-BR",
    }
  );

  if (callError) {
    throw new Error(`Motor IA — RPC falhou: ${callError.message}`);
  }

  const { execution_id } = callData as { execution_id: string };

  // Passo 2: Edge Function busca o prompt do DB, chama Claude e loga resultado
  const { data: gwData, error: gwError } = await supabase.functions.invoke(
    "ai-engine-gateway",
    { body: { execution_id } }
  );

  if (gwError) {
    throw new Error(`Motor IA — Gateway falhou: ${gwError.message}`);
  }

  // gwData pode vir com campo 'error' em caso de falha dentro da Edge Function
  if (gwData?.error) {
    throw new Error(`Motor IA — ${gwData.error}`);
  }

  return gwData as AIEngineResponse;
}
