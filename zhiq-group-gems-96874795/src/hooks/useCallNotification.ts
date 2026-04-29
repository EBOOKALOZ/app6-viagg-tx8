import { useRef, useCallback, useState, useEffect } from 'react';

interface UseCallNotificationOptions {
  /** Volume between 0 and 1 (default: 0.7 = 70%) */
  volume?: number;
  /** Path to notification sound */
  src: string;
}

/**
 * Hook for playing notification sounds with autoplay fallback.
 * 
 * Features:
 * - Plays sound once per call
 * - Handles autoplay restrictions with fallback button
 * - Volume control (default 10-12%)
 */
export function useCallNotification({ 
  volume = 0.7, 
  src 
}: UseCallNotificationOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const pendingPlayRef = useRef(false);

  // Initialize audio element
  useEffect(() => {
    if (!src) return;

    const audio = new Audio(src);
    audio.volume = Math.min(Math.max(volume, 0), 1);
    audio.preload = 'auto';
    audioRef.current = audio;

    // Check if user has interacted with the page
    const handleInteraction = () => {
      setHasUserInteracted(true);
      setIsBlocked(false);
      
      // If there was a pending play, execute it now
      if (pendingPlayRef.current && audioRef.current) {
        audioRef.current.play().catch(console.warn);
        pendingPlayRef.current = false;
      }
    };

    // CORREÇÃO: Escutar evento customizado de desbloqueio de áudio
    // Emitido quando motoboy clica em "Ficar Online"
    const handleAudioUnlock = () => {
      console.log('[useCallNotification] Áudio desbloqueado via evento');
      setHasUserInteracted(true);
      setIsBlocked(false);
      
      // Pré-carregar o áudio silenciosamente para garantir que funciona
      if (audioRef.current) {
        const originalVolume = audioRef.current.volume;
        audioRef.current.volume = 0;
        audioRef.current.play().then(() => {
          audioRef.current?.pause();
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.volume = originalVolume;
          }
          
          // Se tinha play pendente, executar agora
          if (pendingPlayRef.current && audioRef.current) {
            audioRef.current.play().catch(console.warn);
            pendingPlayRef.current = false;
          }
        }).catch(console.warn);
      }
    };

    // Listen for user interaction
    document.addEventListener('click', handleInteraction, { once: true });
    document.addEventListener('touchstart', handleInteraction, { once: true });
    document.addEventListener('keydown', handleInteraction, { once: true });
    
    // Escutar evento customizado (não once, pode ser disparado múltiplas vezes)
    window.addEventListener('motoboy-audio-unlock', handleAudioUnlock);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('motoboy-audio-unlock', handleAudioUnlock);
    };
  }, [src, volume]);

  // Update volume when it changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(Math.max(volume, 0), 1);
    }
  }, [volume]);

  /**
   * Play the notification sound once
   */
  const playNotification = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Reset to start
    audio.currentTime = 0;

    audio.play().catch((error) => {
      console.warn('Notification sound blocked:', error);
      setIsBlocked(true);
      pendingPlayRef.current = true;
    });
  }, []);

  /**
   * Stop the notification sound
   */
  const stopNotification = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
    pendingPlayRef.current = false;
  }, []);

  /**
   * Manually enable sound (for use with fallback button)
   */
  const enableSound = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setHasUserInteracted(true);
    setIsBlocked(false);

    // Play a silent sound to unlock audio context
    audio.volume = 0;
    audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = Math.min(Math.max(volume, 0), 1);
      
      // If there was a pending play, execute it
      if (pendingPlayRef.current) {
        audio.play().catch(console.warn);
        pendingPlayRef.current = false;
      }
    }).catch(console.warn);
  }, [volume]);

  return {
    playNotification,
    stopNotification,
    enableSound,
    isBlocked,
    hasUserInteracted,
  };
}

export default useCallNotification;
