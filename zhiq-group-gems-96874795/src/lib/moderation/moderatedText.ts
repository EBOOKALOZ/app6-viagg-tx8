/**
 * moderatedText — porta ÚNICA de moderação de texto para todos os anúncios da VIAGG-TX8.
 *
 * Invocado no momento em que o usuário clica para salvar/publicar um anúncio.
 * Analisa título, descrição, categoria e preço através da Edge Function `moderate-text`.
 *
 * Retorna o veredito da IA:
 *  • status: "approved" | "manual_review" | "blocked"
 *  • reason: justificativa detalhada
 *  • logId: ID do registro salvo em ridv_decisions_log
 */
import { supabase } from "@/integrations/supabase/client";

export interface TextModerationResult {
  status: "approved" | "manual_review" | "blocked";
  logId: string | null;
  confidence: number;
  categoryViolation: string;
  reason: string;
  verdict: string;
}

export async function moderatedText(opts: {
  title?: string;
  description?: string;
  category: string;
  price?: string | number;
  listingId?: string;
}): Promise<TextModerationResult> {
  const { data, error } = await supabase.functions.invoke("moderate-text", {
    body: {
      title: opts.title ?? "",
      description: opts.description ?? "",
      category: opts.category,
      price: opts.price ?? null,
      listing_id: opts.listingId ?? null,
    },
  });

  if (error) {
    throw new Error(error.message || "Erro na comunicação com o serviço de moderação de texto");
  }

  if (!data?.ok) {
    throw new Error(data?.error || "Falha ao processar a moderação de texto");
  }

  return {
    status: data.status,
    logId: data.log_id ?? null,
    confidence: Number(data.confidence ?? 0),
    categoryViolation: String(data.category_violation ?? "outro"),
    reason: String(data.reason ?? ""),
    verdict: String(data.verdict ?? "revisao"),
  };
}
