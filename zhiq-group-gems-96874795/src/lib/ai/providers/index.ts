/**
 * ai/providers/index.ts — Factory de provedores de IA.
 *
 * Para adicionar um novo provedor:
 *   1. Crie `./meu-provedor.ts` seguindo o mesmo padrão
 *   2. Adicione em PROVIDERS abaixo
 *   3. Adicione em PROVIDER_CONFIGS em `../config.ts`
 *   4. Altere ACTIVE_PROVIDER em `../config.ts`
 */

import { openaiProvider }  from "./openai";
import { deepseekProvider } from "./deepseek";
import { geminiProvider }   from "./gemini";
import { claudeProvider }   from "./claude";
import { ACTIVE_PROVIDER }  from "../config";

export type { AIProvider } from "../config";

const PROVIDERS = {
  openai:   openaiProvider,
  deepseek: deepseekProvider,
  gemini:   geminiProvider,
  claude:   claudeProvider,
} as const;

/** Provedor ativo baseado em ACTIVE_PROVIDER de config.ts */
export const activeProvider = PROVIDERS[ACTIVE_PROVIDER];

/** Lista todos os provedores disponíveis */
export function listProviders() {
  return Object.values(PROVIDERS);
}

/** Retorna config de um provedor pelo nome */
export function getProvider(name: keyof typeof PROVIDERS) {
  return PROVIDERS[name];
}
