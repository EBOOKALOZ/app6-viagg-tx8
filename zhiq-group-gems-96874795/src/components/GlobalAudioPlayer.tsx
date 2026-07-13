import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Volume2, VolumeX, Volume1 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';

const AUDIO_URL = 'https://jifnpjnffhzosxrdhvxb.supabase.co/storage/v1/object/public/aaudio/background-music.mp3';
const STORAGE_KEY = 'global_audio_settings';
// sessionStorage — sobrevive a window.location.href (full reload) dentro da mesma aba
const SESSION_INTERACTED_KEY = 'viagg_audio_interacted';
const SESSION_POSITION_KEY   = 'viagg_audio_position';
const DEFAULT_VOLUME = 0.03;

interface AudioSettings {
  volume: number;
  muted: boolean;
}

function loadSettings(): AudioSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        volume: typeof parsed.volume === 'number' ? parsed.volume : DEFAULT_VOLUME,
        muted: typeof parsed.muted === 'boolean' ? parsed.muted : false,
      };
    }
  } catch { /* ignore */ }
  return { volume: DEFAULT_VOLUME, muted: false };
}

function saveSettings(settings: AudioSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

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

function getOrCreateAudio(volume: number): HTMLAudioElement {
  let audio = getAudio();
  if (!audio) {
    audio = new Audio(AUDIO_URL);
    audio.loop = true;
    audio.volume = volume;
    audio.preload = 'auto';
    setAudio(audio);
  }
  return audio;
}

export function GlobalAudioPlayer() {
  const [settings, setSettings] = useState<AudioSettings>(loadSettings);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const location = useLocation();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  // Watch for the portal container element in the DOM
  useEffect(() => {
    const findPortal = () => {
      const el = document.getElementById('global-audio-portal-trustbar') 
                 || document.getElementById('global-audio-portal');
      setPortalTarget(el);
    };

    findPortal();

    window.addEventListener('resize', findPortal);

    const observer = new MutationObserver(findPortal);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', findPortal);
      observer.disconnect();
    };
  }, [location.pathname]);

  // Inicializar áudio singleton
  useEffect(() => {
    const initSettings = { ...loadSettings(), volume: DEFAULT_VOLUME };
    saveSettings(initSettings);
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

    return () => {
      audioRef.current?.removeEventListener('play', handlePlay);
      audioRef.current?.removeEventListener('pause', handlePause);
      audioRef.current?.removeEventListener('canplaythrough', handleCanPlay);
      window.removeEventListener('beforeunload', savePositionBeforeUnload);
      window.removeEventListener('stop-all-motoboy-audio', handleDeliveryStop);
      if (fadeRef.current) clearInterval(fadeRef.current);
      // Pausa no desmonte (StrictMode/HMR), mas NÃO reseta hasInteracted
      const audio = getAudio();
      if (audio && !audio.paused) audio.pause();
    };
  }, []);

  // Aplicar mute/volume ao elemento quando settings mudam
  useEffect(() => {
    saveSettings(settings);
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

  // Inicia música com fade-in de 0 → volume salvo em 3s
  const startMusic = useCallback(() => {
    if (isAudioPlaying() || !audioRef.current) return;

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
    });
  }, []);

  // Listener de primeira interação do usuário
  useEffect(() => {
    // Se já interagiu (persistido no window), tenta tocar direto
    if (hasInteracted()) {
      startMusic();
      return;
    }

    const onFirstClick = () => {
      if (hasInteracted()) return;
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
    setIsPanelOpen(prev => !prev);
  }, [startMusic]);

  const VolumeIcon = settings.muted || settings.volume === 0
    ? VolumeX
    : settings.volume < 0.5
      ? Volume1
      : Volume2;

  const volumePercent = Math.round(settings.volume * 100);
  const isMarketPortal = portalTarget && (portalTarget.id === 'global-audio-portal-trustbar');

  const componentContent = (
    <div className={cn(
      portalTarget ? "relative flex items-center" : "fixed top-28 right-3 z-50"
    )}>
      {/* Botão principal */}
      <button
        ref={buttonRef}
        onClick={handleButtonClick}
        className={cn(
          isMarketPortal
            ? 'w-7 h-7 rounded-md bg-[#F5E62B] text-gray-900 flex items-center justify-center hover:brightness-95 hover:-translate-y-0.5 active:translate-y-0 shadow-lg'
            : portalTarget
              ? 'w-9 h-9 rounded-full flex items-center justify-center transition-all hover:bg-white/10 text-white shadow-none active:scale-95'
              : 'w-10 h-10 rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95',
          !portalTarget && (
            isPanelOpen
              ? 'bg-primary text-primary-foreground ring-2 ring-primary/50'
              : settings.muted
                ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
          ),
          !isReady && 'opacity-50'
        )}
        title="Controle de áudio"
        aria-label="Abrir controle de volume"
        aria-expanded={isPanelOpen}
      >
        <VolumeIcon className={cn(isMarketPortal ? 'w-3.5 h-3.5' : portalTarget ? 'w-5 h-5' : 'w-4 h-4', isPlaying && !settings.muted && 'animate-pulse')} />
      </button>

      {/* Painel de volume (abre para baixo) */}
      <div
        ref={panelRef}
        className={cn(
          'absolute mt-2 bg-[#0a1f16]/90 backdrop-blur-xl border border-green-400/50 rounded-2xl shadow-[0_0_50px_10px_rgba(34,197,94,0.35),0_0_20px_2px_rgba(56,189,248,0.2)] ring-1 ring-white/20 p-4 min-w-[220px] transition-all duration-300 ease-out origin-top-right z-[60]',
          isMarketPortal ? 'top-9 right-0' : portalTarget ? 'top-10 right-0' : 'top-12 right-0',
          isPanelOpen
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
        )}
      >
        <div className="relative flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-500/20 rounded-full ring-1 ring-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.4)]">
              <Volume2 className="w-4 h-4 text-green-400" />
            </div>
            <span className="text-sm font-bold text-white tracking-wide">Volume</span>
          </div>
          <span className="text-xs font-black text-green-300 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full shadow-inner">
            {volumePercent}%
          </span>
        </div>

        <div className="relative flex items-center gap-4 mb-2">
          <button
            onClick={toggleMute}
            className={cn(
              'p-2 rounded-full transition-all duration-300 ring-1',
              settings.muted
                ? 'bg-red-500/10 text-red-400 ring-red-500/30 hover:bg-red-500/20 hover:ring-red-500/50 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                : 'bg-green-500/10 text-green-400 ring-green-500/30 hover:bg-green-500/20 hover:ring-green-500/50 hover:shadow-[0_0_15px_rgba(34,197,94,0.3)]'
            )}
          >
            <VolumeIcon className="w-4 h-4" />
          </button>

          <Slider
            value={[volumePercent]}
            onValueChange={handleVolumeChange}
            max={100}
            step={1}
            className="flex-1 [&_[data-radix-slider-track]]:bg-white/10 [&_[data-radix-slider-track]]:h-1.5 [&_[data-radix-slider-range]]:bg-gradient-to-r [&_[data-radix-slider-range]]:from-green-500 [&_[data-radix-slider-range]]:to-emerald-400 [&_[data-radix-slider-thumb]]:border-0 [&_[data-radix-slider-thumb]]:bg-white [&_[data-radix-slider-thumb]]:shadow-[0_0_10px_rgba(255,255,255,0.8)] [&_[data-radix-slider-thumb]]:w-4 [&_[data-radix-slider-thumb]]:h-4"
          />
        </div>

        <div className="relative mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPlaying ? (
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="text-xs text-green-400 font-medium">Tocando</span>
              </span>
            ) : (
              <span className="text-xs text-zinc-400 font-medium">Pausado</span>
            )}
          </div>
          
          {settings.muted && (
            <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 uppercase tracking-wider">
              Mudo
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (portalTarget) {
    return createPortal(componentContent, portalTarget);
  }

  return componentContent;
}

export default GlobalAudioPlayer;
