/**
 * 🔔 Notificação sonora — gera WAV em runtime e toca via HTML5 Audio.
 * Funciona em qualquer browser sem arquivo externo nem Web Audio API quirks.
 */

let audioUnlocked = false;

/** Gera um WAV mono 16-bit com vários "bips" e devolve como data URL */
function buildBeepWavDataUrl(): string {
  const sampleRate = 22050;
  // 3 tons ascendentes (cha-ching!)
  const tones: { freq: number; durMs: number }[] = [
    { freq: 1000, durMs: 100 },
    { freq: 1200, durMs: 100 },
    { freq: 1500, durMs: 200 },
  ];
  const gapMs = 30;
  const samples: number[] = [];

  tones.forEach((t, i) => {
    const nSamples = Math.floor((t.durMs / 1000) * sampleRate);
    for (let n = 0; n < nSamples; n++) {
      // Envelope ADSR simples: fade-in rápido, fade-out exponencial
      const attack = Math.min(1, n / (sampleRate * 0.005));
      const decay = Math.exp(-3 * (n / nSamples));
      const env = attack * decay;
      const value = Math.sin((2 * Math.PI * t.freq * n) / sampleRate) * env * 0.5;
      samples.push(value);
    }
    if (i < tones.length - 1) {
      const gapSamples = Math.floor((gapMs / 1000) * sampleRate);
      for (let n = 0; n < gapSamples; n++) samples.push(0);
    }
  });

  // Monta WAV
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  // Samples
  let offset = 44;
  for (const s of samples) {
    const v = Math.max(-1, Math.min(1, s));
    view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    offset += 2;
  }

  // Base64 do binary
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return "data:audio/wav;base64," + btoa(binary);
}

function writeString(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

let cachedDataUrl: string | null = null;

export const playNotificationSound = () => {
  try {
    if (!cachedDataUrl) cachedDataUrl = buildBeepWavDataUrl();
    const audio = new Audio(cachedDataUrl);
    audio.volume = 1.0;
    audio.play()
      .then(() => console.log("[notificationSound] toctocou"))
      .catch((e) => console.warn("[notificationSound] play() blocked:", e?.message));
  } catch (e) {
    console.warn("[notificationSound] erro:", e);
  }
};

/** Toca o bip UMA vez (sem loop) */
let loopInterval: NodeJS.Timeout | null = null;
export const playLeadNotificationSound = () => {
  playNotificationSound();
};
export const stopLeadNotificationSound = () => {
  if (loopInterval) {
    clearInterval(loopInterval);
    loopInterval = null;
  }
};

/** Toggle on/off (mantido por compat) */
let leadSoundEnabled = true;
export const isLeadSoundEnabled = () => leadSoundEnabled;
export const setLeadSoundEnabled = (enabled: boolean) => {
  leadSoundEnabled = enabled;
  if (!enabled) stopLeadNotificationSound();
};

/**
 * Destrava o áudio na 1ª interação. Não é estritamente necessário com HTML5 Audio,
 * mas faz uma tentativa silenciosa pra "aquecer" o pipeline.
 */
export function installAudioUnlocker() {
  if (audioUnlocked) return;
  const unlock = () => {
    if (audioUnlocked) return;
    try {
      const audio = new Audio();
      audio.volume = 0;
      audio.play().catch(() => {});
      audioUnlocked = true;
      console.log("[notificationSound] áudio destravado");
    } catch { /* ignore */ }
  };
  ["click", "touchstart", "keydown"].forEach((ev) => {
    window.addEventListener(ev, unlock, { once: false });
  });
}
