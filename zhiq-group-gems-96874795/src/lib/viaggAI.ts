/**
 * IA Viagg-TX8 — serviço central de inteligência artificial.
 * Toda comunicação com o provedor de IA (GLM) passa por aqui.
 * O provedor pode ser trocado sem alterar o restante da aplicação.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const AI_ENDPOINT = `${SUPABASE_URL}/functions/v1/viagg-ai`;

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIOptions {
  /** Contexto adicional injetado no prompt do sistema */
  context?: string;
  maxTokens?: number;
}

export interface AIResponse {
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

async function callAI(messages: AIMessage[], options?: AIOptions): Promise<AIResponse> {
  const res = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      messages,
      context: options?.context,
      maxTokens: options?.maxTokens,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const msg = `IA Viagg-TX8: HTTP ${res.status} — ${body.slice(0, 200)}`;
    console.error("[ViaggAI]", msg);
    throw new Error(msg);
  }

  const text = await res.text();
  let data: AIResponse;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("[ViaggAI] resposta não-JSON:", text.slice(0, 300));
    throw new Error("IA Viagg-TX8: resposta inválida do servidor.");
  }

  // A edge function retorna { content, error? } mesmo quando a OpenAI falha.
  // Se vier campo 'error', loga mas devolve o content amigável ao usuário.
  if ((data as any).error) {
    console.error("[ViaggAI] erro reportado pela edge function:", (data as any).error);
  }

  return data;
}

export const viaggAI = {
  /**
   * Envia uma pergunta simples e retorna a resposta como texto.
   */
  async ask(question: string, options?: AIOptions): Promise<string> {
    const { content } = await callAI([{ role: "user", content: question }], options);
    return content;
  },

  /**
   * Conversa com histórico completo de mensagens.
   */
  async chat(messages: AIMessage[], options?: AIOptions): Promise<AIResponse> {
    return callAI(messages, options);
  },

  /**
   * Calcula preço de corrida com análise da IA.
   */
  async suggestRidePrice(params: {
    distanceKm: number;
    durationMin: number;
    city?: string;
    packageDescription?: string;
    basePrice: number;
  }): Promise<string> {
    const prompt = `
Analise esta corrida de motoboy e forneça uma análise sucinta (máx 2 frases) sobre o preço calculado de R$${params.basePrice.toFixed(2)}:
- Distância: ${params.distanceKm} km
- Tempo estimado: ${params.durationMin} min
- Cidade: ${params.city ?? "não informada"}
- Descrição do pacote: ${params.packageDescription ?? "não informado"}
Seja objetivo e confirme se o preço é justo ou faça uma observação relevante.`.trim();

    return viaggAI.ask(prompt, { maxTokens: 150 });
  },

  /**
   * Assistente de solicitação: valida/orienta o preenchimento do formulário.
   */
  async validateRideRequest(fields: {
    visitorName: string;
    originAddress: string;
    destinationAddress: string;
    packageDescription?: string;
  }): Promise<string> {
    const prompt = `
Analise o formulário de solicitação de motoboy e forneça orientação breve (máx 2 frases):
- Nome: ${fields.visitorName}
- Origem: ${fields.originAddress}
- Destino: ${fields.destinationAddress}
- Pacote: ${fields.packageDescription ?? "não informado"}
Se estiver tudo ok, confirme. Caso contrário, aponte o problema mais importante.`.trim();

    return viaggAI.ask(prompt, { maxTokens: 120 });
  },
};
