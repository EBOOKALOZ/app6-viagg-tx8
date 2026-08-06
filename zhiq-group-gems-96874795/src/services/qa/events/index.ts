/**
 * ORION-QA Fase 3 — composição do Event Bus de produção.
 *
 * Singleton: bus + fila assíncrona + transporte Supabase (INSERT em
 * qa_events). Conflito de chave primária (23505) = evento já entregue em um
 * retry anterior → tratado como sucesso (entrega idempotente). Erros de
 * permissão/validação não são retentáveis; falhas de rede são.
 */
import { supabase } from "@/integrations/supabase/client";
import { QaEventBus } from "./eventBus";
import {
  createLocalQueueStorage,
  QaEventQueue,
  type QaDeliveryResult,
  type QaEventTransport,
} from "./eventQueue";
import { toQaEventInsert, type QaEmittedEvent } from "./types";

/** Códigos Postgres que indicam erro definitivo (retry seria inútil). */
const NON_RETRYABLE_CODES = new Set([
  "23502", // not_null_violation
  "23503", // foreign_key_violation
  "23514", // check_violation
  "42501", // insufficient_privilege (RLS)
  "22P02", // invalid_text_representation
]);

const supabaseTransport: QaEventTransport = {
  async deliver(event: QaEmittedEvent): Promise<QaDeliveryResult> {
    const { error } = await supabase.from("qa_events").insert(toQaEventInsert(event));
    if (!error) return { ok: true };
    if (error.code === "23505") return { ok: true }; // já entregue (retry idempotente)
    return {
      ok: false,
      retryable: !NON_RETRYABLE_CODES.has(error.code),
      error: `${error.code ?? "?"}: ${error.message}`,
    };
  },
};

export const qaEventQueue = new QaEventQueue({
  transport: supabaseTransport,
  storage: createLocalQueueStorage(),
});

export const qaEventBus = new QaEventBus();
qaEventBus.attachQueue(qaEventQueue);

/** Atalho para emissores: emite e retorna o evento normalizado. */
export const emitQaEvent = qaEventBus.emit.bind(qaEventBus);

export { QaEventBus } from "./eventBus";
export {
  QaEventQueue,
  createLocalQueueStorage,
  createMemoryQueueStorage,
  type QaDeliveryResult,
  type QaEventTransport,
  type QaQueueStorage,
} from "./eventQueue";
export * from "./types";
