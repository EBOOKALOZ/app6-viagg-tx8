// ORION-480 — Configuração central, lida exclusivamente de variáveis de
// ambiente. Nenhum valor de produção é embutido aqui.

export const CONFIG = {
  baseUrl: __ENV.BASE_URL || '',
  supabaseUrl: __ENV.SUPABASE_URL || '',
  supabaseAnonKey: __ENV.SUPABASE_ANON_KEY || '',

  // Alvo de VUs desta execução (uma etapa da progressão 25k..900k).
  users: parseInt(__ENV.USERS || '25000', 10),

  // Duração do platô principal (fora do ramp-up/ramp-down).
  duration: __ENV.DURATION || '5m',

  // Duração da subida gradual até o pico de VUs.
  rampUp: __ENV.RAMP_UP || '2m',

  // Duração da descida gradual (usada também no teste de recuperação).
  rampDown: __ENV.RAMP_DOWN || '2m',

  // Cenário único a rodar isoladamente, ou "all" para a distribuição
  // completa ponderada (ver scenarios/index.js).
  scenario: __ENV.SCENARIO || 'all',

  // Usuários de teste sintéticos pré-provisionados no projeto de staging,
  // no formato "loadtest+000001@example.invalid:SenhaSintetica123!".
  // Nunca credenciais reais. Ver docs/CHECKLIST_STAGING.md item 3.
  testUserEmailPrefix: __ENV.TEST_USER_EMAIL_PREFIX || 'loadtest+',
  testUserEmailDomain: __ENV.TEST_USER_EMAIL_DOMAIN || 'example.invalid',
  testUserPassword: __ENV.TEST_USER_PASSWORD || 'SenhaSintetica123!',
  testUserPoolSize: parseInt(__ENV.TEST_USER_POOL_SIZE || '2000', 10),

  // Proporção de operações de escrita vs. leitura dentro dos cenários que
  // fazem ambas (ex.: leilão: ver x dar lance). 0.1 = 10% escreve.
  writeRatio: parseFloat(__ENV.WRITE_RATIO || '0.1'),

  // Header opcional p/ Vercel Deployment Protection do preview de staging
  // (Protection Bypass for Automation). Vazio = nenhum header extra.
  frontendHeaders: __ENV.VERCEL_BYPASS
    ? { 'x-vercel-protection-bypass': __ENV.VERCEL_BYPASS }
    : undefined,

  // Timeout de requisição HTTP individual.
  httpTimeout: __ENV.HTTP_TIMEOUT || '10s',
};

export function scenarioWeight(name, fallback) {
  const key = `WEIGHT_${name.toUpperCase()}`;
  const raw = __ENV[key];
  return raw ? parseFloat(raw) : fallback;
}
