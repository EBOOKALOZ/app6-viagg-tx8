// Cenário: Convênios — landing pública (/medprev) + estatísticas públicas
// via RPC convenio_public_stats. Somente leitura (o CRUD de gestão fica
// atrás de GestorConvenioProtectedRoute e não faz sentido em carga de
// usuário final).

import http from 'k6/http';
import { sleep, group } from 'k6';
import { CONFIG } from '../lib/config.js';
import { recordResponse } from '../lib/metrics.js';
import { authHeaders } from '../lib/auth.js';

export function conveniosScenario(session) {
  group('convenios', () => {
    const pageRes = http.get(`${CONFIG.baseUrl}/medprev`, {
      timeout: CONFIG.httpTimeout,
      tags: { name: 'convenios_landing' },
    });
    recordResponse('convenios', pageRes);
    sleep(Math.random() * 1 + 0.5);

    const statsRes = http.post(
      `${CONFIG.supabaseUrl}/rest/v1/rpc/convenio_public_stats`,
      JSON.stringify({}),
      {
        headers: { 'Content-Type': 'application/json', ...authHeaders(session) },
        timeout: CONFIG.httpTimeout,
        tags: { name: 'convenios_public_stats' },
      }
    );
    recordResponse('convenios', statsRes);
    sleep(Math.random() * 1.5 + 0.5);
  });
}
