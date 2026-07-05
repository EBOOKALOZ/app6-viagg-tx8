/**
 * M58.0 · Cache — PREPARADO E DESLIGADO.
 *
 * CACHE_ENABLED permanece false até o OBSERVE comprovar necessidade
 * (decisão registrada desde o M55.3: o access log da Semantic Layer é
 * quem fornece os dados p/ decidir — cio_metric_heatmap aponta candidatas).
 * Ligar = mudar UMA constante; a infraestrutura já está pronta.
 */

export const CACHE_ENABLED = false; // [ligar-somente-após-OBSERVE]

export interface CacheAdapter {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
  invalidate(prefix?: string): void;
  stats(): { entries: number; hits: number; misses: number };
}

class MemoryCache implements CacheAdapter {
  private store = new Map<string, { value: unknown; expiresAt: number }>();
  private hits = 0;
  private misses = 0;

  get<T>(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e || e.expiresAt < Date.now()) {
      if (e) this.store.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return e.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidate(prefix?: string): void {
    if (!prefix) {
      this.store.clear();
      return;
    }
    for (const k of this.store.keys()) if (k.startsWith(prefix)) this.store.delete(k);
  }

  stats() {
    return { entries: this.store.size, hits: this.hits, misses: this.misses };
  }
}

export const cache: CacheAdapter = new MemoryCache();
