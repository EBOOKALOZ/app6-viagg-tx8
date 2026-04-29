import { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX, Volume1 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';

const AUDIO_URL = 'https://jifnpjnffhzosxrdhvxb.supabase.co/storage/v1/object/public/aaudio/background-music.mp3';
const STORAGE_KEY = 'global_audio_settings';
const DEFAULT_VOLUME = 0.4;

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
  } catch {
    // Ignore parse errors
  }
  return { volume: DEFAULT_VOLUME, muted: false };
}

function saveSettings(settings: AudioSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

// Singleton: única instância de áudio global
let globalAudioInstance: HTMLAudioElement | null = null;
let hasUserInteracted = false;
let audioStarted = false;

/**
 * Para a música de fundo imediatamente.
 * Chamado por useDeliveryOfferListener quando uma oferta é recusada/aceita.
 */
export function forceStopGlobalAudio() {
  if (globalAudioInstance && !globalAudioInstance.paused) {
    console.log('[GlobalAudioPlayer] 🔇 forceStop — música pausada por oferta ativa');
    globalAudioInstance.pause();
    globalAudioInstance.currentTime = 0;
  }
  audioStarted = false;
}

function getOrCreateAudio(volume: number): HTMLAudioElement {
  if (!globalAudioInstance) {
    console.log('[GlobalAudioPlayer] Creating singleton audio instance');
    globalAudioInstance = new Audio(AUDIO_URL);
    globalAudioInstance.loop = true;
    globalAudioInstance.volume = volume;
    globalAudioInstance.preload = 'auto';
  }
  return globalAudioInstance;
}

/**
 * GlobalAudioPlayer - Player de música de fundo global com controle de volume
 * 
 * Características:
 * - Singleton: única instância de áudio em toda a aplicação
 * - Inicia após primeiro clique do usuário
 * - Continua tocando durante navegação
 * - Loop contínuo
 * - Botão fixo no canto inferior direito
 * - Painel expansível com slider de volume
 * - Preferências salvas em localStorage
 */
export function GlobalAudioPlayer() {
  const [settings, setSettings] = useState<AudioSettings>(loadSettings);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Inicializar áudio singleton
  useEffect(() => {
    audioRef.current = getOrCreateAudio(settings.volume);
    
    // Atualizar estado baseado no áudio existente
    if (audioStarted && !audioRef.current.paused) {
      setIsPlaying(true);
      setIsReady(true);
    }

    // Aplicar configurações salvas
    if (audioRef.current) {
      audioRef.current.muted = settings.muted;
      audioRef.current.volume = settings.volume;
    }

    // Listeners
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleCanPlay = () => setIsReady(true);

    audioRef.current.addEventListener('play', handlePlay);
    audioRef.current.addEventListener('pause', handlePause);
    audioRef.current.addEventListener('canplaythrough', handleCanPlay);

    // ★ Pausar música de fundo quando chega chamada de entrega
    const handleDeliveryStop = () => {
      if (globalAudioInstance && !globalAudioInstance.paused) {
        console.log('[GlobalAudioPlayer] ⏸ Pausando música — oferta de entrega ativa');
        globalAudioInstance.pause();
        setIsPlaying(false);
      }
    };
    window.addEventListener('stop-all-motoboy-audio', handleDeliveryStop);

    return () => {
      audioRef.current?.removeEventListener('play', handlePlay);
      audioRef.current?.removeEventListener('pause', handlePause);
      audioRef.current?.removeEventListener('canplaythrough', handleCanPlay);
      window.removeEventListener('stop-all-motoboy-audio', handleDeliveryStop);
    };
  }, []);

  // Salvar configurações quando mudam
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

  // Função para iniciar música após interação
  const startMusic = useCallback(() => {
    if (audioStarted || !audioRef.current) return;
    
    console.log('[GlobalAudioPlayer] Starting music after user interaction');
    audioStarted = true;
    
    audioRef.current.play().then(() => {
      console.log('[GlobalAudioPlayer] ✅ Music started successfully');
      setIsPlaying(true);
    }).catch((error) => {
      console.warn('[GlobalAudioPlayer] Failed to start:', error);
      audioStarted = false;
    });
  }, []);

  // Listener global para primeiro clique
  useEffect(() => {
    if (hasUserInteracted) {
      startMusic();
      return;
    }

    const handleFirstInteraction = () => {
      if (hasUserInteracted) return;
      
      console.log('[GlobalAudioPlayer] First user interaction detected');
      hasUserInteracted = true;
      startMusic();
      
      document.removeEventListener('click', handleFirstInteraction, true);
      document.removeEventListener('touchstart', handleFirstInteraction, true);
      document.removeEventListener('keydown', handleFirstInteraction, true);
    };

    document.addEventListener('click', handleFirstInteraction, { capture: true, passive: true });
    document.addEventListener('touchstart', handleFirstInteraction, { capture: true, passive: true });
    document.addEventListener('keydown', handleFirstInteraction, { capture: true, passive: true });

    return () => {
      document.removeEventListener('click', handleFirstInteraction, true);
      document.removeEventListener('touchstart', handleFirstInteraction, true);
      document.removeEventListener('keydown', handleFirstInteraction, true);
    };
  }, [startMusic]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    setSettings(prev => ({ ...prev, muted: !prev.muted }));
  }, []);

  // Atualizar volume
  const handleVolumeChange = useCallback((value: number[]) => {
    const newVolume = value[0] / 100;
    setSettings(prev => ({ ...prev, volume: newVolume, muted: newVolume === 0 }));
  }, []);

  // Toggle painel
  const handleButtonClick = useCallback(() => {
    // Se música não iniciou, iniciar
    if (!audioStarted) {
      hasUserInteracted = true;
      startMusic();
    }
    setIsPanelOpen(prev => !prev);
  }, [startMusic]);

  // Ícone baseado no estado
  const VolumeIcon = settings.muted || settings.volume === 0 
    ? VolumeX 
    : settings.volume < 0.5 
      ? Volume1 
      : Volume2;

  const volumePercent = Math.round(settings.volume * 100);

  return (
    <div className="fixed bottom-24 right-4 z-50">
      {/* Painel de volume */}
      <div
        ref={panelRef}
        className={cn(
          'absolute bottom-16 right-0 mb-2',
          'bg-[hsl(142,50%,15%)] border border-primary/30',
          'rounded-2xl shadow-xl p-4',
          'min-w-[200px]',
          'transition-all duration-200 ease-out origin-bottom-right',
          isPanelOpen 
            ? 'opacity-100 scale-100 translate-y-0' 
            : 'opacity-0 scale-95 translate-y-2 pointer-events-none'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-white">Volume</span>
          </div>
          <span className="text-xs font-bold text-primary bg-primary/20 px-2 py-0.5 rounded-full">
            {volumePercent}%
          </span>
        </div>

        {/* Slider */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleMute}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              settings.muted 
                ? 'bg-destructive/20 text-destructive' 
                : 'bg-primary/20 text-primary hover:bg-primary/30'
            )}
          >
            <VolumeIcon className="w-4 h-4" />
          </button>
          
          <Slider
            value={[volumePercent]}
            onValueChange={handleVolumeChange}
            max={100}
            step={1}
            className="flex-1 [&_[data-radix-slider-track]]:bg-white/20 [&_[data-radix-slider-range]]:bg-primary [&_[data-radix-slider-thumb]]:border-primary [&_[data-radix-slider-thumb]]:bg-white"
          />
        </div>

        {/* Status */}
        <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
          <span className="text-xs text-white/60">
            {isPlaying ? '♪ Tocando' : 'Pausado'}
          </span>
          {settings.muted && (
            <span className="text-xs text-destructive/80">Mudo</span>
          )}
        </div>
      </div>

      {/* Botão principal */}
      <button
        ref={buttonRef}
        onClick={handleButtonClick}
        className={cn(
          'w-12 h-12 rounded-full',
          'flex items-center justify-center',
          'shadow-lg transition-all duration-300',
          'hover:scale-110 active:scale-95',
          isPanelOpen
            ? 'bg-primary text-primary-foreground ring-2 ring-primary/50'
            : settings.muted 
              ? 'bg-muted text-muted-foreground hover:bg-muted/80' 
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          !isReady && 'opacity-50'
        )}
        title="Controle de áudio"
        aria-label="Abrir controle de volume"
        aria-expanded={isPanelOpen}
      >
        <VolumeIcon className={cn('w-5 h-5', isPlaying && !settings.muted && 'animate-pulse')} />
      </button>
    </div>
  );
}

export default GlobalAudioPlayer;
