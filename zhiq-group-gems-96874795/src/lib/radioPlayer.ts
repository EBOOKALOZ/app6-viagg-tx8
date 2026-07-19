/**
 * radioPlayer.ts — controlador singleton do player de rádio da ORION-AUDIO X.
 *
 * Toca em DOIS elementos <audio>:
 *  • plainEl  — SEM crossOrigin: máxima compatibilidade (fallback que sempre toca).
 *  • eqEl     — crossOrigin='anonymous' roteado por um grafo Web Audio (EQ 10 bandas).
 *
 * O EQ do Audio Center também atua na RÁDIO: quando o EQ está ligado, tenta tocar
 * pelo eqEl (com equalização). Streams sem CORS não podem ser lidos pelo Web Audio
 * → cai automaticamente para o plainEl (toca, sem EQ) e marca eqActive=false.
 * Favoritas/histórico em localStorage.
 */
import type { RadioStation } from "./radioBrowser";

export interface RadioState {
  station: RadioStation | null;
  playing: boolean;
  loading: boolean;
  error: string | null;
  volume: number;
  eqActive: boolean; // a emissora atual está passando pelo EQ (stream com CORS)?
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
const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

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
    station: null, playing: false, loading: false, error: null,
    volume: initialVolume(), eqActive: false,
  };
if (typeof state.eqActive !== "boolean") state.eqActive = false;
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

// ── elementos + estado do EQ ──────────────────────────────────────────────────
let activeEl: HTMLAudioElement | null = null;
let trialing = false;          // enquanto testa um elemento, ignora o erro persistente
let lastWasHttp = false;

// EQ (Web Audio)
let audioCtx: AudioContext | null = null;
let eqEl: HTMLAudioElement | null = null;
let eqFilters: BiquadFilterNode[] = [];
let eqBuilt = false;
let eqEnabledDesired = false;
let eqValues: number[] = new Array(10).fill(0);

// listeners persistentes de estado (usados nos dois elementos)
function wire(el: HTMLAudioElement) {
  el.addEventListener("playing", () => { if (el === activeEl) set({ playing: true, loading: false, error: null }); });
  el.addEventListener("pause", () => { if (el === activeEl) set({ playing: false }); });
  el.addEventListener("waiting", () => { if (el === activeEl && !trialing) set({ loading: true }); });
  el.addEventListener("stalled", () => { if (el === activeEl && !trialing) set({ loading: true }); });
  el.addEventListener("error", () => {
    if (el !== activeEl || trialing) return;
    set({
      loading: false, playing: false,
      error: lastWasHttp
        ? "Emissora só em HTTP — bloqueada em site seguro (HTTPS). Tente outra."
        : "Não foi possível tocar (stream fora do ar).",
    });
  });
}

function getPlain(): HTMLAudioElement {
  let el = window.__viagg_radio_audio__;
  if (!el) {
    el = new Audio();
    el.preload = "none";
    el.volume = state.volume;
    wire(el);
    window.__viagg_radio_audio__ = el;
  }
  return el;
}

// grafo de EQ da rádio (elemento crossOrigin → 10 filtros → destino). Só em gesto.
function ensureEqGraph(): boolean {
  if (eqBuilt) return true;
  try {
    const Ctx = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return false;
    audioCtx = new Ctx();
    const el = new Audio();
    el.preload = "none";
    el.crossOrigin = "anonymous"; // necessário p/ o Web Audio ler stream cross-origin
    el.volume = state.volume;
    wire(el);
    const src = audioCtx.createMediaElementSource(el);
    let node: AudioNode = src;
    eqFilters = EQ_FREQS.map((freq, i) => {
      const f = audioCtx!.createBiquadFilter();
      f.type = i === 0 ? "lowshelf" : i === EQ_FREQS.length - 1 ? "highshelf" : "peaking";
      f.frequency.value = freq;
      f.Q.value = 1.0;
      f.gain.value = eqEnabledDesired ? (eqValues[i] || 0) : 0;
      node.connect(f);
      node = f;
      return f;
    });
    node.connect(audioCtx.destination);
    eqEl = el;
    eqBuilt = true;
    return true;
  } catch {
    eqBuilt = false;
    return false;
  }
}

/** Aplica os valores do EQ (10 bandas) à rádio. Chamado pelos faders do Audio Center. */
export function applyRadioEq(eq10: number[], enabled: boolean): void {
  eqEnabledDesired = enabled;
  eqValues = (eq10 || []).slice(0, 10);
  if (eqBuilt) {
    eqFilters.forEach((f, i) => { f.gain.value = enabled ? (eqValues[i] || 0) : 0; });
  }
}

// tenta iniciar um elemento; resolve true se tocou, false se erro/timeout
function startOn(el: HTMLAudioElement, url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(to);
      el.removeEventListener("playing", onPlay);
      el.removeEventListener("error", onErr);
      resolve(ok);
    };
    const onPlay = () => finish(true);
    const onErr = () => finish(false);
    const to = setTimeout(() => finish(false), 5000);
    el.addEventListener("playing", onPlay);
    el.addEventListener("error", onErr);
    try {
      el.src = url;
      el.volume = state.volume;
      el.play().catch(() => finish(false));
    } catch {
      finish(false);
    }
  });
}

function stopEl(el: HTMLAudioElement | null) {
  if (!el) return;
  try { el.pause(); el.removeAttribute("src"); el.load(); } catch { /* ignore */ }
}

export async function playStation(station: RadioStation): Promise<void> {
  const plainEl = getPlain();
  let url = station.url_resolved || station.url;
  if (!url) { set({ error: "Estação sem URL de stream." }); return; }

  // MIXED CONTENT: em site HTTPS o navegador bloqueia streams http:// → sobe p/ https.
  const wasHttp =
    typeof location !== "undefined" && location.protocol === "https:" && url.startsWith("http://");
  if (wasHttp) url = "https://" + url.slice("http://".length);
  lastWasHttp = wasHttp;

  set({ station, loading: true, error: null, eqActive: false });
  // pausa a música de fundo do app (GlobalAudioPlayer escuta) — evita 2 áudios
  try { window.dispatchEvent(new Event("viagg:stop-bg-music")); } catch { /* ignore */ }

  // 1) EQ ligado → tenta tocar pelo grafo (só funciona em stream com CORS)
  if (eqEnabledDesired && ensureEqGraph() && eqEl) {
    trialing = true;
    stopEl(plainEl);
    activeEl = eqEl;
    try { if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume(); } catch { /* ignore */ }
    applyRadioEq(eqValues, eqEnabledDesired);
    const okEq = await startOn(eqEl, url);
    trialing = false;
    if (okEq) {
      set({ playing: true, loading: false, error: null, eqActive: true });
      pushHistory(station);
      return;
    }
    // CORS bloqueou o Web Audio → cai para o modo simples (sem EQ)
    stopEl(eqEl);
  }

  // 2) modo simples (sempre toca; sem EQ)
  activeEl = plainEl;
  const okPlain = await startOn(plainEl, url);
  if (okPlain) {
    set({ playing: true, loading: false, error: null, eqActive: false });
    pushHistory(station);
  } else {
    set({
      loading: false, playing: false, eqActive: false,
      error: wasHttp
        ? "Esta emissora transmite só em HTTP e o navegador bloqueia em site seguro (HTTPS). Tente outra."
        : "Falha ao iniciar (autoplay bloqueado ou stream fora do ar).",
    });
  }
}

export function togglePlay(): void {
  const el = activeEl || getPlain();
  if (!state.station) return;
  if (el.paused) el.play().catch(() => set({ error: "Falha ao retomar o áudio." }));
  else el.pause();
}

export function stopRadio(): void {
  stopEl(activeEl);
  set({ playing: false });
}

export function setRadioVolume(v: number): void {
  // aplica nos dois elementos p/ manter sincronizado ao alternar EQ/simples
  const plainEl = getPlain();
  plainEl.volume = v;
  if (eqEl) eqEl.volume = v;
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
