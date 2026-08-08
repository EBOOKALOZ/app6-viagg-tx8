// ORION-480 — Métricas customizadas compartilhadas por todos os cenários.
// k6 já coleta http_req_duration (P50/P95/P99 via trend), taxa de erro
// (http_req_failed) e vus/vus_max nativamente; aqui só adicionamos o que
// falta: quebra por domínio, por código de status, timeouts explícitos e
// eventos de negócio (rate limit atingido, lance recusado etc).

import { Counter, Trend, Rate } from 'k6/metrics';

export const reqByDomain = {
  auth: new Trend('domain_auth_duration', true),
  navegacao: new Trend('domain_navegacao_duration', true),
  pesquisa: new Trend('domain_pesquisa_duration', true),
  anuncios: new Trend('domain_anuncios_duration', true),
  veiculos: new Trend('domain_veiculos_duration', true),
  leiloes: new Trend('domain_leiloes_duration', true),
  convenios: new Trend('domain_convenios_duration', true),
  doacoes: new Trend('domain_doacoes_duration', true),
  wallet: new Trend('domain_wallet_duration', true),
  api: new Trend('domain_api_duration', true),
  realtime: new Trend('domain_realtime_duration', true),
};

export const errors4xx = new Counter('http_4xx_total');
export const errors5xx = new Counter('http_5xx_total');
export const timeouts = new Counter('http_timeouts_total');
export const rateLimited = new Counter('business_rate_limited_total');
export const authFailures = new Counter('business_auth_failures_total');
export const writeOpsAttempted = new Counter('business_write_ops_total');
export const writeOpsFailed = new Counter('business_write_ops_failed_total');

export const successRate = new Rate('business_success_rate');

export const realtimeConnectDuration = new Trend('realtime_connect_duration', true);
export const realtimeMessageLatency = new Trend('realtime_message_latency', true);
export const realtimeConnectFailures = new Counter('realtime_connect_failures_total');

/**
 * Registra o resultado de uma resposta HTTP nas métricas customizadas.
 * Chamar depois de todo http.request()/http.batch() nos cenários.
 */
export function recordResponse(domain, res, { expectRateLimit = false } = {}) {
  const trend = reqByDomain[domain];
  if (trend && res.timings) {
    trend.add(res.timings.duration);
  }

  if (res.status === 0) {
    timeouts.add(1);
    successRate.add(false);
    return;
  }

  if (res.status === 429) {
    rateLimited.add(1);
    successRate.add(expectRateLimit); // rate limit esperado não conta como falha do sistema
    return;
  }

  if (res.status >= 400 && res.status < 500) {
    errors4xx.add(1);
    successRate.add(false);
    return;
  }

  if (res.status >= 500) {
    errors5xx.add(1);
    successRate.add(false);
    return;
  }

  successRate.add(true);
}
