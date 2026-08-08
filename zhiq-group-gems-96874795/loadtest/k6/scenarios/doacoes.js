// Cenário: Doações — leitura de campanhas de convenio_campaigns (via REST
// PostgREST, respeitando RLS) e, opcionalmente, criação de doação
// sintética controlada.
//
// ATENÇÃO — gap de mapeamento: o levantamento estático (ver relatório de
// exploração desta suíte) não encontrou uma RPC/endpoint client-side
// dedicado a "criar doação" chamado pelo frontend hoje — só a tabela
// convenio_donations e RPCs de leitura/gestão administrativa. Antes de
// habilitar a escrita deste cenário, confirmar no código atual (grep por
// "convenio_donations" em src/) qual é o caminho real de escrita (RPC
// específica, insert direto via PostgREST, ou fluxo de pagamento
// promotion-checkout/payments-charge). Até essa confirmação, o cenário
// roda em modo somente-leitura por padrão (ENABLE_DONATION_WRITE!=yes).

import http from 'k6/http';
import { sleep, group } from 'k6';
import { CONFIG } from '../lib/config.js';
import { recordResponse, writeOpsAttempted, writeOpsFailed } from '../lib/metrics.js';
import { authHeaders } from '../lib/auth.js';

const WRITE_ENABLED = __ENV.ENABLE_DONATION_WRITE === 'yes';

export function doacoesScenario(session) {
  group('doacoes', () => {
    const campaignsRes = http.get(
      `${CONFIG.supabaseUrl}/rest/v1/convenio_campaigns?select=id,title,status&status=eq.active&limit=20`,
      {
        headers: authHeaders(session),
        timeout: CONFIG.httpTimeout,
        tags: { name: 'doacoes_campanhas_ativas' },
      }
    );
    recordResponse('doacoes', campaignsRes);
    sleep(Math.random() * 1.5 + 0.5);

    if (!WRITE_ENABLED || !session) return;
    if (Math.random() >= CONFIG.writeRatio) return;

    let campaignId = null;
    try {
      const list = campaignsRes.json();
      if (Array.isArray(list) && list.length) {
        campaignId = list[Math.floor(Math.random() * list.length)].id;
      }
    } catch (_e) {
      // segue sem campanha — não força doação sem alvo válido
    }
    if (!campaignId) return;

    writeOpsAttempted.add(1);
    const donateRes = http.post(
      `${CONFIG.supabaseUrl}/rest/v1/convenio_donations`,
      JSON.stringify({
        campaign_id: campaignId,
        amount_cents: 100, // valor sintético mínimo, propósito é medir capacidade
        source: 'loadtest-synthetic',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
          ...authHeaders(session),
        },
        timeout: CONFIG.httpTimeout,
        tags: { name: 'doacoes_criar' },
      }
    );
    recordResponse('doacoes', donateRes);
    if (donateRes.status >= 400) writeOpsFailed.add(1);
  });
}
