// Cenário: anúncios — abertura de página de detalhe de anúncio
// (ProductLandingPage) a partir de um pool de IDs sintéticos de staging.
// Ver docs/CHECKLIST_STAGING.md item 4 (seed de anúncios de teste).

import http from 'k6/http';
import { sleep, group } from 'k6';
import { CONFIG } from '../lib/config.js';
import { recordResponse } from '../lib/metrics.js';
import { pickSeedId, hasSeed } from '../lib/seedData.js';

export function anunciosScenario() {
  if (!hasSeed('products')) return; // sem seed provisionado: pula (ver docs/CHECKLIST_STAGING.md)
  group('anuncios', () => {
    const id = pickSeedId('products');
    const res = http.get(`${CONFIG.baseUrl}/produto/${id}`, {
      timeout: CONFIG.httpTimeout,
      tags: { name: 'anuncio_detalhe' },
    });
    recordResponse('anuncios', res);
    sleep(Math.random() * 3 + 1); // usuário "lendo" o anúncio
  });
}
