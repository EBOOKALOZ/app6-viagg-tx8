import { supabase } from "@/integrations/supabase/client";
const MODEL = "gpt-4o-mini";
const KIND_LABEL: Record<"imovel" | "veiculo" | "servico", string> = {
  imovel: "imóvel",
  veiculo: "veículo",
  servico: "serviço",
};

const KIND_VERB: Record<"imovel" | "veiculo" | "servico", string> = {
  imovel: "venda",
  veiculo: "venda",
  servico: "divulgação",
};

/**
 * Gera, via IA (GLM-4 Plus), uma descrição de anúncio com exatamente 12 linhas,
 * a partir dos campos já preenchidos pelo anunciante no formulário.
 */
export async function generateListingDescription(
  kind: "imovel" | "veiculo" | "servico",
  fields: Record<string, string | number | null | undefined>
): Promise<string> {
  const fieldLines = Object.entries(fields)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const prompt = `Escreva uma descrição de anúncio para a ${KIND_VERB[kind]} de um ${KIND_LABEL[kind]}, em português do Brasil, com EXATAMENTE 12 linhas (uma frase curta por linha, sem numerar, sem markdown, sem usar aspas). Tom comercial, direto e atraente para um marketplace. Não invente características que não foram informadas abaixo. Não inclua telefone, e-mail ou o preço exato.\n\nDados informados:\n${fieldLines}`;

  const { data, error } = await supabase.functions.invoke("ai-chat", {
    body: {
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "Você é um redator especialista em anúncios de marketplace. Responda apenas com o texto da descrição solicitada, sem comentários, sem títulos e sem numeração de linhas.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 700,
      temperature: 0.8,
    },
  });

  if (error) throw new Error(error.message || "Falha ao gerar descrição com IA.");

  const content = (data as any)?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string" || !content.trim()) {
    throw new Error("A IA não retornou uma descrição válida.");
  }
  return content.trim();
}
