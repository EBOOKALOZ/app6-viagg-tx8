/**
 * ORION-QA Fase 3 — fila assíncrona de entrega de eventos.
 *
 * Requisitos da seção 15 (Performance): toda integração é assíncrona, com
 * fila, retry (backoff exponencial), timeout, logs e cache (dedupe).
 *
 * A fila é agnóstica de transporte e de armazenamento (injeção de
 * dependência): em produção o transporte insere em qa_events via Supabase e
 * o armazenamento é o localStorage (eventos pendentes sobrevivem a reload);
 * nos testes ambos são fakes. Nenhuma falha de entrega sobe para o chamador —
 * emitir evento JAMAIS pode quebrar o módulo emissor.
 */
import type { QaEmittedEvent } from "./types";

/** Resultado de uma tentativa de entrega. */
export type QaDeliveryResult =
  | { ok: true }
  | { ok: false; retryable: boolean; error: string };

/** Transporte de entrega (produção: INSERT em qa_events). */
export interface QaEventTransport {
  deliver(event: QaEmittedEvent): Promise<QaDeliveryResult>;
}

/** Armazenamento dos pendentes (produção: localStorage). */
export interface QaQueueStorage {
  load(): QaEmittedEvent[];
  save(pending: QaEmittedEvent[]): void;
}

export interface QaQueueLogger {
  warn(message: string): void;
}

export interface QaEventQueueOptions {
  transport: QaEventTransport;
  storage?: QaQueueStorage;
  logger?: QaQueueLogger;
  /** Tentativas máximas por evento (inclui a primeira). */
  maxAttempts?: number;
  /** Base do backoff exponencial: base, 2×base, 4×base… */
  baseDelayMs?: number;
  /** Timeout de cada tentativa de entrega. */
  timeoutMs?: number;
  /** Janela do dedupe: evento idêntico dentro dela é ignorado. */
  dedupeWindowMs?: number;
}

const DEFAULTS = {
  maxAttempts: 5,
  baseDelayMs: 2_000,
  timeoutMs: 10_000,
  dedupeWindowMs: 2_000,
} as const;

/** Storage em memória — fallback quando localStorage não existe (SSR/testes). */
export function createMemoryQueueStorage(): QaQueueStorage {
  let pending: QaEmittedEvent[] = [];
  return {
    load: () => [...pending],
    save: (list) => {
      pending = [...list];
    },
  };
}

const LOCAL_STORAGE_KEY = "orion-qa-event-queue-v1";

/** Storage padrão do browser: pendentes sobrevivem a reload da página. */
export function createLocalQueueStorage(): QaQueueStorage {
  if (typeof localStorage === "undefined") return createMemoryQueueStorage();
  return {
    load: () => {
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) return [];
        const list = JSON.parse(raw) as QaEmittedEvent[];
        return Array.isArray(list) ? list : [];
      } catch {
        return [];
      }
    },
    save: (pending) => {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(pending));
      } catch {
        /* quota/privacidade — a persistência local é melhor-esforço */
      }
    },
  };
}

interface PendingEntry {
  event: QaEmittedEvent;
  attempts: number;
}

export class QaEventQueue {
  private readonly transport: QaEventTransport;
  private readonly storage: QaQueueStorage;
  private readonly logger: QaQueueLogger;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly timeoutMs: number;
  private readonly dedupeWindowMs: number;

  private pending: PendingEntry[] = [];
  private flushing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private recentHashes = new Map<string, number>();

  constructor(options: QaEventQueueOptions) {
    this.transport = options.transport;
    this.storage = options.storage ?? createMemoryQueueStorage();
    this.logger = options.logger ?? { warn: (m) => console.warn(m) };
    this.maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;
    this.baseDelayMs = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
    this.timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
    this.dedupeWindowMs = options.dedupeWindowMs ?? DEFAULTS.dedupeWindowMs;
    // Recupera pendentes de uma sessão anterior (attempts reinicia do zero).
    this.pending = this.storage.load().map((event) => ({ event, attempts: 0 }));
  }

  /** Quantidade de eventos aguardando entrega (inspeção/testes). */
  get pendingCount(): number {
    return this.pending.length;
  }

  /**
   * Enfileira e agenda a entrega. Retorna false quando o evento foi
   * descartado pelo dedupe (idêntico dentro da janela).
   */
  enqueue(event: QaEmittedEvent): boolean {
    const hash = `${event.type}|${event.title}|${JSON.stringify(event.payload)}`;
    const now = Date.now();
    const last = this.recentHashes.get(hash);
    if (last !== undefined && now - last < this.dedupeWindowMs) {
      return false;
    }
    this.recentHashes.set(hash, now);
    // Cache limitado: janela dupla já cobre o dedupe; evita crescimento sem fim.
    for (const [key, ts] of this.recentHashes) {
      if (now - ts > this.dedupeWindowMs * 2) this.recentHashes.delete(key);
    }

    this.pending.push({ event, attempts: 0 });
    this.persist();
    void this.flush();
    return true;
  }

  /** Processa a fila em ordem; falha reagenda com backoff exponencial. */
  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.pending.length > 0) {
        const entry = this.pending[0];
        entry.attempts += 1;
        const result = await this.attemptDelivery(entry.event);

        if (result.ok) {
          this.pending.shift();
          this.persist();
          continue;
        }

        if (!result.retryable || entry.attempts >= this.maxAttempts) {
          this.logger.warn(
            `[ORION-QA] evento ${entry.event.type} (${entry.event.id}) descartado após ${entry.attempts} tentativa(s): ${result.error}`,
          );
          this.pending.shift();
          this.persist();
          continue;
        }

        const delay = this.baseDelayMs * 2 ** (entry.attempts - 1);
        this.logger.warn(
          `[ORION-QA] entrega de ${entry.event.type} falhou (tentativa ${entry.attempts}/${this.maxAttempts}); nova tentativa em ${delay}ms: ${result.error}`,
        );
        this.scheduleRetry(delay);
        return; // sai do loop; o timer retoma o flush
      }
    } finally {
      this.flushing = false;
    }
  }

  private scheduleRetry(delayMs: number): void {
    if (this.retryTimer !== null) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delayMs);
  }

  private async attemptDelivery(event: QaEmittedEvent): Promise<QaDeliveryResult> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<QaDeliveryResult>((resolve) => {
      timer = setTimeout(
        () => resolve({ ok: false, retryable: true, error: `timeout após ${this.timeoutMs}ms` }),
        this.timeoutMs,
      );
    });
    try {
      return await Promise.race([this.transport.deliver(event), timeout]);
    } catch (err) {
      return {
        ok: false,
        retryable: true,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  private persist(): void {
    this.storage.save(this.pending.map((p) => p.event));
  }
}
