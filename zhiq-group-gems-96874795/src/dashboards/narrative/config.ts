/**
 * M59.2 · Configuração da camada narrativa.
 * O modo generativo nasce DESLIGADO [ligar-pós-deploy, decisão de produto]:
 * o determinístico é o padrão oficial e está sempre disponível.
 */

export const NARRATIVE_GENERATIVE_ENABLED = false; // [ligar-pós-deploy]

/** Timeout do adaptador generativo antes do fallback automático. */
export const NARRATIVE_GENERATIVE_TIMEOUT_MS = 8000;
