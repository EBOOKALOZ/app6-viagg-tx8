// ORION-480 â€” AutenticaÃ§Ã£o sintÃ©tica via GoTrue REST (Supabase Auth).
//
// Usa signInWithPassword diretamente via HTTP (sem SDK, k6 nÃ£o roda o
// supabase-js no browser) contra um POOL de usuÃ¡rios de teste
// prÃ©-provisionados em staging. Nunca usa credenciais reais.
//
// Provisionamento do pool: ver docs/CHECKLIST_STAGING.md item 3. Resumo:
// criar N usuÃ¡rios sintÃ©ticos (ex.: loadtest+000001@example.invalid atÃ©
// loadtest+00NNNN@example.invalid) direto no staging via Admin API ou
// seed SQL, todos com a MESMA senha sintÃ©tica fixa (TEST_USER_PASSWORD).

import http from 'k6/http';
import { CONFIG } from './config.js';
import { recordResponse, authFailures } from './metrics.js';

function testUserEmail(index) {
  const n = String(index % CONFIG.testUserPoolSize).padStart(6, '0');
  return `${CONFIG.testUserEmailPrefix}${n}@${CONFIG.testUserEmailDomain}`;
}

/**
 * Autentica o VU atual com um usuÃ¡rio sintÃ©tico determinÃ­stico (mesmo VU
 * sempre cai no mesmo usuÃ¡rio do pool, evitando contenÃ§Ã£o de rate limit
 * de auth por conta).
 *
 * Retorna { accessToken, userId } ou null se falhar (chamador decide se
 * trata como erro fatal do VU ou segue como visitante anÃ´nimo).
 */
export function loginSyntheticUser(vuId) {
  const email = testUserEmail(vuId);
  const url = `${CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`;

  const res = http.post(
    url,
    JSON.stringify({ email, password: CONFIG.testUserPassword }),
    {
      headers: {
        'Content-Type': 'application/json',
        apikey: CONFIG.supabaseAnonKey,
      },
      timeout: CONFIG.httpTimeout,
      tags: { name: 'auth_login' },
    }
  );

  recordResponse('auth', res);

  if (res.status !== 200) {
    console.log('[AUTH DEBUG] email=' + email + ' status=' + res.status + ' body=' + res.body);
    authFailures.add(1);
    return null;
  }

  try {
    const body = res.json();
    return {
      accessToken: body.access_token,
      userId: body.user && body.user.id,
      email,
    };
  } catch (_e) {
    authFailures.add(1);
    return null;
  }
}

export function authHeaders(session) {
  if (!session || !session.accessToken) {
    return { apikey: CONFIG.supabaseAnonKey };
  }
  return {
    apikey: CONFIG.supabaseAnonKey,
    Authorization: `Bearer ${session.accessToken}`,
  };
}

// AUTH DEBUG TEMP

// AUTH DEBUG TEMP

