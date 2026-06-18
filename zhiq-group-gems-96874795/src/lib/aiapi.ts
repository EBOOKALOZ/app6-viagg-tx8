import { supabase } from '@/integrations/supabase/client';

/**
 * Cliente de IA — proxy server-side via Edge Function `ai-chat`.
 *
 * NUNCA usar a chave da AIAPI (sk-...) diretamente no frontend.
 * A chave vive exclusivamente no servidor (Deno.env.get("AIAPI_KEY")).
 * Esta função apenas repassa a chamada autenticada pelo JWT do Supabase.
 */
export async function chatCompletion(
  message: string,
  model: string = 'glm-5.2',
  systemPrompt?: string
): Promise<string> {
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: message });

  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: { messages, model },
  });

  if (error) {
    throw error;
  }

  const choices = (data as { choices?: Array<{ message?: { content?: string } }> })?.choices;
  return choices?.[0]?.message?.content || '';
}

export default { chatCompletion };
