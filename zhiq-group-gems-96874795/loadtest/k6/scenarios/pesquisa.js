// Cenário: pesquisa — busca global (/busca) com termos sintéticos
// variados, simulando o GlobalSearchPage. Leitura pura.

import http from 'k6/http';
import { sleep, group } from 'k6';
import { CONFIG } from '../lib/config.js';
import { recordResponse } from '../lib/metrics.js';

// Termos genéricos de exemplo — não referenciam dados reais de anúncios.
const SEARCH_TERMS = [
  'carro', 'moto', 'apartamento', 'sofa', 'notebook', 'bicicleta',
  'geladeira', 'frete', 'viagem', 'servico eletricista', 'terreno', 'caminhao',
];

export function pesquisaScenario() {
  group('pesquisa', () => {
    const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
    const res = http.get(
      `${CONFIG.baseUrl}/busca?q=${encodeURIComponent(term)}`,
      { headers: CONFIG.frontendHeaders, timeout: CONFIG.httpTimeout, tags: { name: 'search' } }
    );
    recordResponse('pesquisa', res);
    sleep(Math.random() * 1.5 + 0.5);
  });
}
