// ORION-480 — Script principal de teste de carga progressivo.
//
// USO (sempre contra STAGING, nunca produção — ver lib/guard.js):
//
//   k6 run loadtest/k6/main.js \
//     -e BASE_URL=https://staging.exemplo.invalid \
//     -e SUPABASE_URL=https://<projeto-staging>.supabase.co \
//     -e SUPABASE_ANON_KEY=<anon key de staging> \
//     -e USERS=25000 -e DURATION=5m -e RAMP_UP=2m -e RAMP_DOWN=2m \
//     -e I_UNDERSTAND_THIS_GENERATES_TRAFFIC=yes
//
// Para rodar um único cenário isolado (debug de gargalo):
//   ... -e SCENARIO=leiloes
//
// Para a etapa completa segundo a matriz oficial, prefira os arquivos em
// loadtest/config/stage-*.json (ver docs/EXECUCAO.md) que fixam
// USERS/DURATION/RAMP_UP por etapa, evitando erro manual de digitação.

import { sleep } from 'k6';
import exec from 'k6/execution';
import { CONFIG } from './lib/config.js';
import { assertNotProduction, requireExplicitRun } from './lib/guard.js';
import { buildWeightedTable, pickScenario, autenticacaoScenario } from './scenarios/index.js';
import { realtimeScenario } from './scenarios/realtime.js';

// --- Guarda de segurança: roda no init context, antes de qualquer VU. ---
assertNotProduction();
requireExplicitRun();

const scenarioTable = buildWeightedTable();

// --- Thresholds: critérios de parada automatizados (k6 aborta/derruba a
// execução quando "abortOnFail" e o threshold estoura). Todos configuráveis
// via env para permitir afinar por etapa da progressão sem editar código.
const errorRateMax = parseFloat(__ENV.THRESHOLD_ERROR_RATE || '0.05'); // 5%
const p95Max = parseInt(__ENV.THRESHOLD_P95_MS || '2000', 10);
const p99Max = parseInt(__ENV.THRESHOLD_P99_MS || '5000', 10);
const timeoutRateMax = parseFloat(__ENV.THRESHOLD_TIMEOUT_RATE || '0.02'); // 2%

function httpScenarioExecutor() {
  return {
    executor: 'ramping-vus',
    exec: 'httpUser',
    startVUs: 0,
    stages: [
      { duration: CONFIG.rampUp, target: CONFIG.users },
      { duration: CONFIG.duration, target: CONFIG.users },
      { duration: CONFIG.rampDown, target: 0 },
    ],
    gracefulRampDown: '30s',
  };
}

function realtimeScenarioExecutor() {
  // Realtime roda com um teto de VUs bem menor que o HTTP principal por
  // padrão (proporção configurável) — ver comentário em scenarios/realtime.js
  // sobre por que não espelha 1:1 o total de VUs HTTP.
  const ratio = parseFloat(__ENV.REALTIME_VU_RATIO || '0.02'); // 2% do total por default
  const target = Math.max(1, Math.round(CONFIG.users * ratio));
  return {
    executor: 'ramping-vus',
    exec: 'realtimeUser',
    startVUs: 0,
    stages: [
      { duration: CONFIG.rampUp, target },
      { duration: CONFIG.duration, target },
      { duration: CONFIG.rampDown, target: 0 },
    ],
    gracefulRampDown: '30s',
  };
}

const scenarios = {};
if (CONFIG.scenario === 'all' || CONFIG.scenario !== 'realtime') {
  scenarios.http_mixed = httpScenarioExecutor();
}
if (CONFIG.scenario === 'all' || CONFIG.scenario === 'realtime') {
  scenarios.realtime = realtimeScenarioExecutor();
}

export const options = {
  scenarios,
  thresholds: {
    // Critério de parada: taxa de erro (4xx+5xx+timeout, excluindo 429
    // esperado de rate limit de negócio — ver metrics.js) acima do limite.
    business_success_rate: [{ threshold: `rate>=${1 - errorRateMax}`, abortOnFail: true }],
    http_req_duration: [
      `p(95)<${p95Max}`,
      `p(99)<${p99Max}`,
    ],
    http_timeouts_total: [{ threshold: `count<${Math.ceil(CONFIG.users * timeoutRateMax)}`, abortOnFail: true }],
    http_5xx_total: [{ threshold: `count<${Math.ceil(CONFIG.users * errorRateMax)}` }],
  },
  // Sem limite de RPS aqui de propósito — o objetivo do teste é DESCOBRIR
  // o RPS máximo suportado, não simulá-lo. Se for necessário conter o
  // gerador (ver docs/LIMITES.md sobre limite do gerador vs. da aplicação),
  // reduza USERS ou ajuste RAMP_UP em vez de adicionar rate limit aqui.
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  console.log(`\n=== ORION-480 Teste de Carga ===`);
  console.log(`BASE_URL:      ${CONFIG.baseUrl}`);
  console.log(`SUPABASE_URL:  ${CONFIG.supabaseUrl}`);
  console.log(`USERS (alvo):  ${CONFIG.users}`);
  console.log(`DURATION:      ${CONFIG.duration}  RAMP_UP: ${CONFIG.rampUp}  RAMP_DOWN: ${CONFIG.rampDown}`);
  console.log(`SCENARIO:      ${CONFIG.scenario}`);
  console.log(`WRITE_RATIO:   ${CONFIG.writeRatio}`);
  console.log('Distribuição de cenários (nome: peso normalizado):');
  for (const s of scenarioTable) {
    console.log(`  - ${s.name}: ${(s.weight).toFixed(3)}`);
  }
  console.log('==================================\n');
  return { startedAt: Date.now() };
}

export function httpUser() {
  const vuId = exec.vu.idInTest;
  const entry = pickScenario(scenarioTable);

  let session = null;
  if (entry.needsAuth) {
    session = autenticacaoScenario(vuId);
  }
  entry.fn(session);

  sleep(Math.random() * 0.5); // jitter para evitar sincronização artificial entre VUs
}

export function realtimeUser() {
  realtimeScenario();
}

export function teardown(data) {
  const elapsedS = ((Date.now() - data.startedAt) / 1000).toFixed(1);
  console.log(`\n=== Teste finalizado em ${elapsedS}s. Ver summary abaixo e o handleSummary para o relatório em arquivo. ===\n`);
}

export function handleSummary(data) {
  const stamp = __ENV.STAGE_LABEL || `users${CONFIG.users}`;
  const outPath = `loadtest/results/summary-${stamp}.json`;
  const result = {
    [outPath]: JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
  return result;
}

// Sumário textual mínimo próprio (evita depender do import externo
// k6-summary que não vem embutido no binário k6 puro).
function textSummary(data) {
  const m = data.metrics || {};
  const get = (name, stat) => (m[name] && m[name].values && m[name].values[stat]) || 0;
  const lines = [];
  lines.push('--- ORION-480 Resumo da Execução ---');
  lines.push(`VUs máx: ${get('vus_max', 'value') || get('vus_max', 'max')}`);
  lines.push(`Requisições: ${get('http_reqs', 'count')}`);
  lines.push(`RPS médio: ${(get('http_reqs', 'rate') || 0).toFixed(2)}`);
  lines.push(`Duração P50/P95/P99 (ms): ${get('http_req_duration', 'med').toFixed(1)} / ${get('http_req_duration', 'p(95)').toFixed(1)} / ${get('http_req_duration', 'p(99)').toFixed(1)}`);
  lines.push(`Taxa de falha HTTP nativa: ${((get('http_req_failed', 'rate') || 0) * 100).toFixed(2)}%`);
  lines.push(`4xx: ${get('http_4xx_total', 'count')}  5xx: ${get('http_5xx_total', 'count')}  Timeouts: ${get('http_timeouts_total', 'count')}`);
  lines.push(`Rate limited (negócio, esperado): ${get('business_rate_limited_total', 'count')}`);
  lines.push(`Falhas de auth: ${get('business_auth_failures_total', 'count')}`);
  lines.push(`Escritas tentadas/falhas: ${get('business_write_ops_total', 'count')} / ${get('business_write_ops_failed_total', 'count')}`);
  lines.push(`Realtime — conexões falhas: ${get('realtime_connect_failures_total', 'count')}`);
  lines.push('-------------------------------------');
  return lines.join('\n');
}
