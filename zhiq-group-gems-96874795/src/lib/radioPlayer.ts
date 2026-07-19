/**
 * radioPlayer.ts — controlador singleton do player de rádio da ORION-AUDIO X.
 *
 * Usa um <audio> dedicado (SEM crossOrigin) para máxima compatibilidade com
 * streams de terceiros (que raramente enviam CORS). O EQ do ORION Audio Center
 * atua no áudio próprio do app; streams externos tocam com controle de volume.
 * Favoritas e histórico ficam em localStorage (funciona offline / anônimo).
 */
import type { RadioStation } from "./radioBrowser";

export interface RadioState {
  station: RadioStation | null;
  playing: boolean;
  loading: boolean;
  error: string | null;
  volume: number;
}

declare global {
  interface Window {
    __viagg_radio_audio__?: HTMLAudioElement;
    __viagg_radio_state__?: RadioState;
  }
}

const FAV = "viagg_radio_favs";
const HIST = "viagg_radio_hist";
const VOL = "viagg_radio_vol";

const listeners = new Set<(s: RadioState) => void>();

function initialVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOL));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.9;
  } catch {
    return 0.9;
  }
}

let state: RadioState =
  (typeof window !== "undefined" && window.__viagg_radio_state__) || {
    station: null,
    playing: false,
    loading: false,
    error: null,
    volume: initialVolume(),
  };
if (typeof window !== "undefined") window.__viagg_radio_state__ = state;

function emit() {
  if (typeof window !== "undefined") window.__viagg_radio_state__ = state;
  listeners.forEach((l) => l(state));
}
function set(patch: Partial<RadioState>) {
  state = { ...state, ...patch };
  emit();
}

export function subscribeRadio(fn: (s: RadioState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => { listeners.delete(fn); };
}
export function getRadioState(): RadioState {
  return state;
}

function getEl(): HTMLAudioElement {
  let el = window.__viagg_radio_audio__;
  if (!el) {
    el = new Audio();
    el.preload = "none";
    el.volume = state.volume;
    el.addEventListener("playing", () => set({ playing: true, loading: false, error: null }));
    el.addEventListener("pause", () => set({ playing: false }));
    el.addEventListener("waiting", () => set({ loading: true }));
    el.addEventListener("stalled", () => set({ loading: true }));
    el.addEventListener("error", () =>
      set({ loading: false, playing: false, error: "Não foi possível tocar esta estação (stream indisponível)." }),
    );
    window.__viagg_radio_audio__ = el;
  }
  return el;
}

export async function playStation(station: RadioStation): Promise<void> {
  const el = getEl();
  const url = station.url_resolved || station.url;
  if (!url) {
    set({ error: "Estação sem URL de stream." });
    return;
  }
  set({ station, loading: true, error: null });
  // pausa a música de fundo do app (GlobalAudioPlayer escuta) — evita 2 áudios
  try { window.dispatchEvent(new Event("viagg:stop-bg-music")); } catch { /* ignore */ }
  try {
    el.src = url;
    el.volume = state.volume;
    await el.play();
    pushHistory(station);
  } catch {
    set({ loading: false, playing: false, error: "Falha ao iniciar (autoplay bloqueado ou stream fora do ar)." });
  }
}

export function togglePlay(): void {
  const el = getEl();
  if (!state.station) return;
  if (el.paused) el.play().catch(() => set({ error: "Falha ao retomar o áudio." }));
  else el.pause();
}

export function stopRadio(): void {
  const el = window.__viagg_radio_audio__;
  if (el) {
    el.pause();
    el.removeAttribute("src");
    try { el.load(); } catch { /* ignore */ }
  }
  set({ playing: false });
}

export function setRadioVolume(v: number): void {
  const el = getEl();
  el.volume = v;
  try { localStorage.setItem(VOL, String(v)); } catch { /* ignore */ }
  set({ volume: v });
}

// ── Favoritas ────────────────────────────────────────────────────────────────
function readList(key: string): RadioStation[] {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
export function getFavorites(): RadioStation[] {
  return readList(FAV);
}
export function isFavorite(uuid: string): boolean {
  return getFavorites().some((s) => s.stationuuid === uuid);
}
export function toggleFavorite(st: RadioStation): boolean {
  const cur = getFavorites();
  const exists = cur.some((s) => s.stationuuid === st.stationuuid);
  const next = exists ? cur.filter((s) => s.stationuuid !== st.stationuuid) : [st, ...cur].slice(0, 200);
  try { localStorage.setItem(FAV, JSON.stringify(next)); } catch { /* ignore */ }
  return !exists;
}

// ── Histórico ─────────────────────────────────────────────────────────────────
export function getHistory(): RadioStation[] {
  return readList(HIST);
}
export function pushHistory(st: RadioStation): void {
  const cur = getHistory().filter((s) => s.stationuuid !== st.stationuuid);
  try { localStorage.setItem(HIST, JSON.stringify([st, ...cur].slice(0, 100))); } catch { /* ignore */ }
}
