import { useEffect, useRef, useCallback, useState } from "react";

interface UseSoundtrackMusicOptions {
  /** URL or path to the audio file */
  src: string;
  /** Start time in seconds (default: 21) */
  startTime?: number;
  /** End time in seconds (default: 47) */
  endTime?: number;
  /** Target volume level between 0 and 1 (default: 0.2 for 20%) */
  volume?: number;
  /** Whether to play the audio (default: false) */
  isPlaying?: boolean;
  /** Fade-in duration in ms (default: 1000) */
  fadeInDuration?: number;
  /** Fade-out duration in ms (default: 500) */
  fadeOutDuration?: number;
}

/**
 * Hook para trilha sonora controlada com:
 * - Trecho específico (0:21-0:47 por padrão)
 * - Volume 20% por padrão
 * - Fade-in suave ao iniciar
 * - Fade-out ao parar
 * - Loop contínuo no trecho
 */
export const useSoundtrackMusic = ({
  src,
  startTime = 21,
  endTime = 47,
  volume = 0.2,
  isPlaying = false,
  fadeInDuration = 1000,
  fadeOutDuration = 500,
}: UseSoundtrackMusicOptions) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const pendingPlayRef = useRef(false);
  const isStoppingRef = useRef(false);

  // Detectar interação do usuário para desbloquear áudio
  useEffect(() => {
    const handleInteraction = () => {
      setHasUserInteracted(true);
      
      // Se tinha play pendente, executar agora
      if (pendingPlayRef.current && audioRef.current && !isStoppingRef.current) {
        fadeIn();
      }
    };

    document.addEventListener('click', handleInteraction, { once: true });
    document.addEventListener('touchstart', handleInteraction, { once: true });
    document.addEventListener('keydown', handleInteraction, { once: true });
    
    // Escutar evento de desbloqueio global
    const handleAudioUnlock = () => {
      setHasUserInteracted(true);
      if (pendingPlayRef.current && audioRef.current && !isStoppingRef.current) {
        fadeIn();
      }
    };
    window.addEventListener('motoboy-audio-unlock', handleAudioUnlock);

    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('motoboy-audio-unlock', handleAudioUnlock);
    };
  }, []);

  // Inicializar elemento de áudio
  useEffect(() => {
    if (!src) return;

    const audio = new Audio(src);
    audio.volume = 0; // Começa em 0 para fade-in
    audio.preload = "auto";
    audio.load();
    audioRef.current = audio;

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
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
    };
  }, [src]);

  // Fade-in suave
  const fadeIn = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    isStoppingRef.current = false;
    pendingPlayRef.current = false;
    
    // Limpar fade anterior
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
    }

    audio.currentTime = startTime;
    audio.volume = 0;

    // Navegadores bloqueiam autoplay com som sem gesto prévio do usuário,
    // mas autoplay mudo é sempre permitido. Toca mudo e desmuta em seguida
    // para contornar o bloqueio sem depender de um clique antes de soar.
    audio.muted = true;

    audio.play().then(() => {
      audio.muted = false;
      const targetVolume = Math.min(Math.max(volume, 0), 1);
      const steps = 20;
      const stepDuration = fadeInDuration / steps;
      const volumeStep = targetVolume / steps;
      let currentStep = 0;

      fadeIntervalRef.current = window.setInterval(() => {
        currentStep++;
        if (currentStep >= steps || isStoppingRef.current) {
          if (fadeIntervalRef.current) {
            clearInterval(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
          }
          if (!isStoppingRef.current && audio) {
            audio.volume = targetVolume;
          }
        } else if (audio) {
          audio.volume = Math.min(volumeStep * currentStep, targetVolume);
        }
      }, stepDuration);

      // Iniciar loop do trecho
      startSegmentLoop();
    }).catch((error) => {
      console.warn('[useSoundtrackMusic] Autoplay bloqueado:', error);
      pendingPlayRef.current = true;
    });
  }, [startTime, volume, fadeInDuration]);

  // Fade-out suave
  const fadeOut = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    isStoppingRef.current = true;
    
    // Limpar fade anterior
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
    }

    const currentVolume = audio.volume;
    const steps = 10;
    const stepDuration = fadeOutDuration / steps;
    const volumeStep = currentVolume / steps;
    let currentStep = 0;

    fadeIntervalRef.current = window.setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        if (fadeIntervalRef.current) {
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
        }
        if (audio) {
          audio.pause();
          audio.currentTime = startTime;
          audio.volume = 0;
        }
        // Limpar loop
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else if (audio) {
        audio.volume = Math.max(currentVolume - (volumeStep * currentStep), 0);
      }
    }, stepDuration);
  }, [fadeOutDuration, startTime]);

  // Loop do trecho específico
  const startSegmentLoop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Limpar intervalo anterior
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Verificar posição periodicamente e fazer loop
    intervalRef.current = window.setInterval(() => {
      if (audio && audio.currentTime >= endTime) {
        audio.currentTime = startTime;
        if (audio.paused && !isStoppingRef.current) {
          audio.play().catch(console.warn);
        }
      }
    }, 100);
  }, [startTime, endTime]);

  // Controlar play/stop baseado em isPlaying
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    if (isPlaying) {
      fadeIn();
    } else {
      fadeOut();
    }
  }, [isPlaying, src, fadeIn, fadeOut]);

  // Controles manuais
  const play = useCallback(() => {
    fadeIn();
  }, [fadeIn]);

  const stop = useCallback(() => {
    fadeOut();
  }, [fadeOut]);

  return { play, stop, hasUserInteracted };
};

export default useSoundtrackMusic;
