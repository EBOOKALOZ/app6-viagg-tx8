// Cenário: acesso a perfis — abertura de loja/perfil público (StoreLayout)
// a partir de um pool de storeIds sintéticos de staging.

import http from 'k6/http';
import { sleep, group } from 'k6';
import { CONFIG } from '../lib/config.js';
import { recordResponse } from '../lib/metrics.js';
import { pickSeedId, hasSeed } from '../lib/seedData.js';

export function perfisScenario() {
  if (!hasSeed('profiles')) return;
  group('perfis', () => {
    const storeId = pickSeedId('profiles');
    const res = http.get(`${CONFIG.baseUrl}/loja/${storeId}`, {
      headers: CONFIG.frontendHeaders,
      timeout: CONFIG.httpTimeout,
      tags: { name: 'perfil_loja' },
    });
    recordResponse('navegacao', res); // perfis reutiliza o trend de navegação (mesma natureza de leitura)
    sleep(Math.random() * 1.5 + 0.5);
  });
}
