// Cenário: navegação — abertura da aplicação e navegação entre páginas
// públicas principais (home, categorias). Simula visitante anônimo, sem
// autenticação. É o cenário de maior peso (maioria do tráfego real de um
// marketplace é leitura anônima).

import http from 'k6/http';
import { sleep, group } from 'k6';
import { CONFIG } from '../lib/config.js';
import { recordResponse } from '../lib/metrics.js';

const PUBLIC_PAGES = [
  '/',
  '/mercado',
  '/automoveis',
  '/leiloes',
  '/imoveis',
  '/servicos',
  '/fretes',
  '/viagens',
  '/medprev',
];

export function navegacaoScenario() {
  group('navegacao', () => {
    const path = PUBLIC_PAGES[Math.floor(Math.random() * PUBLIC_PAGES.length)];
    const res = http.get(`${CONFIG.baseUrl}${path}`, {
      timeout: CONFIG.httpTimeout,
      tags: { name: 'nav_page', page: path },
    });
    recordResponse('navegacao', res);
    sleep(Math.random() * 2 + 1); // think time 1-3s, simula leitura da página
  });
}
