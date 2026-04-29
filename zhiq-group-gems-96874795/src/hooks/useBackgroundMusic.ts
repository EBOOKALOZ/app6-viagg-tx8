import { useEffect, useRef, useCallback, useState } from "react";

interface UseBackgroundMusicOptions {
  /** URL or path to the audio file */
  src: string;
  /** Start time in seconds (default: 0) */
  startTime?: number;
  /** End time in seconds (default: full duration) */
  endTime?: number;
  /** Volume level between 0 and 1 (default: 1.0 for maximum) */
  volume?: number;
  /** Whether to play the audio (default: false) */
  isPlaying?: boolean;
  /** Whether to loop the segment (default: true) */
  loop?: boolean;
}

/**
 * Custom hook for background music/beep playback with segment control.
 * 
 * Features:
 * - Play specific segment of audio file
 * - Continuous loop within segment
 * - Volume control (default: maximum)
 * - Play/stop based on external state
 * - Respects browser autoplay restrictions
 * 
 * Usage:
 * ```tsx
 * import backgroundMusic from "@/assets/background-music.mp3";
 * 
 * useBackgroundMusic({
 *   src: backgroundMusic,
 *   startTime: 21,  // Start at 0:21
 *   endTime: 47,    // End at 0:47
 *   volume: 1.0,    // 100% volume (maximum)
 *   isPlaying: rideStatus === "searching",
 * });
 * ```
 */
export const useBackgroundMusic = ({
  src,
  startTime = 0,
  endTime,
  volume = 1.0, // CORREÇÃO: Volume máximo por padrão
  isPlaying = false,
  loop = true,
}: UseBackgroundMusicOptions) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const pendingPlayRef = useRef(false);

  // Detectar interação do usuário para desbloquear áudio
  useEffect(() => {
    const handleInteraction = () => {
      console.log('[useBackgroundMusic] Interação detectada - áudio desbloqueado');
      setHasUserInteracted(true);
      
      // Se tinha play pendente, executar agora
      if (pendingPlayRef.current && audioRef.current) {
        audioRef.current.currentTime = startTime;
        audioRef.current.play().catch(console.warn);
      }
    };

    document.addEventListener('click', handleInteraction, { once: true });
    document.addEventListener('touchstart', handleInteraction, { once: true });
    document.addEventListener('keydown', handleInteraction, { once: true });

    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, [startTime]);

  // Initialize audio element
  useEffect(() => {
    if (!src) return;

    const audio = new Audio(src);
    audio.volume = Math.min(Math.max(volume, 0), 1); // Clamp between 0-1
    audio.preload = "auto";
    audio.load(); // CORREÇÃO: Carregar áudio imediatamente
    audioRef.current = audio;

    console.log('[useBackgroundMusic] Áudio inicializado, volume:', volume);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [src]);

  // Update volume when it changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(Math.max(volume, 0), 1);
      console.log('[useBackgroundMusic] Volume atualizado:', volume);
    }
  }, [volume]);

  // Handle segment looping
  const startSegmentLoop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // CORREÇÃO: Limpar intervalo anterior antes de criar novo
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Set initial position
    audio.currentTime = startTime;

    // Check position periodically and loop back when reaching end
    intervalRef.current = window.setInterval(() => {
      if (audio && endTime && audio.currentTime >= endTime) {
        if (loop) {
          audio.currentTime = startTime;
          // CORREÇÃO: Garantir que o áudio continue tocando após loop
          if (audio.paused) {
            audio.play().catch(console.warn);
          }
        } else {
          audio.pause();
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      }
    }, 100); // Check every 100ms
  }, [startTime, endTime, loop]);

  // Handle play/stop based on isPlaying prop
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    if (isPlaying) {
      console.log('[useBackgroundMusic] Tentando tocar áudio, hasUserInteracted:', hasUserInteracted);
      
      // CORREÇÃO: Reiniciar do início a cada novo play
      audio.currentTime = startTime;
      audio.volume = Math.min(Math.max(volume, 0), 1); // Garantir volume correto
      startSegmentLoop();
      
      audio.play().then(() => {
        console.log('[useBackgroundMusic] Áudio tocando com sucesso!');
        pendingPlayRef.current = false;
      }).catch((error) => {
        // Handle autoplay restrictions
        console.warn("[useBackgroundMusic] Autoplay bloqueado:", error);
        pendingPlayRef.current = true; // Marcar para tocar quando usuário interagir
      });
    } else {
      // CORREÇÃO: Parar áudio imediatamente quando isPlaying = false
      console.log('[useBackgroundMusic] Parando áudio');
      audio.pause();
      audio.currentTime = startTime;
      pendingPlayRef.current = false;
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isPlaying, src, startTime, volume, startSegmentLoop]);

  // Manual controls (optional)
  const play = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = startTime;
      audio.volume = Math.min(Math.max(volume, 0), 1);
      startSegmentLoop();
      audio.play().catch(console.warn);
    }
  }, [startTime, volume, startSegmentLoop]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = startTime;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    pendingPlayRef.current = false;
  }, [startTime]);

  const setVolume = useCallback((newVolume: number) => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(Math.max(newVolume, 0), 1);
    }
  }, []);

  return { play, stop, setVolume, hasUserInteracted };
};

export default useBackgroundMusic;
