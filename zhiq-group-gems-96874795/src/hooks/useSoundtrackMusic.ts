import { useEffect, useRef, useCallback, useState } from "react";

interface UseSoundtrackMusicOptions {
  src: string;
  startTime?: number;
  endTime?: number;
  volume?: number;
  isPlaying?: boolean;
  fadeInDuration?: number;
  fadeOutDuration?: number;
}

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
  const isStoppingRef = useRef(false);
  const isStartingRef = useRef(false);
  const pendingPlayRef = useRef(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Criar elemento de áudio
  useEffect(() => {
    if (!src) return;
    const audio = new Audio(src);
    audio.volume = 0;
    audio.preload = "auto";
    audio.load();
    audioRef.current = audio;
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    };
  }, [src]);

  // Loop do trecho
  const startSegmentLoop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      if (audio && audio.currentTime >= endTime) {
        audio.currentTime = startTime;
        if (audio.paused && !isStoppingRef.current) audio.play().catch(() => {});
      }
    }, 100);
  }, [startTime, endTime]);

  // Fade-in
  const fadeIn = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Já tocando ou iniciando — não duplica
    if ((!audio.paused || isStartingRef.current) && !isStoppingRef.current) return;

    isStoppingRef.current = false;
    isStartingRef.current = true;
    pendingPlayRef.current = false;

    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);

    audio.currentTime = startTime;
    audio.volume = 0;
    audio.muted = false;

    const doFadeVolume = () => {
      isStartingRef.current = false;
      const target = Math.min(Math.max(volume, 0), 1);
      const steps = 20;
      const stepDur = fadeInDuration / steps;
      const step = target / steps;
      let n = 0;
      fadeIntervalRef.current = window.setInterval(() => {
        n++;
        if (n >= steps || isStoppingRef.current) {
          if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
          if (!isStoppingRef.current && audio) audio.volume = target;
        } else if (audio) {
          audio.volume = Math.min(step * n, target);
        }
      }, stepDur);
      startSegmentLoop();
    };

    // Tenta sem muted primeiro (funciona dentro de gesto do usuário)
    audio.play()
      .then(doFadeVolume)
      .catch(() => {
        // Bloqueado sem gesto — tenta com muted (funciona em alguns navegadores)
        audio.muted = true;
        audio.play()
          .then(() => {
            audio.muted = false;
            doFadeVolume();
          })
          .catch((err) => {
            isStartingRef.current = false;
            console.warn("[useSoundtrackMusic] Autoplay bloqueado:", err);
            pendingPlayRef.current = true;
          });
      });
  }, [startTime, volume, fadeInDuration, startSegmentLoop]);

  // Fade-out
  const fadeOut = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    isStoppingRef.current = true;
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    const cur = audio.volume;
    const steps = 10;
    const stepDur = fadeOutDuration / steps;
    const step = cur / steps;
    let n = 0;
    fadeIntervalRef.current = window.setInterval(() => {
      n++;
      if (n >= steps) {
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
        if (audio) { audio.pause(); audio.currentTime = startTime; audio.volume = 0; }
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      } else if (audio) {
        audio.volume = Math.max(cur - step * n, 0);
      }
    }, stepDur);
  }, [fadeOutDuration, startTime]);

  // Detectar interação para tocar pendência
  useEffect(() => {
    const onInteract = () => {
      setHasUserInteracted(true);
      if (pendingPlayRef.current && audioRef.current && !isStoppingRef.current) {
        fadeIn();
      }
    };
    document.addEventListener("click", onInteract);
    document.addEventListener("touchstart", onInteract);
    document.addEventListener("keydown", onInteract);
    return () => {
      document.removeEventListener("click", onInteract);
      document.removeEventListener("touchstart", onInteract);
      document.removeEventListener("keydown", onInteract);
    };
  }, [fadeIn]);

  // Reagir à prop isPlaying
  useEffect(() => {
    if (!audioRef.current || !src) return;
    if (isPlaying) {
      fadeIn();
    } else {
      fadeOut();
    }
  }, [isPlaying, src, fadeIn, fadeOut]);

  const play = useCallback(() => { fadeIn(); }, [fadeIn]);
  const stop = useCallback(() => { fadeOut(); }, [fadeOut]);

  return { play, stop, hasUserInteracted };
};

export default useSoundtrackMusic;
