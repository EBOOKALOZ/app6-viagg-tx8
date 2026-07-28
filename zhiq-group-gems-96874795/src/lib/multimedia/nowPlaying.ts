/**
 * nowPlaying.ts — ORION-MEDIA-02: detecção da MÚSICA NO AR na rádio.
 *
 * Como não existe API universal de "tocando agora", a detecção é em camadas,
 * sempre melhor-esforço e declarada (nunca inventa música):
 *  1. ICY metadata (Shoutcast/Icecast): fetch do próprio stream com o header
 *     `Icy-MetaData: 1`, lê ~1–2 blocos (≤ ~1,5 MB) e extrai StreamTitle.
 *     Só funciona em streams com CORS aberto (a maioria dos Icecast BR).
 *  2. Icecast status-json.xsl na raiz do servidor do stream (fallback).
 *  3. Nada encontrado → track = null e a UI MANTÉM a tela atual (regra da spec).
 *
 * Ao detectar música nova:
 *  • emite imediatamente (artist/title parseados do StreamTitle);
 *  • ENRIQUECE em background: iTunes Search (capa, álbum, duração — CORS ok)
 *    e MusicBrainz (ISRC — melhor esforço, 2 chamadas, tolerante a falha);
 *  • loga telemetria 'radio_track' (fire-and-forget).
 *
 * O polling roda enquanto a rádio está tocando; em modo TV (rádio pausada) o
 * player chama setNowPlayingKeepAlive(true) para continuar detectando a troca
 * de música. Streams sem suporte: 3 falhas seguidas → cadência lenta (90 s).
 */
import { subscribeRadio, type RadioState } from "@/lib/radioPlayer";
import { logTrackEvent } from "@/lib/multimedia/mediaCenter";

export interface NowPlayingTrack {
  raw: string;                    // StreamTitle bruto ("Artista - Música")
  artist: string;                 // pode ser '' quando o stream não separa
  title: string;
  album?: string | null;
  artworkUrl?: string | null;     // capa (iTunes, 600x600)
  durationMs?: number | null;     // duração da faixa (iTunes)
  isrc?: string | null;           // ISRC (MusicBrainz, quando disponível)
  startedAt: number;              // epoch ms da detecção (base da barra de progresso)
  source: "icy" | "icecast";
  enriched: boolean;              // capa/álbum já buscados?
}

const NORMAL_MS = 20_000;   // cadência padrão
const SLOW_MS = 90_000;     // stream sem metadados → só re-tenta de vez em quando
const FETCH_TIMEOUT_MS = 8_000;
const MAX_FAILS_BEFORE_SLOW = 3;

let track: NowPlayingTrack | null = null;
let lastRaw: string | null = null;
let stationUrl: string | null = null;
let stationName = "";
let keepAlive = false;          // TV assistindo (rádio pausada) → segue detectando
let radioActive = false;
let fails = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: AbortController | null = null;
let polling = false;
let wired = false;

const listeners = new Set<(t: NowPlayingTrack | null) => void>();

function emit() {
  listeners.forEach((l) => { try { l(track); } catch { /* listener nunca derruba o engine */ } });
}

export function getNowPlaying(): NowPlayingTrack | null {
  return track;
}

export function subscribeNowPlaying(fn: (t: NowPlayingTrack | null) => void): () => void {
  ensureWired();
  listeners.add(fn);
  fn(track);
  reconcile(); // com UI interessada, liga a detecção
  return () => {
    listeners.delete(fn);
    reconcile(); // painel fechado (sem listeners) → para de gastar dados
  };
}

/** Modo TV: mantém a detecção viva mesmo com a rádio pausada (áudio no vídeo). */
export function setNowPlayingKeepAlive(on: boolean): void {
  keepAlive = on;
  reconcile();
}

// ── acoplamento com o radioPlayer (singleton) ────────────────────────────────
function ensureWired() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  subscribeRadio(onRadioState);
}

function onRadioState(s: RadioState) {
  const url = s.station ? (s.station.url_resolved || s.station.url || null) : null;
  stationName = s.station?.name || "";
  if (url !== stationUrl) {
    // trocou de estação → zera tudo (a música da outra estação não vale aqui)
    stationUrl = url;
    lastRaw = null;
    fails = 0;
    if (track) { track = null; emit(); }
  }
  radioActive = !!s.station && (s.playing || s.loading);
  reconcile();
}

function reconcile() {
  // só detecta com alguém interessado (painel aberto) OU TV assistindo —
  // painel fechado não fica baixando bytes do stream à toa.
  const wanted = listeners.size > 0 || keepAlive;
  const shouldPoll = !!stationUrl && (radioActive || keepAlive) && wanted;
  if (shouldPoll && !polling) startLoop();
  if (!shouldPoll && polling) stopLoop();
}

function startLoop() {
  polling = true;
  void pollOnce();          // primeira leitura imediata
}

function stopLoop() {
  polling = false;
  if (timer) { clearTimeout(timer); timer = null; }
  inflight?.abort();
  inflight = null;
}

function schedule() {
  if (!polling) return;
  const base = fails >= MAX_FAILS_BEFORE_SLOW ? SLOW_MS : NORMAL_MS;
  // aba oculta → metade da cadência (economia de dados; áudio segue em bg)
  const ms = typeof document !== "undefined" && document.hidden ? base * 2 : base;
  timer = setTimeout(() => { void pollOnce(); }, ms);
}

async function pollOnce() {
  if (!polling || !stationUrl) return;
  const url = pollUrl(stationUrl);
  let raw: string | null = null;
  let source: "icy" | "icecast" = "icy";
  try {
    raw = await readIcyTitle(url);
  } catch { /* CORS/preflight/rede → tenta o fallback */ }
  if (!raw) {
    try {
      raw = await readIcecastStatus(url);
      source = "icecast";
    } catch { /* sem status público */ }
  }
  if (raw) {
    fails = 0;
    processRaw(raw, source);
  } else {
    fails++;
  }
  schedule();
}

// página https + stream http → mesmo upgrade que o radioPlayer aplica no áudio
function pollUrl(u: string): string {
  if (typeof location !== "undefined" && location.protocol === "https:" && u.startsWith("http://")) {
    return "https://" + u.slice("http://".length);
  }
  return u;
}

// ── 1. ICY metadata (lê o próprio stream) ────────────────────────────────────
async function readIcyTitle(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  inflight = ctrl;
  const to = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "Icy-MetaData": "1" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    const metaint = Number(res.headers.get("icy-metaint"));
    if (!res.ok || !res.body || !Number.isFinite(metaint) || metaint <= 0 || metaint > 512 * 1024) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      return null;
    }
    const reader = res.body.getReader();
    // 2 blocos no máximo: [metaint áudio][1 byte len][len*16 meta] ×2 (cap duro)
    const maxBytes = Math.min(2 * (metaint + 1 + 16 * 255), 1_500_000);
    let buf = new Uint8Array(0);
    try {
      while (buf.length < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        const nb = new Uint8Array(buf.length + value.length);
        nb.set(buf); nb.set(value, buf.length);
        buf = nb;
        // varre blocos completos já disponíveis
        let offset = 0;
        while (true) {
          const lenPos = offset + metaint;
          if (buf.length <= lenPos) break;
          const mlen = buf[lenPos] * 16;
          const end = lenPos + 1 + mlen;
          if (buf.length < end) break;
          if (mlen > 0) {
            const text = decodeMeta(buf.slice(lenPos + 1, end)).replace(/\0+/g, "");
            const m = /StreamTitle='([\s\S]*?)';/.exec(text);
            return m ? m[1].trim() : null;
          }
          offset = end; // bloco sem metadados → tenta o próximo
        }
      }
      return null;
    } finally {
      try { await reader.cancel(); } catch { /* ignore */ }
    }
  } finally {
    clearTimeout(to);
    if (inflight === ctrl) inflight = null;
  }
}

// ICY costuma vir em UTF-8; rádios antigas mandam Latin-1 → decide pelo U+FFFD
function decodeMeta(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!utf8.includes("�")) return utf8;
  try { return new TextDecoder("windows-1252").decode(bytes); } catch { return utf8; }
}

// ── 2. Icecast status-json.xsl (fallback) ────────────────────────────────────
async function readIcecastStatus(streamUrl: string): Promise<string | null> {
  const u = new URL(streamUrl);
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${u.origin}/status-json.xsl`, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    const sources = j?.icestats?.source;
    const list = Array.isArray(sources) ? sources : sources ? [sources] : [];
    if (list.length === 0) return null;
    // preferir o source do NOSSO mountpoint; senão, o primeiro com título
    const mine = list.find((s: Record<string, unknown>) =>
      typeof s?.listenurl === "string" && (s.listenurl as string).endsWith(u.pathname));
    const src = (mine || list.find((s: Record<string, unknown>) => s?.title || s?.artist) || list[0]) as Record<string, unknown>;
    const artist = typeof src?.artist === "string" ? src.artist.trim() : "";
    const title = typeof src?.title === "string" ? src.title.trim() : "";
    if (artist && title) return `${artist} - ${title}`;
    return title || null;
  } finally {
    clearTimeout(to);
  }
}

// ── parsing + filtro de lixo (vinheta/publicidade nunca viram "música") ─────
const SEPARATORS = [" - ", " – ", " — ", " | "];
const JUNK_RE = /(publicidade|comercial|vinheta|jingle|intervalo|spot\b|ad\s?break|advert|no\s?artist|unknown|desconhecid[oa]|https?:)/i;

/** Exportada para testes: StreamTitle bruto → {artist,title} ou null (lixo). */
export function parseStreamTitle(raw: string, station = ""): { artist: string; title: string } | null {
  const s = (raw || "").replace(/\s+/g, " ").trim();
  if (s.length < 3 || s.length > 300) return null;
  if (JUNK_RE.test(s)) return null;
  const eq = (a: string, b: string) => {
    const clean = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\W+/g, "");
    return clean(a) === clean(b);
  };
  if (station && eq(s, station)) return null;   // só o nome da rádio ≠ música
  for (const sep of SEPARATORS) {
    const i = s.indexOf(sep);
    if (i > 0 && i < s.length - sep.length) {
      const artist = s.slice(0, i).trim();
      const title = s.slice(i + sep.length).trim();
      if (!title) continue;
      // "Emissora - Programa" → o prefixo é a rádio, não um artista
      if (station && eq(artist, station)) return { artist: "", title };
      return { artist, title };
    }
  }
  return { artist: "", title: s };
}

function processRaw(raw: string, source: "icy" | "icecast") {
  if (raw === lastRaw) return;      // mesma música → nada a fazer
  lastRaw = raw;
  const parsed = parseStreamTitle(raw, stationName);
  if (!parsed) {
    if (track) { track = null; emit(); }
    return;
  }
  const t: NowPlayingTrack = {
    raw,
    artist: parsed.artist,
    title: parsed.title,
    startedAt: Date.now(),
    source,
    enriched: false,
  };
  track = t;
  emit();
  logTrackEvent("radio_track", {
    artist: t.artist, title: t.title, station: stationName, source,
  });
  void enrich(t);
}

// ── enriquecimento (capa/álbum/duração via iTunes; ISRC via MusicBrainz) ────
function stillCurrent(t: NowPlayingTrack): boolean {
  return track?.raw === t.raw && track?.startedAt === t.startedAt;
}

async function enrich(t: NowPlayingTrack) {
  try {
    const term = encodeURIComponent(`${t.artist} ${t.title}`.trim());
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=5&country=BR`,
      { signal: ctrl.signal },
    ).finally(() => clearTimeout(to));
    if (res.ok) {
      const j = await res.json();
      const results: Array<Record<string, unknown>> = Array.isArray(j?.results) ? j.results : [];
      const best = pickItunesMatch(results, t.artist, t.title);
      if (best && stillCurrent(t)) {
        track = {
          ...t,
          enriched: true,
          album: (best.collectionName as string) || null,
          durationMs: Number(best.trackTimeMillis) > 0 ? Number(best.trackTimeMillis) : null,
          artworkUrl: typeof best.artworkUrl100 === "string"
            ? (best.artworkUrl100 as string).replace("100x100bb", "600x600bb")
            : null,
        };
        emit();
      } else if (stillCurrent(t)) {
        track = { ...t, enriched: true };
        emit();
      }
    }
  } catch { /* offline/CORS → segue sem capa (lacuna declarada, não inventada) */ }

  // ISRC (melhor esforço, só com artista+título; falha silenciosa)
  if (t.artist && t.title) {
    try {
      const isrc = await lookupIsrc(t.artist, t.title);
      if (isrc && stillCurrent(t) && track) {
        track = { ...track, isrc };
        emit();
      }
    } catch { /* ignore */ }
  }
}

function normLoose(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function pickItunesMatch(results: Array<Record<string, unknown>>, artist: string, title: string) {
  const nt = normLoose(title);
  const na = normLoose(artist);
  for (const r of results) {
    const rt = normLoose(String(r.trackName || ""));
    const ra = normLoose(String(r.artistName || ""));
    const titleOk = !!nt && (rt.includes(nt) || nt.includes(rt)) && rt.length > 0;
    const artistOk = !na || ra.includes(na) || na.includes(ra);
    if (titleOk && artistOk) return r;
  }
  return null;
}

async function lookupIsrc(artist: string, title: string): Promise<string | null> {
  const q = encodeURIComponent(`artist:"${artist}" AND recording:"${title}"`);
  const ctrl1 = new AbortController();
  const to1 = setTimeout(() => ctrl1.abort(), FETCH_TIMEOUT_MS);
  const r1 = await fetch(`https://musicbrainz.org/ws/2/recording?query=${q}&fmt=json&limit=1`,
    { signal: ctrl1.signal }).finally(() => clearTimeout(to1));
  if (!r1.ok) return null;
  const j1 = await r1.json();
  const rec = Array.isArray(j1?.recordings) ? j1.recordings[0] : null;
  if (!rec?.id || Number(rec.score) < 85) return null;
  const ctrl2 = new AbortController();
  const to2 = setTimeout(() => ctrl2.abort(), FETCH_TIMEOUT_MS);
  const r2 = await fetch(`https://musicbrainz.org/ws/2/recording/${rec.id}?inc=isrcs&fmt=json`,
    { signal: ctrl2.signal }).finally(() => clearTimeout(to2));
  if (!r2.ok) return null;
  const j2 = await r2.json();
  return Array.isArray(j2?.isrcs) && j2.isrcs.length > 0 ? String(j2.isrcs[0]) : null;
}
