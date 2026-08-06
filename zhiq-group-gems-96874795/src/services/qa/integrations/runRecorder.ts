/**
 * ORION-QA Fase 3 — gravação de execuções em qa_integration_runs.
 *
 * Melhor-esforço e assíncrono: falha de rede/permissão é logada e devolve
 * null — registrar uma run JAMAIS pode quebrar o módulo que executou.
 */
import { supabase } from "@/integrations/supabase/client";
import type { QaIntegrationRunInsert } from "../events/types";

export async function recordIntegrationRun(
  input: QaIntegrationRunInsert,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("qa_integration_runs")
      .insert(input)
      .select("id")
      .single();
    if (error) {
      console.warn(`[ORION-QA] falha ao registrar run de ${input.source}: ${error.message}`);
      return null;
    }
    return data.id;
  } catch (err) {
    console.warn(
      `[ORION-QA] erro inesperado ao registrar run de ${input.source}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

export async function finishIntegrationRun(
  runId: string,
  patch: Partial<QaIntegrationRunInsert>,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("qa_integration_runs")
      .update({ ...patch, finished_at: patch.finished_at ?? new Date().toISOString() })
      .eq("id", runId);
    if (error) {
      console.warn(`[ORION-QA] falha ao concluir run ${runId}: ${error.message}`);
    }
  } catch (err) {
    console.warn(
      `[ORION-QA] erro inesperado ao concluir run ${runId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
