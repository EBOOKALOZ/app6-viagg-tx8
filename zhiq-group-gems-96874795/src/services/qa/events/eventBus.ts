/**
 * ORION-QA Fase 3 — Event Bus interno de QA.
 *
 * Pub/sub desacoplado: qualquer módulo emite eventos (`emit`) e qualquer
 * consumidor assina (`on`) sem que um conheça o outro. A persistência em
 * qa_events é apenas mais um assinante (a fila assíncrona), ligado na
 * composição do singleton (index.ts) — o core não conhece Supabase.
 *
 * Padrões de assinatura: tipo exato ("build.failed"), prefixo ("deploy.*")
 * ou tudo ("*"). Erro em um assinante é isolado — nunca derruba a emissão
 * nem os demais assinantes.
 */
import type { QaEventQueue } from "./eventQueue";
import type { QaEmittedEvent, QaEventInput, QaEventType } from "./types";

export type QaEventPattern = QaEventType | `${string}.*` | "*";

export type QaEventListener = (event: QaEmittedEvent) => void;

export interface QaEventBusLogger {
  warn(message: string): void;
}

function matches(pattern: QaEventPattern, type: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith(".*")) return type.startsWith(pattern.slice(0, -1));
  return pattern === type;
}

export class QaEventBus {
  private readonly listeners = new Map<QaEventPattern, Set<QaEventListener>>();
  private readonly logger: QaEventBusLogger;
  private queue: QaEventQueue | null = null;

  constructor(logger?: QaEventBusLogger) {
    this.logger = logger ?? { warn: (m) => console.warn(m) };
  }

  /** Liga a fila de persistência (feito uma única vez na composição). */
  attachQueue(queue: QaEventQueue): void {
    this.queue = queue;
  }

  /** Assina um padrão de eventos; retorna a função de cancelamento. */
  on(pattern: QaEventPattern, listener: QaEventListener): () => void {
    const set = this.listeners.get(pattern) ?? new Set<QaEventListener>();
    set.add(listener);
    this.listeners.set(pattern, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(pattern);
    };
  }

  /**
   * Emite um evento: normaliza (id próprio → entrega idempotente no retry),
   * notifica os assinantes locais e enfileira a persistência assíncrona.
   * Fire-and-forget: nunca lança — emitir evento não pode quebrar o emissor.
   */
  emit(input: QaEventInput): QaEmittedEvent {
    const event: QaEmittedEvent = {
      id: crypto.randomUUID(),
      type: input.type,
      title: input.title,
      source: input.source ?? "central",
      severity: input.severity ?? "info",
      module: input.module,
      environment: input.environment,
      issueId: input.issueId,
      runId: input.runId,
      releaseVersion: input.releaseVersion,
      git: input.git,
      payload: input.payload ?? {},
      emittedAt: new Date().toISOString(),
    };

    for (const [pattern, set] of this.listeners) {
      if (!matches(pattern, event.type)) continue;
      for (const listener of set) {
        try {
          listener(event);
        } catch (err) {
          this.logger.warn(
            `[ORION-QA] assinante de "${pattern}" falhou em ${event.type}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    this.queue?.enqueue(event);
    return event;
  }
}
