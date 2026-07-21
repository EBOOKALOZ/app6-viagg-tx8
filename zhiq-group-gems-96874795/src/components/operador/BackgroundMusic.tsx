import { useState, useRef, useEffect, useCallback } from "react";
import { Music, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getRadioState, pauseRadio } from "@/lib/radioPlayer";

const STORAGE_KEY = "bg-music";
const AUDIO_SRC = "/audio/painel-ambiente.mp3";

export function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio(AUDIO_SRC);
      a.loop = true;
      a.volume = 0.25;
      audioRef.current = a;
    }
    return audioRef.current;
  }, []);

  // Try to resume if preference was "on" — needs a user gesture first
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== "on") return;

    const resume = () => {
      // rádio no ar = áudio prioritário → a música do painel não entra sozinha
      if (getRadioState().playing || getRadioState().loading) return;
      const audio = getAudio();
      audio.play().then(() => setPlaying(true)).catch(() => {});
      window.removeEventListener("click", resume);
      window.removeEventListener("keydown", resume);
    };

    window.addEventListener("click", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });

    return () => {
      window.removeEventListener("click", resume);
      window.removeEventListener("keydown", resume);
    };
  }, [getAudio]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const toggle = () => {
    const audio = getAudio();
    if (playing) {
      audio.pause();
      setPlaying(false);
      localStorage.setItem(STORAGE_KEY, "off");
    } else {
      // clique manual vence: pausa a rádio antes de tocar (nunca 2 áudios)
      if (getRadioState().playing) pauseRadio();
      audio.play().then(() => {
        setPlaying(true);
        localStorage.setItem(STORAGE_KEY, "on");
      }).catch(() => {});
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      className="fixed bottom-4 right-4 z-50 gap-2 rounded-full shadow-lg"
    >
      {playing ? (
        <Music2 className="h-4 w-4 text-green-500" />
      ) : (
        <Music className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="text-xs">Música</span>
    </Button>
  );
}
