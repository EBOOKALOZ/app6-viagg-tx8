// Cenário: chamadas de API genéricas — Edge Functions de baixo risco e
// alta frequência esperada em uso real (geocoding, cotação, token de mapa).
// Evita deliberadamente Edge Functions de IA (orion-ai-gateway, ai-chat)
// como alvo de alto volume: elas têm rate limit e custo por chamada a
// provedor externo — bater nelas em escala testaria o limite de terceiros,
// não a capacidade do próprio app. Ver docs/ARQUITETURA.md.

import http from 'k6/http';
import { sleep, group } from 'k6';
import { CONFIG } from '../lib/config.js';
import { recordResponse } from '../lib/metrics.js';
import { authHeaders } from '../lib/auth.js';

export function apiScenario(session) {
  group('api', () => {
    const res = http.get(`${CONFIG.supabaseUrl}/functions/v1/get-mapbox-token`, {
      headers: authHeaders(session),
      timeout: CONFIG.httpTimeout,
      tags: { name: 'api_mapbox_token' },
    });
    recordResponse('api', res);
    sleep(Math.random() * 0.5 + 0.2);
  });
}
