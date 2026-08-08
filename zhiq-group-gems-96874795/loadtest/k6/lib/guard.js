// ORION-480 — Guarda anti-produção
//
// Objetivo único: tornar tecnicamente difícil disparar este teste contra
// produção por engano. Roda no init context do k6 (fora de qualquer função
// exportada), então qualquer falha aqui aborta o script ANTES de gerar
// qualquer VU ou requisição.

// Projetos Supabase conhecidos como produção deste app. Mantido em código
// (não em env) de propósito: se dependesse de uma env var para saber o que
// é produção, bastaria não setar a env var para burlar a proteção.
const KNOWN_PRODUCTION_HOSTS = [
  'broifhfqmnzqoongtokm.supabase.co',
];

const KNOWN_PRODUCTION_URL_FRAGMENTS = [
  'viagg.com',
  'viagg.com.br',
  'mercadolocal',
];

function fail(message) {
  // eslint-disable-next-line no-console
  console.error(`\n[GUARD] ${message}\n`);
  throw new Error(`[ORION-480 GUARD] Execução abortada: ${message}`);
}

function hostnameOf(url) {
  try {
    return url.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').split('/')[0].toLowerCase();
  } catch (_e) {
    return '';
  }
}

export function assertNotProduction() {
  const baseUrl = __ENV.BASE_URL || '';
  const supabaseUrl = __ENV.SUPABASE_URL || '';
  const allowStaging = __ENV.I_CONFIRM_STAGING === 'yes';

  if (!baseUrl || !supabaseUrl) {
    fail(
      'BASE_URL e SUPABASE_URL são obrigatórios. Nenhum valor default é ' +
      'assumido de propósito — sem isso o script recusa iniciar.'
    );
  }

  const hosts = [hostnameOf(baseUrl), hostnameOf(supabaseUrl)];

  for (const host of hosts) {
    if (KNOWN_PRODUCTION_HOSTS.includes(host)) {
      fail(
        `Host "${host}" é um host de PRODUÇÃO conhecido (lista fixa em ` +
        'guard.js). Este script nunca deve rodar contra ele. Aponte ' +
        'BASE_URL/SUPABASE_URL para o projeto Supabase de staging.'
      );
    }
    for (const fragment of KNOWN_PRODUCTION_URL_FRAGMENTS) {
      if (host.includes(fragment)) {
        fail(
          `Host "${host}" contém o fragmento "${fragment}", associado a ` +
          'produção. Abortando.'
        );
      }
    }
  }

  if (!/staging|local|test|dev/i.test(baseUrl + supabaseUrl) && !allowStaging) {
    fail(
      'BASE_URL/SUPABASE_URL não contêm nenhum indício de staging/local/dev ' +
      '(ex.: "staging", "dev", "local", "test" no hostname) e a variável ' +
      'I_CONFIRM_STAGING não foi setada como "yes". Isso é uma segunda ' +
      'barreira proposital: se o ambiente é staging mas o nome não denuncia ' +
      'isso, confirme explicitamente com -e I_CONFIRM_STAGING=yes.'
    );
  }

  const anonKey = __ENV.SUPABASE_ANON_KEY || '';
  if (!anonKey) {
    fail('SUPABASE_ANON_KEY é obrigatório (chave anon do projeto de staging).');
  }
  if (anonKey.length > 20 && /^eyJ/.test(anonKey)) {
    // JWT anon keys do Supabase começam com "eyJ" (header base64 de JWT).
    // Isso é esperado — só valida que não vieram vazias/placeholder.
  }

  // Nunca aceitar variáveis que sugiram credenciais de usuário real.
  const forbiddenEnvNames = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'REAL_USER_EMAIL',
    'REAL_USER_PASSWORD',
    'PRODUCTION_TOKEN',
  ];
  for (const name of forbiddenEnvNames) {
    if (__ENV[name]) {
      fail(
        `Variável "${name}" foi fornecida. Este teste usa exclusivamente ` +
        'usuários sintéticos com a ANON key — nunca service_role key nem ' +
        'credenciais reais. Remova essa variável.'
      );
    }
  }

  return { baseUrl, supabaseUrl, anonKey };
}

export function requireExplicitRun() {
  if (__ENV.I_UNDERSTAND_THIS_GENERATES_TRAFFIC !== 'yes') {
    fail(
      'Confirmação explícita ausente. Rode novamente com ' +
      '-e I_UNDERSTAND_THIS_GENERATES_TRAFFIC=yes para confirmar que você ' +
      'sabe que este teste vai gerar tráfego real contra o ambiente ' +
      'apontado em BASE_URL/SUPABASE_URL.'
    );
  }
}
