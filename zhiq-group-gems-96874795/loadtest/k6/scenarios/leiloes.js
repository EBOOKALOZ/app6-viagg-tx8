// Cenário: leilões e arremates — leitura de listagem/detalhe + lance
// controlado via RPC place_auction_bid.
//
// IMPORTANTE — rate limit real do banco (não simular acima disso):
// supabase/migrations/20260723_auction_enterprise_security_bidengine_oficial.sql
// limita a 5 lances por (usuário, leilão) a cada 10s via tabela
// auction_bid_rate. Este cenário nunca dá mais que 1 lance por VU a cada
// >=10s no mesmo leilão — respeitar esse limite é o que permite distinguir
// "sistema saturado" de "rate limit de negócio funcionando como esperado"
// (ver metrics.js: recordResponse trata HTTP 429 / rate_limited à parte).

import http from 'k6/http';
import { sleep, group } from 'k6';
import { CONFIG } from '../lib/config.js';
import { recordResponse, writeOpsAttempted, writeOpsFailed, rateLimited } from '../lib/metrics.js';
import { pickSeedId, hasSeed } from '../lib/seedData.js';
import { authHeaders } from '../lib/auth.js';

const MIN_SECONDS_BETWEEN_BIDS = 12; // margem sobre a janela de 10s do banco

export function leiloesScenario(session) {
  group('leiloes', () => {
    const listRes = http.get(`${CONFIG.baseUrl}/leiloes`, {
      headers: CONFIG.frontendHeaders,
      timeout: CONFIG.httpTimeout,
      tags: { name: 'leiloes_listagem' },
    });
    recordResponse('leiloes', listRes);
    sleep(Math.random() * 1 + 0.5);

    if (!hasSeed('auctions')) return;
    const id = pickSeedId('auctions');
    const detailRes = http.get(`${CONFIG.baseUrl}/leilao/${id}`, {
      headers: CONFIG.frontendHeaders,
      timeout: CONFIG.httpTimeout,
      tags: { name: 'leiloes_detalhe' },
    });
    recordResponse('leiloes', detailRes);

    // Views/contador — leitura frequente, sem rate limit de negócio.
    const viewRes = http.post(
      `${CONFIG.supabaseUrl}/rest/v1/rpc/increment_auction_view`,
      JSON.stringify({ p_listing_id: id }),
      {
        headers: { 'Content-Type': 'application/json', ...authHeaders(session) },
        timeout: CONFIG.httpTimeout,
        tags: { name: 'leiloes_view_increment' },
      }
    );
    recordResponse('leiloes', viewRes);

    sleep(Math.random() * 2 + 1);

    // Lance: só usuários autenticados, só uma fração (WRITE_RATIO), e no
    // máximo 1 por execução do cenário — a repetição natural do VU ao
    // longo da duração do teste já respeita a janela de 10s porque cada
    // iteração do cenário demora bem mais que isso por causa do think time
    // e da mistura com outros cenários no distribuidor (ver main.js).
    if (session && Math.random() < CONFIG.writeRatio) {
      writeOpsAttempted.add(1);
      const bidRes = http.post(
        `${CONFIG.supabaseUrl}/rest/v1/rpc/place_auction_bid`,
        JSON.stringify({
          p_listing_id: id,
          // Valor sintético baixo e fixo de propósito: o objetivo é medir
          // capacidade do endpoint, não simular estratégia de leilão real.
          p_amount_cents: 100,
        }),
        {
          headers: { 'Content-Type': 'application/json', ...authHeaders(session) },
          timeout: CONFIG.httpTimeout,
          tags: { name: 'leiloes_place_bid' },
        }
      );
      recordResponse('leiloes', bidRes, { expectRateLimit: true });

      if (bidRes.status === 200) {
        try {
          const body = bidRes.json();
          if (body && body.code === 'rate_limited') rateLimited.add(1);
          if (body && body.success === false && body.code !== 'rate_limited') writeOpsFailed.add(1);
        } catch (_e) {
          // resposta não-JSON em 200 é inesperado, mas não deve derrubar o VU
        }
      } else if (bidRes.status >= 400) {
        writeOpsFailed.add(1);
      }
    }

    sleep(MIN_SECONDS_BETWEEN_BIDS - 2); // devolve o tempo já gasto acima ao orçamento da janela
  });
}
