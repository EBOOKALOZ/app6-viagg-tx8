/**
 * Cliente de IA direto para o frontend (Uso Local/Testes)
 * Ele puxa as variáveis VITE_AIAPI_BASE_URL e VITE_AIAPI_KEY do seu .env.local
 * ATENÇÃO: Em produção, é melhor usar a Edge Function (aiapi.ts original) por segurança,
 * mas este arquivo é perfeito para testar diretamente do painel frontend.
 */

const BASE_URL = import.meta.env.VITE_AIAPI_BASE_URL || 'https://api.aiapi.world/v1';
const API_KEY = import.meta.env.VITE_AIAPI_KEY;

export async function chatCompletionDirect(
  message: string,
  model: string = 'claude-3-opus-20240229', // Pode trocar para claude-3-5-sonnet-20240620 se quiser
  systemPrompt?: string
): Promise<string> {
  if (!API_KEY) {
    throw new Error('A chave VITE_AIAPI_KEY não foi encontrada. Verifique seu arquivo .env.local');
  }

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: message });

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1024,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Erro na API: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('Erro ao chamar o provedor de IA:', error);
    throw error;
  }
}
