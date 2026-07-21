/**
 * audioManager.ts — ORION UX AUDIO: coordenador de PRIORIDADE de áudio.
 *
 * Regra: quando a RÁDIO está tocando, ela é o áudio prioritário da plataforma.
 *  • Mídia com autoplay (vídeo de produto etc.) NÃO pode roubar o som → é pausada.
 *  • Mídia iniciada por CLIQUE do usuário vence: pausa a rádio e, quando a mídia
 *    termina/fecha, oferece "Continuar rádio" (toast com ação).
 *
 * Como: listener de 'play' em CAPTURA no document — eventos de mídia não borbulham,
 * mas a fase de captura passa por document → pega TODO <video>/<audio> montado no DOM,
 * sem tocar em cada componente (zero duplicação). Elementos DESANEXADOS (new Audio():
 * bips de chamada, música de fundo, a própria rádio) nunca passam por aqui — bips
 * operacionais continuam bipando.
 *
 * Distinção autoplay × clique: timestamp do último gesto (pointerdown/keydown);
 * 'play' a menos de 1,5s de um gesto = ação manual do usuário.
 */
import { toast } from 'sonner';
import { getRadioState, pauseRadio, togglePlay } from '@/lib/radioPlayer';

declare global {
  interface Window {
    __viagg_audio_manager__: boolean | undefined;
  }
}

const GESTURE_WINDOW_MS = 1500;
let lastGestureAt = 0;
let pendingResume = false;
let watchTimer: ReturnType<typeof setInterval> | null = null;

function offerResume() {
  if (!pendingResume) return;
  pendingResume = false;
  if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
  const st = getRadioState();
  if (!st.station || st.playing) return;
  toast(`📻 Continuar ouvindo ${st.station.name}?`, {
    duration: 12000,
    action: { label: '▶ Voltar para a Rádio', onClick: () => togglePlay() },
  });
}

// vigia a mídia manual: terminou, pausou ou saiu do DOM (modal fechado sem 'pause')
function watchManualMedia(el: HTMLMediaElement) {
  const done = () => offerResume();
  el.addEventListener('ended', done, { once: true });
  el.addEventListener('pause', done, { once: true });
  if (watchTimer) clearInterval(watchTimer);
  watchTimer = setInterval(() => {
    if (!document.contains(el) || el.paused || el.ended) offerResume();
  }, 3000);
}

export function initAudioManager(): void {
  if (typeof window === 'undefined' || window.__viagg_audio_manager__) return;
  window.__viagg_audio_manager__ = true;

  const markGesture = () => { lastGestureAt = Date.now(); };
  document.addEventListener('pointerdown', markGesture, { capture: true, passive: true });
  document.addEventListener('keydown', markGesture, { capture: true, passive: true });

  document.addEventListener('play', (ev) => {
    const el = ev.target as HTMLMediaElement | null;
    if (!el || !(el instanceof HTMLMediaElement)) return;
    if (el.muted || el.volume === 0) return;          // mídia sem som não disputa áudio

    const radio = getRadioState();
    if (!radio.station || (!radio.playing && !radio.loading)) return;

    const isManual = Date.now() - lastGestureAt < GESTURE_WINDOW_MS;
    if (!isManual) {
      // autoplay durante a rádio → bloqueia (a rádio é o áudio prioritário)
      try { el.pause(); } catch { /* ignore */ }
      console.info('[audioManager] autoplay de mídia bloqueado (rádio no ar)');
      return;
    }
    // clique do usuário → a mídia vence: pausa a rádio e oferece retomar depois
    pauseRadio();
    pendingResume = true;
    watchManualMedia(el);
    console.info('[audioManager] mídia manual → rádio pausada (retomada será oferecida)');
  }, true);
}
