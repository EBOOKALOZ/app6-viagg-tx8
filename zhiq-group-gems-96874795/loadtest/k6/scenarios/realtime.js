// Cenário: eventos Realtime — conecta ao Supabase Realtime (Phoenix
// Channels sobre WebSocket) e assina um canal de leilão, medindo tempo de
// conexão e latência até receber ao menos um evento (heartbeat/presença).
//
// Requer o módulo experimental de WebSockets do k6 (k6 >=0.43). Este
// cenário é isolado dos demais (roda como executor "realtime" separado em
// main.js) porque o padrão de conexão persistente é fundamentalmente
// diferente de request/response HTTP — misturar os dois no mesmo VU
// distorceria tanto o RPS do HTTP quanto a contagem de conexões WS.
//
// Escopo deliberadamente pequeno: valida que o Realtime aguenta N conexões
// simultâneas e propaga eventos, não que every VU HTTP também tenha uma
// conexão WS (isso infla artificialmente o teste sem refletir uso real —
// a maioria dos usuários de um marketplace não fica com um canal Realtime
// aberto o tempo todo).

import ws from 'k6/ws';
import { check } from 'k6';
import { CONFIG } from '../lib/config.js';
import {
  realtimeConnectDuration,
  realtimeMessageLatency,
  realtimeConnectFailures,
} from '../lib/metrics.js';
import { pickSeedId, hasSeed } from '../lib/seedData.js';

export function realtimeScenario() {
  if (!hasSeed('auctions')) return;
  const auctionId = pickSeedId('auctions');
  const channelTopic = `realtime:auction-bids-${auctionId}`;
  const url = `${CONFIG.supabaseUrl.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${CONFIG.supabaseAnonKey}&vsn=1.0.0`;

  const connectStart = Date.now();
  let joined = false;
  let firstMessageAt = null;

  const res = ws.connect(url, {}, (socket) => {
    socket.on('open', () => {
      realtimeConnectDuration.add(Date.now() - connectStart);
      socket.send(JSON.stringify({
        topic: channelTopic,
        event: 'phx_join',
        payload: {},
        ref: '1',
      }));
    });

    socket.on('message', (data) => {
      if (!firstMessageAt) {
        firstMessageAt = Date.now();
        realtimeMessageLatency.add(firstMessageAt - connectStart);
      }
      try {
        const msg = JSON.parse(data);
        if (msg.event === 'phx_reply' && msg.payload && msg.payload.status === 'ok') {
          joined = true;
        }
      } catch (_e) {
        // mensagens não-JSON (heartbeat bruto) são ignoradas
      }
    });

    socket.on('error', () => {
      realtimeConnectFailures.add(1);
    });

    // Mantém a conexão aberta por uma janela curta para observar estabilidade,
    // depois fecha — não é uma sessão de usuário real de duração indefinida.
    socket.setTimeout(() => {
      socket.close();
    }, 15000);
  });

  check(res, { 'realtime handshake HTTP ok': (r) => r && r.status === 101 });
  if (!joined) realtimeConnectFailures.add(1);
}
