/**
 * Idempotency helpers
 *
 * Toda operação financeira pública recebe uma idempotency_key. Se o cliente
 * tentar de novo (refresh, retry, double-click), o servidor reconhece e
 * retorna o mesmo resultado sem reprocessar.
 *
 * Estratégia: o frontend gera UUID v4 ANTES de enviar e mantém o mesmo UUID
 * em retries. Servidor armazena (key, response_hash) e usa como cache.
 */

import type { IdempotencyKey } from './types';

/**
 * Gera uma chave de idempotência única (UUID v4).
 * Use uma chave nova POR INTENÇÃO — não por retry.
 *
 * Ex: usuário clica em "Pagar" → gera key, guarda em ref/state, envia.
 * Se a request falhar (timeout, rede), REUSE a mesma key no retry.
 */
export function newIdempotencyKey(): IdempotencyKey {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback simples — ambientes sem crypto.randomUUID
  return 'idem-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

/**
 * Gera idempotency key determinística a partir de uma operação + referência.
 * Útil para garantir que webhook+nossa-RPC cheguem ao mesmo registro mesmo
 * sem coordenação prévia.
 *
 * Atenção: 2 operações distintas com o mesmo input geram a MESMA key —
 * use só quando isso for desejado (ex: webhook do gateway).
 */
export function deterministicIdempotencyKey(
  operation: string,
  reference: string,
): IdempotencyKey {
  return `${operation}:${reference}`;
}

/**
 * Hook React para gerar e PRESERVAR uma idempotency key durante o ciclo
 * de vida de um formulário/intenção. Garante que retries usem a mesma key.
 *
 * Uso:
 *   const idemKey = useIdempotencyKey();          // gerada uma vez
 *   await pay.charge({ idempotency_key: idemKey, ... });
 *   // Se der erro de rede e o user clicar de novo → mesma key → cache hit
 */
export function makeIdempotencyKeyRef(): {
  current: IdempotencyKey;
  reset: () => void;
} {
  let current = newIdempotencyKey();
  return {
    get current() {
      return current;
    },
    reset() {
      current = newIdempotencyKey();
    },
  };
}
