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
// sessionStorage: o app navega com window.location.href (full reload) em 47 pontos —
// a sessão da rádio sobrevive ao reload e é retomada pelo GlobalAudioPlayer no boot.
const SESSION_RADIO = "viagg_radio_session";
// localStorage: a ÚLTIMA estação ouvida sobrevive a fechar o app (minutos/horas/DIAS).
// Ao reabrir, o app oferece "continuar de onde parou" (não toca sozinho — autoplay é
// bloqueado pelo navegador; a estação fica pronta com 1 toque para retomar).
const LAST_STATION = "viagg_radio_last_station";
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
  // persiste a sessão (station+playing) p/ retomar após full reload
  try {
    if (state.station) {
      sessionStorage.setItem(SESSION_RADIO, JSON.stringify({ station: state.station, playing: state.playing || state.loading }));
      // ÚLTIMA estação (localStorage): sobrevive a fechar o app por dias.
      localStorage.setItem(LAST_STATION, JSON.stringify(state.station));
    } else {
      sessionStorage.removeItem(SESSION_RADIO);
      // NÃO apaga LAST_STATION ao parar — o usuário deve poder retomar a última mesmo após parar.
    }
  } catch { /* ignore */ }
  syncMediaSession();
  listeners.forEach((l) => l(state));
}

// ── Media Session API: controles do sistema (tela de bloqueio, PWA, teclado) ──
function syncMediaSession() {
  try {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    if (!state.station) { ms.metadata = null; return; }
    ms.metadata = new MediaMetadata({
      title: state.station.name || "Rádio",
      artist: "Viagg-TX8 Rádio",
      artwork: state.station.favicon
        ? [{ src: state.station.favicon, sizes: "96x96" }]
        : [{ src: "/logo.png", sizes: "192x192" }],
    });
    ms.playbackState = state.playing ? "playing" : "paused";
    ms.setActionHandler("play", () => togglePlay());
    ms.setActionHandler("pause", () => togglePlay());
    ms.setActionHandler("stop", () => closeRadio());
  } catch { /* ignore */ }
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
let eqGain: GainNode | null = null;   // controla o volume no caminho do EQ (el.volume é ignorado no grafo)
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
    // GainNode no fim do grafo: é ele quem controla o volume no caminho do EQ
    // (com createMediaElementSource, o el.volume é ignorado pelo Web Audio).
    eqGain = audioCtx.createGain();
    eqGain.gain.value = state.volume;
    node.connect(eqGain);
    
    // AnalyserNode para o visualizador Matrix
    let eqAnalyser = audioCtx.createAnalyser();
    eqAnalyser.fftSize = 64;
    eqGain.connect(eqAnalyser);
    eqAnalyser.connect(audioCtx.destination);
    (window as any).__viagg_radio_analyser__ = eqAnalyser;
    
    eqEl = el;
    eqBuilt = true;
    // Autoplay policy pode deixar o ctx 'suspended' → som NENHUM apesar do estado
    // "tocando". Qualquer gesto do usuário tenta retomar até rodar.
    const resumeOnGesture = () => {
      audioCtx?.resume().then(() => {
        if (audioCtx?.state === "running") {
          document.removeEventListener("click", resumeOnGesture, true);
          document.removeEventListener("keydown", resumeOnGesture, true);
        }
      }).catch(() => { /* ignore */ });
    };
    document.addEventListener("click", resumeOnGesture, { capture: true, passive: true });
    document.addEventListener("keydown", resumeOnGesture, { capture: true, passive: true });
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
    // streams ao vivo demoram (DNS+TLS+buffer): 8s antes de declarar falha
    const to = setTimeout(() => finish(false), 8000);
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
  const original = station.url_resolved || station.url;
  if (!original) { set({ error: "Estação sem URL de stream." }); return; }

  // Página HTTPS bloqueia http:// (mixed content). Estratégia: tenta o link ORIGINAL
  // primeiro (em localhost/http o navegador deixa; muitos servidores só têm http),
  // e guarda o upgrade https como tentativa de fallback (host que também serve https).
  const pageHttps = typeof location !== "undefined" && location.protocol === "https:";
  const isHttp = original.startsWith("http://");
  const httpsAlt = isHttp ? "https://" + original.slice("http://".length) : null;
  // Em página https, o navegador barra o http:// de cara → começa pela versão https.
  // Fora disso (localhost/dev), usa o original direto.
  const url = pageHttps && isHttp && httpsAlt ? httpsAlt : original;
  lastWasHttp = pageHttps && isHttp;

  set({ station, loading: true, error: null, eqActive: false });
  // pausa a música de fundo do app (GlobalAudioPlayer escuta) — evita 2 áudios
  try { window.dispatchEvent(new Event("viagg:stop-bg-music")); } catch { /* ignore */ }

  // 1) EQ ligado → tenta tocar pelo grafo (só funciona em stream com CORS)
  if (eqEnabledDesired && ensureEqGraph() && eqEl && audioCtx) {
    try { if (audioCtx.state === "suspended") await audioCtx.resume(); } catch { /* ignore */ }
    // ARMADILHA "roda mas não toca": com o ctx suspenso o elemento avança e o
    // estado vira "tocando", mas o som morre dentro do grafo. Só usa o caminho
    // do EQ com o contexto comprovadamente rodando; senão, caminho simples.
    if (audioCtx.state !== "running") {
      console.warn("[radio] AudioContext", audioCtx.state, "→ tocando SEM EQ para garantir som");
    } else {
      trialing = true;
      stopEl(plainEl);
      activeEl = eqEl;
      applyRadioEq(eqValues, eqEnabledDesired);
      const okEq = await startOn(eqEl, url);
      trialing = false;
      if (okEq) {
        console.info("[radio] tocando via EQ (ctx=running, CORS ok)");
        set({ playing: true, loading: false, error: null, eqActive: true });
        pushHistory(station);
        return;
      }
      // CORS bloqueou o Web Audio → cai para o modo simples (sem EQ)
      stopEl(eqEl);
      console.info("[radio] stream sem CORS p/ o EQ → caminho simples");
    }
  }

  // 2) modo simples (sempre toca; sem EQ)
  activeEl = plainEl;
  let okPlain = await startOn(plainEl, url);
  // FALLBACK: se a 1ª tentativa falhou e existe outra variante (original ↔ https), tenta a outra.
  if (!okPlain && httpsAlt && url !== original) {
    okPlain = await startOn(plainEl, original);   // tentou https, agora o http original
  } else if (!okPlain && httpsAlt && url === original && pageHttps) {
    okPlain = await startOn(plainEl, httpsAlt);    // tentou original, agora a versão https
  }
  if (okPlain) {
    set({ playing: true, loading: false, error: null, eqActive: false });
    pushHistory(station);
  } else {
    set({
      loading: false, playing: false, eqActive: false,
      error: lastWasHttp
        ? "Esta emissora transmite só em HTTP e o navegador bloqueia em site seguro (HTTPS). Ela funcionará no app publicado."
        : "Não consegui tocar. O stream pode estar fora do ar ou o link está incorreto.",
    });
  }
}

export function togglePlay(): void {
  if (!state.station) return;
  // sessão órfã (HMR/dev recarregou o módulo): activeEl sumiu ou está sem src →
  // retomar = tocar a estação do zero, senão o play() falha em silêncio
  if (!activeEl || !activeEl.currentSrc) {
    void playStation(state.station);
    return;
  }
  const el = activeEl;
  if (el.paused) el.play().catch(() => set({ error: "Falha ao retomar o áudio." }));
  else el.pause();
}

export function stopRadio(): void {
  stopEl(activeEl);
  // desliga de fato (limpa a estação atual) — a ÚLTIMA estação continua salva em
  // localStorage (getLastStation), então o "Continuar ouvindo" reaparece p/ retomar.
  set({ playing: false, loading: false, station: null, error: null, eqActive: false });
}

/** Pausa SEM derrubar o stream (usada pelo audioManager quando uma mídia manual vence). */
export function pauseRadio(): void {
  try { activeEl?.pause(); } catch { /* ignore */ }
  set({ playing: false, loading: false });
}

/** Encerra de vez: para o áudio e limpa a estação (Mini Player some; sessão limpa). */
export function closeRadio(): void {
  stopEl(activeEl);
  set({ playing: false, loading: false, station: null, error: null });
}

/** Há sessão de rádio marcada como tocando (pré-reload)? O bg music cede prioridade. */
export function hasPendingRadioSession(): boolean {
  if (state.playing || state.loading) return true;
  try {
    const raw = sessionStorage.getItem(SESSION_RADIO);
    if (!raw) return false;
    const s = JSON.parse(raw);
    return !!(s?.playing && s?.station);
  } catch { return false; }
}

/**
 * Retoma a rádio após um full reload (window.location.href). Se o autoplay for
 * bloqueado, mantém a estação visível PAUSADA no Mini Player (sem erro assustador)
 * e rearma a retomada no primeiro clique do usuário.
 */
export async function resumeRadioAfterReload(): Promise<void> {
  let session: { station: RadioStation; playing: boolean } | null = null;
  try { session = JSON.parse(sessionStorage.getItem(SESSION_RADIO) || "null"); } catch { /* ignore */ }
  if (!session?.station || !session.playing || state.playing || state.loading) return;

  await playStation(session.station);
  if (getRadioState().playing) return;                 // retomou direto

  // autoplay bloqueado → estação fica visível pausada; 1º gesto retoma
  set({ station: session.station, playing: false, loading: false, error: null });
  const retry = () => {
    document.removeEventListener("click", retry, true);
    if (!getRadioState().playing && getRadioState().station) void playStation(getRadioState().station!);
  };
  document.addEventListener("click", retry, { capture: true, passive: true, once: true });
}

export function setRadioVolume(v: number): void {
  const vol = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  // aplica nos dois elementos p/ manter sincronizado ao alternar EQ/simples
  const plainEl = getPlain();
  plainEl.volume = vol;
  if (eqEl) eqEl.volume = vol;         // caminho simples do elemento (fallback)
  if (eqGain) eqGain.gain.value = vol; // caminho do EQ: quem realmente controla o volume no grafo
  try { localStorage.setItem(VOL, String(vol)); } catch { /* ignore */ }
  set({ volume: vol });
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

// ÚLTIMA estação ouvida (persiste em localStorage — sobrevive a fechar o app por dias).
// Retorna null se nunca ouviu nada. Usado para "continuar de onde parou".
export function getLastStation(): RadioStation | null {
  try {
    const raw = localStorage.getItem(LAST_STATION);
    if (!raw) return null;
    const s = JSON.parse(raw) as RadioStation;
    return s && (s.url_resolved || s.url) ? s : null;
  } catch { return null; }
}
