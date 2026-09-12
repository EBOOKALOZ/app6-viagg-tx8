import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Volume2, VolumeX, Volume1, Radio } from 'lucide-react';
import { RealtimeVisualizer } from '@/components/orion/RealtimeVisualizer';
import { cn } from '@/lib/utils';
import { pillBase, pillWhite } from '@/components/layout/PremiumQuickAccessBar';
import { OrionAudioCenter } from '@/components/orion/OrionAudioCenter';
import { RadioMiniPlayer } from '@/components/orion/RadioMiniPlayer';
import {
  AudioSettings, loadAudioSettings, saveAudioSettings, ensureOrionGraph,
} from '@/lib/orionAudioEngine';
import { hasPendingRadioSession, resumeRadioAfterReload, subscribeRadio, getRadioState } from '@/lib/radioPlayer';
import { isVideoActive } from '@/lib/multimedia/mediaCenter';
import { initAudioManager } from '@/lib/audioManager';

const AUDIO_URL = 'https://jifnpjnffhzosxrdhvxb.supabase.co/storage/v1/object/public/aaudio/background-music.mp3';
// sessionStorage — sobrevive a window.location.href (full reload) dentro da mesma aba
const SESSION_INTERACTED_KEY = 'viagg_audio_interacted';
const SESSION_POSITION_KEY   = 'viagg_audio_position';
const DEFAULT_VOLUME = 0.03;

// Singleton via window — sobrevive ao HMR do Vite (módulo reinicia, window não)
declare global {
  interface Window {
    __viagg_audio__: HTMLAudioElement | undefined;
    __viagg_audio_started__: boolean | undefined;
    __viagg_user_interacted__: boolean | undefined;
  }
}

function getAudio(): HTMLAudioElement | null { return window.__viagg_audio__ ?? null; }
function setAudio(el: HTMLAudioElement) { window.__viagg_audio__ = el; }
function isAudioPlaying(): boolean {
  const a = getAudio();
  return !!a && !a.paused;
}
function hasInteracted(): boolean {
  // window → sobrevive HMR; sessionStorage → sobrevive window.location.href (full reload)
  return !!window.__viagg_user_interacted__ ||
    sessionStorage.getItem(SESSION_INTERACTED_KEY) === '1';
}
function setInteracted(v: boolean) {
  window.__viagg_user_interacted__ = v;
  try {
    if (v) sessionStorage.setItem(SESSION_INTERACTED_KEY, '1');
    else sessionStorage.removeItem(SESSION_INTERACTED_KEY);
  } catch { /* ignore */ }
}

export function forceStopGlobalAudio() {
  const audio = getAudio();
  if (audio && !audio.paused) {
    console.log('[GlobalAudioPlayer] 🔇 forceStop — música pausada por oferta ativa');
    audio.pause();
    audio.currentTime = 0;
  }
}

// ── UI-03: responsividade do painel de áudio ─────────────────────────────────
// Posição/tamanho do painel calculados para ficar SEMPRE 100% dentro da viewport.
type PanelPos = { top: number; right: number; maxHeight: number; mobile: boolean };

// • Mobile (<640px): folha quase full-width (margens de 8px), alinhada à
//   esquerda, imediatamente abaixo da barra superior; altura limitada ao espaço
//   visível → rolagem INTERNA (nunca corte de conteúdo).
// • Tablet/desktop: ancorado ao botão (comportamento original), com clamp da
//   borda esquerda — em desktop largo o resultado é idêntico ao anterior.
function computePanelPos(btn: HTMLElement): PanelPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = btn.getBoundingClientRect();
  const top = Math.max(50, Math.round(r.bottom + 8));
  // Teto original (78vh) LIMITADO ao espaço real abaixo do topo (12px de folga).
  const maxHeight = Math.max(160, Math.min(Math.round(vh * 0.78), vh - top - 12));
  const mobile = vw < 640;
  if (mobile) return { top, right: 8, maxHeight, mobile };
  const panelW = Math.min(vw * 0.94, 340); // espelha w-[min(94vw,340px)] do painel
  const anchored = Math.max(8, Math.round(vw - r.right));
  const right = Math.min(anchored, Math.max(8, Math.round(vw - 8 - panelW)));
  return { top, right, maxHeight, mobile };
}

function getOrCreateAudio(volume: number): HTMLAudioElement {
  let audio = getAudio();
  if (!audio) {
    audio = new Audio();
    // crossOrigin ANTES do src — sem CORS o elemento fica "tainted" e o grafo WebAudio (EQ) sai mudo
    audio.crossOrigin = 'anonymous';
    audio.src = AUDIO_URL;
    audio.loop = true;
    audio.volume = volume;
    audio.preload = 'auto';
    setAudio(audio);
  }
  return audio;
}

export function GlobalAudioPlayer() {
  const radio = useSyncExternalStore(subscribeRadio, getRadioState);
  const [settings, setSettings] = useState<AudioSettings>(loadAudioSettings);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const location = useLocation();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  // Posição do painel de volume — renderizado em document.body (fixed) para
  // NUNCA ser cortado por um ancestral com overflow-hidden (ex.: trust bar).
  // UI-03: inclui maxHeight + modo mobile (folha full-width) — ver computePanelPos.
  const [panelPos, setPanelPos] = useState<PanelPos>({ top: 0, right: 12, maxHeight: 480, mobile: false });

  // Watch for the portal container element in the DOM.
  // ATENÇÃO: no MarketLayout o portal vive dentro da trust bar RETRÁTIL — ela
  // colapsa no scroll (max-h-0 / opacity-0) mas o elemento continua no DOM.
  // Se renderizássemos dentro dele, o controle sumiria ao rolar a página.
  // Por isso só usamos o portal quando ele está REALMENTE visível; senão
  // caímos no botão flutuante fixo (o controle nunca desaparece).
  useEffect(() => {
    const isUsable = (el: HTMLElement | null): el is HTMLElement => {
      if (!el) return false;
      // display:none / desanexado → offsetParent null
      if (el.offsetParent === null) return false;
      // algum ancestral colapsado/oculto (barra retrátil) → tratar como indisponível
      let node: HTMLElement | null = el;
      while (node) {
        const s = window.getComputedStyle(node);
        if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity || '1') === 0) {
          return false;
        }
        node = node.parentElement;
      }
      return true;
    };

    const findPortal = () => {
      const el = document.getElementById('global-audio-portal-trustbar')
                 || document.getElementById('global-audio-portal');
      setPortalTarget(isUsable(el) ? el : null);
    };

    findPortal();

    // re-avalia no scroll (a trust bar colapsa por scroll) — throttled por rAF
    let ticking = false;
    const onScrollOrResize = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => { findPortal(); ticking = false; });
    };
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    window.addEventListener('scroll', onScrollOrResize, { passive: true });

    // childList: portal entra/sai do DOM ao trocar de layout/rota
    const observer = new MutationObserver(findPortal);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize);
      observer.disconnect();
    };
  }, [location.pathname]);

  // Inicializar áudio singleton
  useEffect(() => {
    const initSettings = { ...loadAudioSettings(), volume: DEFAULT_VOLUME };
    saveAudioSettings(initSettings);
    setSettings(initSettings);

    audioRef.current = getOrCreateAudio(DEFAULT_VOLUME);

    // Restaurar posição salva antes do último reload (window.location.href)
    try {
      const savedPos = sessionStorage.getItem(SESSION_POSITION_KEY);
      if (savedPos) {
        const pos = parseFloat(savedPos);
        if (!isNaN(pos) && pos > 0) audioRef.current.currentTime = pos;
        sessionStorage.removeItem(SESSION_POSITION_KEY);
      }
    } catch { /* ignore */ }

    // Sync estado visual com o que já está tocando (ex: após HMR)
    if (!audioRef.current.paused) {
      setIsPlaying(true);
      setIsReady(true);
    }

    audioRef.current.muted = initSettings.muted;
    audioRef.current.volume = DEFAULT_VOLUME;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleCanPlay = () => setIsReady(true);

    audioRef.current.addEventListener('play', handlePlay);
    audioRef.current.addEventListener('pause', handlePause);
    audioRef.current.addEventListener('canplaythrough', handleCanPlay);

    // Salva posição antes de qualquer navegação full-reload (window.location.href)
    const savePositionBeforeUnload = () => {
      const audio = getAudio();
      if (audio && !audio.paused) {
        try { sessionStorage.setItem(SESSION_POSITION_KEY, String(audio.currentTime)); } catch { /* ignore */ }
      }
    };
    window.addEventListener('beforeunload', savePositionBeforeUnload);

    const handleDeliveryStop = () => {
      const audio = getAudio();
      if (audio && !audio.paused) {
        audio.pause();
        setIsPlaying(false);
      }
    };
    window.addEventListener('stop-all-motoboy-audio', handleDeliveryStop);

    // ORION UX AUDIO: coordenador de prioridade (autoplay de mídia nunca rouba a rádio)
    // + retomada da rádio após full reload (window.location.href em 47 navegações)
    initAudioManager();
    void resumeRadioAfterReload();

    // ORION-AUDIO X: abrir o Audio Center na aba Rádio (barra premium → sem navegar)
    const handleOpenRadio = () => setIsPanelOpen(true);
    window.addEventListener('viagg:open-radio', handleOpenRadio);
    // ao tocar uma rádio, pausa a música de fundo do app (evita 2 áudios)
    const handleStopBg = () => { forceStopGlobalAudio(); setIsPlaying(false); };
    const handlePlayBg = () => {
      const audio = getAudio();
      if (!audio || !audio.paused) return;
      startMusic();
    };
    
    window.addEventListener('viagg:stop-bg-music', handleStopBg);
    window.addEventListener('viagg:play-bg-music', handlePlayBg);

    return () => {
      audioRef.current?.removeEventListener('play', handlePlay);
      audioRef.current?.removeEventListener('pause', handlePause);
      audioRef.current?.removeEventListener('canplaythrough', handleCanPlay);
      window.removeEventListener('beforeunload', savePositionBeforeUnload);
      window.removeEventListener('stop-all-motoboy-audio', handleDeliveryStop);
      window.removeEventListener('viagg:open-radio', handleOpenRadio);
      window.removeEventListener('viagg:stop-bg-music', handleStopBg);
      window.removeEventListener('viagg:play-bg-music', handlePlayBg);
      if (fadeRef.current) clearInterval(fadeRef.current);
      // Pausa no desmonte (StrictMode/HMR), mas NÃO reseta hasInteracted
      const audio = getAudio();
      if (audio && !audio.paused) audio.pause();
    };
  }, []);

  // Persistir + aplicar mute/volume ao elemento quando settings mudam
  useEffect(() => {
    saveAudioSettings(settings);
    if (audioRef.current) {
      audioRef.current.muted = settings.muted;
      audioRef.current.volume = settings.volume;
    }
  }, [settings]);

  // Fechar painel ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isPanelOpen &&
        panelRef.current &&
        buttonRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isPanelOpen]);

  // Recalcula a posição do painel (fixed em document.body) a partir do botão.
  // Roda ao abrir e acompanha scroll/resize enquanto aberto (resize também cobre
  // rotação do aparelho e teclado virtual — o maxHeight é recalculado).
  useEffect(() => {
    if (!isPanelOpen) return;
    const reposition = () => {
      if (buttonRef.current) setPanelPos(computePanelPos(buttonRef.current));
    };
    reposition();
    window.addEventListener('scroll', reposition, { passive: true });
    window.addEventListener('resize', reposition, { passive: true });
    return () => {
      window.removeEventListener('scroll', reposition);
      window.removeEventListener('resize', reposition);
    };
  }, [isPanelOpen]);

  // Inicia música com fade-in de 0 → volume padrão em 3s
  const startMusic = useCallback(() => {
    if (isAudioPlaying() || !audioRef.current) return;
    // PRIORIDADE: rádio ativa (ou retomando de um reload) → música de fundo NÃO entra
    if (hasPendingRadioSession()) return;
    // FIX SHC-02: vídeo do Centro Multimídia carregado → música NÃO entra (nunca 2 áudios)
    if (isVideoActive()) return;

    const audio = audioRef.current;
    const targetVolume = DEFAULT_VOLUME;
    audio.volume = 0;
    audio.muted = false;

    audio.play().then(() => {
      setIsPlaying(true);

      let step = 0;
      const steps = 60;
      const intervalMs = 3000 / steps;
      if (fadeRef.current) clearInterval(fadeRef.current);
      fadeRef.current = setInterval(() => {
        step++;
        audio.volume = Math.min(targetVolume, (step / steps) * targetVolume);
        if (step >= steps) {
          audio.volume = targetVolume;
          clearInterval(fadeRef.current!);
          fadeRef.current = null;
        }
      }, intervalMs);
    }).catch((err) => {
      console.warn('[GlobalAudioPlayer] play() blocked:', err);
      // FIX: play() bloqueado pelo browser — rearmar listener para tentar de
      // novo no PRÓXIMO gesto real do usuário (click/touch/key). Sem isso a
      // música nunca tocava porque o listener original já havia sido removido.
      const retryOnGesture = () => {
        document.removeEventListener('click', retryOnGesture, true);
        document.removeEventListener('touchstart', retryOnGesture, true);
        document.removeEventListener('keydown', retryOnGesture, true);
        // Pequeno delay para garantir que o gesto é processado pelo browser
        // antes de chamar play() novamente
        setTimeout(() => {
          if (!isAudioPlaying() && audioRef.current) {
            setInteracted(true);
            startMusic();
          }
        }, 100);
      };
      document.addEventListener('click', retryOnGesture, { capture: true, passive: true, once: true });
      document.addEventListener('touchstart', retryOnGesture, { capture: true, passive: true, once: true });
      document.addEventListener('keydown', retryOnGesture, { capture: true, passive: true, once: true });
    });
  }, []);

  // Constrói o grafo do ORION Audio (EQ/boosters/analisador) no primeiro gesto.
  // Fora de gesto o AudioContext nasce "suspended" e silenciaria a música.
  useEffect(() => {
    if (window.__viagg_audio_graph__) return;
    const buildOnGesture = () => {
      ensureOrionGraph();
      document.removeEventListener('click', buildOnGesture, true);
      document.removeEventListener('keydown', buildOnGesture, true);
    };
    document.addEventListener('click', buildOnGesture, { capture: true, passive: true });
    document.addEventListener('keydown', buildOnGesture, { capture: true, passive: true });
    return () => {
      document.removeEventListener('click', buildOnGesture, true);
      document.removeEventListener('keydown', buildOnGesture, true);
    };
  }, []);

  // Listener de primeira interação do usuário
  useEffect(() => {
    // Se já interagiu (persistido no window), tenta tocar direto
    if (hasInteracted()) {
      startMusic();
      return;
    }

    const onFirstClick = () => {
      setInteracted(true);
      startMusic();
      document.removeEventListener('click', onFirstClick, true);
      document.removeEventListener('touchstart', onFirstClick, true);
      document.removeEventListener('keydown', onFirstClick, true);
    };

    document.addEventListener('click', onFirstClick, { capture: true, passive: true });
    document.addEventListener('touchstart', onFirstClick, { capture: true, passive: true });
    document.addEventListener('keydown', onFirstClick, { capture: true, passive: true });

    return () => {
      document.removeEventListener('click', onFirstClick, true);
      document.removeEventListener('touchstart', onFirstClick, true);
      document.removeEventListener('keydown', onFirstClick, true);
    };
  }, [startMusic]);

  // FIX: Ao navegar entre rotas, re-tentar tocar a música.
  // Antes, a música só era tentada no mount e no primeiro gesto.
  // Se play() falhava (autoplay bloqueado), navegar para outra página não re-tentava.
  useEffect(() => {
    if (hasInteracted() && !isAudioPlaying()) {
      // Delay curto para deixar a nova página montar antes de disputar recursos de áudio
      const t = setTimeout(() => startMusic(), 300);
      return () => clearTimeout(t);
    }
  }, [location.pathname, startMusic]);

  const toggleMute = useCallback(() => {
    setSettings(prev => ({ ...prev, muted: !prev.muted }));
  }, []);

  const handleVolumeChange = useCallback((value: number[]) => {
    const newVolume = value[0] / 100;
    setSettings(prev => ({ ...prev, volume: newVolume, muted: newVolume === 0 }));
  }, []);

  const handleButtonClick = useCallback(() => {
    if (!isAudioPlaying()) {
      setInteracted(true);
      startMusic();
    }
    ensureOrionGraph();
    if (!isPanelOpen && buttonRef.current) {
      setPanelPos(computePanelPos(buttonRef.current));
    }
    setIsPanelOpen(prev => !prev);
  }, [startMusic, isPanelOpen]);

  const VolumeIcon = settings.muted || settings.volume === 0
    ? VolumeX
    : settings.volume < 0.5
      ? Volume1
      : Volume2;

  const isMarketPortal = portalTarget && (portalTarget.id === 'global-audio-portal-trustbar');
  const isMutedState = settings.muted || settings.volume === 0;

  const buttonWrapper = (
    <div className={cn(
      portalTarget ? "relative flex items-center" : "fixed top-28 right-3 z-50"
    )}>
      {/* Botão principal.
          UI-02: na barra premium (portal trustbar) o controle de áudio é o botão
          branco "Som" — pílula idêntica às vizinhas (Favoritos/Notificações/…),
          com o ícone de transmissão carregando o estado do áudio:
          vermelho = mudo · verde = som ativo (pulsando quando tocando).
          Toda a lógica (startMusic, ensureOrionGraph, painel Audio Center,
          mute/volume) permanece a MESMA do antigo botão vermelho circular.

          ROLLBACK UI-02 — estilo antigo do botão da barra (circular vermelho/verde):
          cn(
            'w-8 sm:w-9 h-8 sm:h-9 rounded-full flex items-center justify-center text-white border sm:border-2 border-white shadow-md hover:scale-105 active:scale-95 transition-all outline-none cursor-pointer select-none shrink-0',
            isMutedState ? 'bg-[#EF4444] hover:bg-[#DC2626]' : 'bg-[#10B981] hover:bg-[#059669]'
          )
          ícone antigo: <VolumeIcon className='w-4.5 sm:w-5 h-4.5 sm:h-5 text-white' /> */}
      <button
        ref={buttonRef}
        onClick={handleButtonClick}
        className={cn(
          isMarketPortal
            ? cn(pillBase, pillWhite)
            : portalTarget
              ? cn(
                  'w-9 h-9 rounded-full flex items-center justify-center transition-all text-white shadow-sm active:scale-95',
                  isMutedState
                    ? 'bg-[#EF4444] hover:bg-[#DC2626]'
                    : 'bg-[#10B981] hover:bg-[#059669]'
                )
              : cn(
                  'w-10 h-10 rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 text-white',
                  isPanelOpen ? 'ring-2 ring-white/50' : '',
                  isMutedState
                    ? 'bg-[#EF4444] hover:bg-[#DC2626]'
                    : 'bg-[#10B981] hover:bg-[#059669]'
                ),
          !isReady && 'opacity-50'
        )}
        title="Viagg-TX8 Audio Center"
        aria-label="Abrir Viagg-TX8 Audio Center"
        aria-expanded={isPanelOpen}
      >
        {isMarketPortal ? (
          <div className="flex items-center justify-center scale-[0.6] sm:scale-75 origin-center -mx-2">
             <RealtimeVisualizer mini />
          </div>
        ) : (
          <div className="scale-75 origin-center">
             <RealtimeVisualizer mini />
          </div>
        )}
      </button>
    </div>
  );

  // Painel renderizado em document.body (fixed) → nunca cortado por overflow-hidden.
  // UI-03: no mobile vira folha quase full-width (left+right 8px, largura
  // automática); tablet/desktop mantém a âncora ao botão. maxHeight inline
  // limita a altura ao espaço visível → rolagem interna, zero corte/overflow.
  const panelContent = (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: panelPos.top,
        maxHeight: panelPos.maxHeight,
        ...(panelPos.mobile
          ? { left: 8, right: 8, width: 'auto' }
          : { right: panelPos.right }),
      }}
      className={cn(
        'bg-[#0a1f16]/95 backdrop-blur-xl border border-green-400/50 rounded-2xl shadow-[0_0_50px_10px_rgba(34,197,94,0.35),0_0_20px_2px_rgba(56,189,248,0.2)] ring-1 ring-white/20 p-4 w-[min(94vw,340px)] max-h-[78vh] overflow-y-auto overflow-x-hidden transition-all duration-300 ease-out origin-top-right z-[9999]',
        isPanelOpen
          ? 'opacity-100 scale-100 translate-y-0'
          : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
      )}
    >
      <OrionAudioCenter
        settings={settings}
        setSettings={setSettings}
        isPlaying={isPlaying}
        isOpen={isPanelOpen}
        onToggleMute={toggleMute}
        onVolumeChange={handleVolumeChange}
      />
    </div>
  );

  return (
    <>
      {portalTarget ? createPortal(buttonWrapper, portalTarget) : buttonWrapper}
      {createPortal(panelContent, document.body)}
      {/* Mini Player global da rádio — visível em toda navegação (some com o painel aberto) */}
      <RadioMiniPlayer hidden={isPanelOpen} onOpenCenter={() => setIsPanelOpen(true)} />
    </>
  );
}

export default GlobalAudioPlayer;
