// Cenário: wallet — consulta de saldo/extrato via RPC get_my_merchant_pay_wallet.
// Somente leitura: operações de crédito/débito real de dinheiro (payments-charge)
// ficam FORA do escopo padrão deste teste de carga (ver docs/ARQUITETURA.md
// "Fora de escopo") por envolverem o gateway de pagamento real mesmo em
// staging — habilitar só com sandbox do Mercado Pago confirmado.

import http from 'k6/http';
import { sleep, group } from 'k6';
import { CONFIG } from '../lib/config.js';
import { recordResponse } from '../lib/metrics.js';
import { authHeaders } from '../lib/auth.js';

export function walletScenario(session) {
  if (!session) return; // wallet sempre requer usuário autenticado
  group('wallet', () => {
    const res = http.post(
      `${CONFIG.supabaseUrl}/rest/v1/rpc/get_my_merchant_pay_wallet`,
      JSON.stringify({}),
      {
        headers: { 'Content-Type': 'application/json', ...authHeaders(session) },
        timeout: CONFIG.httpTimeout,
        tags: { name: 'wallet_saldo' },
      }
    );
    recordResponse('wallet', res);
    sleep(Math.random() * 1 + 0.5);
  });
}
