// Cenário: veículos — abertura de listagem geral e detalhe de veículo
// (VehicleDetailPage / AllVehiclesPage). Operação de leitura; as RPCs de
// clique/interesse (charge_vehicle_listing_click, charge_vehicle_interest_click)
// são tratadas como escrita controlada e só disparadas conforme WRITE_RATIO.

import http from 'k6/http';
import { sleep, group } from 'k6';
import { CONFIG } from '../lib/config.js';
import { recordResponse, writeOpsAttempted, writeOpsFailed } from '../lib/metrics.js';
import { pickSeedId, hasSeed } from '../lib/seedData.js';
import { authHeaders } from '../lib/auth.js';

export function veiculosScenario(session) {
  group('veiculos', () => {
    const listRes = http.get(`${CONFIG.baseUrl}/automoveis`, {
      headers: CONFIG.frontendHeaders,
      timeout: CONFIG.httpTimeout,
      tags: { name: 'veiculos_listagem' },
    });
    recordResponse('veiculos', listRes);
    sleep(Math.random() * 1 + 0.5);

    if (!hasSeed('vehicles')) return;
    const id = pickSeedId('vehicles');
    const detailRes = http.get(`${CONFIG.baseUrl}/veiculos/${id}`, {
      headers: CONFIG.frontendHeaders,
      timeout: CONFIG.httpTimeout,
      tags: { name: 'veiculos_detalhe' },
    });
    recordResponse('veiculos', detailRes);
    sleep(Math.random() * 2 + 1);

    if (Math.random() < CONFIG.writeRatio) {
      writeOpsAttempted.add(1);
      const rpcRes = http.post(
        `${CONFIG.supabaseUrl}/rest/v1/rpc/charge_vehicle_interest_click`,
        JSON.stringify({ p_listing_id: id }),
        {
          headers: { 'Content-Type': 'application/json', ...authHeaders(session) },
          timeout: CONFIG.httpTimeout,
          tags: { name: 'veiculos_interest_click' },
        }
      );
      recordResponse('veiculos', rpcRes);
      if (rpcRes.status >= 400) writeOpsFailed.add(1);
    }
  });
}
