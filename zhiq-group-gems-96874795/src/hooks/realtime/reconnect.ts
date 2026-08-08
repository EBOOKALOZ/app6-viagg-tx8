// ── VIAGG-TX8™ — helper de reconexão para canais Supabase Realtime ──────────
//
// Replica o padrão já aprovado em src/lib/events/RealtimeService.ts:31-42
// (reconectar em 5s ao cair o canal) para hooks operacionais que escutam
// notificação de corrida/entrega — onde perder a conexão silenciosamente
// significa parar de tocar chamadas para o motoboy/motorista.
//
// Uso típico dentro do useEffect que monta o canal:
//
//   const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const mountedRef = useRef(true);
//   useEffect(() => {
//     mountedRef.current = true;
//     ...
//     channel.subscribe((status) => {
//       handleChannelStatus(status, {
//         label: '[useX]',
//         isMountedRef: mountedRef,
//         reconnectTimeoutRef: reconnectRef,
//         onReconnect: () => setReloadKey((k) => k + 1), // força o efeito a remontar o canal
//       });
//     });
//     return () => {
//       mountedRef.current = false;
//       if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
//       supabase.removeChannel(channel);
//     };
//   }, [reloadKey, ...]);

import type { MutableRefObject } from 'react';

export type RealtimeChannelStatus =
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED'
  | string;

const RECONNECT_DELAY_MS = 5000;

interface HandleChannelStatusOptions {
  /** Prefixo usado nos logs (ex.: '[useRealtimeCalls]') */
  label: string;
  /** Ref que indica se o componente/efeito ainda está montado */
  isMountedRef: MutableRefObject<boolean>;
  /** Ref que guarda o timer de reconexão pendente, para poder cancelar no cleanup */
  reconnectTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  /** Chamado após o delay para disparar a reconexão (ex.: recriar o canal) */
  onReconnect: () => void;
  /** Callback opcional para refletir o estado de conexão na UI */
  onStatusChange?: (status: RealtimeChannelStatus) => void;
}

/**
 * Trata o callback de status do `channel.subscribe((status) => ...)`.
 * Em CHANNEL_ERROR/TIMED_OUT/CLOSED, agenda reconexão em 5s (mesmo padrão
 * do RealtimeService), cancelando qualquer timer anterior e nunca disparando
 * a reconexão se o componente já foi desmontado.
 */
export function handleChannelStatus(
  status: RealtimeChannelStatus,
  {
    label,
    isMountedRef,
    reconnectTimeoutRef,
    onReconnect,
    onStatusChange,
  }: HandleChannelStatusOptions
): void {
  if (!isMountedRef.current) return;

  onStatusChange?.(status);

  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
    console.warn(`${label} canal em estado ${status}, reconectando em ${RECONNECT_DELAY_MS / 1000}s…`);

    // Evita empilhar múltiplos timers se vários canais/callbacks caírem juntos
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      if (!isMountedRef.current) return; // desmontou enquanto esperava — não reconectar
      onReconnect();
    }, RECONNECT_DELAY_MS);
  }
}

/** Cancela um timer de reconexão pendente (usar no cleanup do useEffect). */
export function clearReconnectTimeout(
  reconnectTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
): void {
  if (reconnectTimeoutRef.current) {
    clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = null;
  }
}
