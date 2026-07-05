/**
 * M58.0 · Observabilidade do frontend — LOCAL, sem envio externo.
 *
 * Ring buffer em memória com render/fetch/erros; `snapshot()` alimenta
 * uma futura tela de diagnóstico e, pós-OBSERVE, poderá ser exportado
 * por um canal oficial (nunca automático nesta fase).
 */

export interface FetchSample {
  dataset: string;
  ms: number;
  ok: boolean;
  errorKind?: string;
  at?: number;
}

export interface RenderSample {
  component: string;
  ms: number;
  at?: number;
}

const LIMIT = 300;
const SLOW_RENDER_MS = 50;

class FrontendTelemetry {
  private fetches: FetchSample[] = [];
  private renders: RenderSample[] = [];
  private errors: { source: string; message: string; at: number }[] = [];

  recordFetch(s: FetchSample) {
    this.fetches.push({ ...s, at: Date.now() });
    if (this.fetches.length > LIMIT) this.fetches.shift();
  }

  recordRender(s: RenderSample) {
    this.renders.push({ ...s, at: Date.now() });
    if (this.renders.length > LIMIT) this.renders.shift();
  }

  recordError(source: string, message: string) {
    this.errors.push({ source, message, at: Date.now() });
    if (this.errors.length > LIMIT) this.errors.shift();
  }

  /** componentes acima do limiar de renderização */
  slowComponents(): RenderSample[] {
    return this.renders.filter((r) => r.ms > SLOW_RENDER_MS);
  }

  snapshot() {
    const okFetches = this.fetches.filter((f) => f.ok);
    const avg = okFetches.length
      ? okFetches.reduce((a, f) => a + f.ms, 0) / okFetches.length
      : null;
    return {
      fetches: this.fetches.length,
      falhas: this.fetches.filter((f) => !f.ok).length,
      latencia_media_ms: avg === null ? null : Math.round(avg * 10) / 10,
      renders: this.renders.length,
      componentes_lentos: this.slowComponents().length,
      erros: this.errors.length,
      nota: 'telemetria local — nenhum envio externo nesta fase',
    };
  }
}

export const telemetry = new FrontendTelemetry();
