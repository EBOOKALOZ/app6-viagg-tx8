/**
 * videoLookup.ts — ORION-MEDIA-02: música → videoclipe (YouTube), com CACHE
 * em 3 camadas para nunca repetir busca da mesma música:
 *
 *   1. memória (sessão)  →  2. localStorage (7 dias)  →  3. media_track_videos
 *   (cache COMPARTILHADO no banco — leitura pública)  →  4. edge function
 *   media-video-search (YouTube Data API; grava no cache do banco).
 *
 * FALLBACK OFICIAL da spec: official → lyric → live → visualizer, filtrado
 * pelas configurações do admin (só oficiais / permitir lyric / permitir live).
 * Nada aceitável → status 'none' ("Vídeo indisponível para esta música.").
 * Telemetria: cache_hit/cache_miss, video_found/video_missing/video_error.
 */
import { supabase } from '@/integrations/supabase/client';
import { logTrackEvent } from '@/lib/multimedia/mediaCenter';
import type { MediaCenterSettings } from '@/lib/multimedia/mediaSettings';

export type VideoType = 'official' | 'lyric' | 'live' | 'visualizer';
export const VIDEO_TYPE_PRIORITY: VideoType[] = ['official', 'lyric', 'live', 'visualizer'];
export const VIDEO_TYPE_LABEL: Record<VideoType, string> = {
  official: 'Videoclipe oficial',
  lyric: 'Lyric video',
  live: 'Ao vivo',
  visualizer: 'Visualizer',
};

export interface TrackVideo {
  video_id: string;
  video_type: VideoType;
  title?: string | null;
  channel?: string | null;
  thumbnail_url?: string | null;
  duration_seconds?: number | null;
}

export interface VideoLookupResult {
  status: 'found' | 'none' | 'not_configured' | 'error';
  /** melhor vídeo já respeitando as configurações do admin (ou null) */
  video: TrackVideo | null;
  /** melhores candidatos POR TIPO (para reaplicar configurações sem nova busca) */
  alternatives: Partial<Record<VideoType, TrackVideo>>;
  cacheLevel: 'memory' | 'local' | 'db' | 'live' | null;
  tookMs: number;
}

// ── normalização (ESPELHA supabase/functions/media-video-search) ─────────────
export function normTrack(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\((feat|ft|com|part)\.?[^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export function trackKey(artist: string, title: string): string {
  return `${normTrack(artist)}|${normTrack(title)}`.slice(0, 300);
}

/** Fallback da spec (1 Oficial → 2 Lyric → 3 Live → 4 Visualizer) sob as
 *  configurações do admin. Retorna null quando nada é permitido/existe. */
export function pickAllowedVideo(
  alternatives: Partial<Record<VideoType, TrackVideo>>,
  settings: MediaCenterSettings,
): TrackVideo | null {
  for (const type of VIDEO_TYPE_PRIORITY) {
    const v = alternatives[type];
    if (!v) continue;
    if (settings.tv_official_only && type !== 'official') continue;
    if (type === 'lyric' && !settings.tv_allow_lyric) continue;
    if (type === 'live' && !settings.tv_allow_live) continue;
    return v;
  }
  return null;
}

// ── camadas de cache ─────────────────────────────────────────────────────────
interface CacheEntry {
  alternatives: Partial<Record<VideoType, TrackVideo>>;
  none: boolean;      // busca já feita e nada aceitável (cache negativo)
  ts: number;
}

const LOCAL_KEY = 'viagg_tv_cache_v1';
const LOCAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOCAL_MAX = 80;

const memCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<VideoLookupResult>>();

function readLocal(): Record<string, CacheEntry> {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}
function writeLocal(map: Record<string, CacheEntry>) {
  try {
    const entries = Object.entries(map)
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, LOCAL_MAX);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* quota → ignora */ }
}
function saveEntry(key: string, entry: CacheEntry) {
  memCache.set(key, entry);
  const all = readLocal();
  all[key] = entry;
  writeLocal(all);
}

// linha de media_track_videos → alternatives tipadas (valida cada candidato)
function rowToAlternatives(row: Record<string, unknown>): Partial<Record<VideoType, TrackVideo>> {
  const out: Partial<Record<VideoType, TrackVideo>> = {};
  const alts = (row?.alternatives && typeof row.alternatives === 'object' ? row.alternatives : {}) as Record<string, Record<string, unknown>>;
  for (const type of VIDEO_TYPE_PRIORITY) {
    const c = alts[type];
    if (c && typeof c.video_id === 'string' && /^[A-Za-z0-9_-]{6,20}$/.test(c.video_id)) {
      out[type] = {
        video_id: c.video_id,
        video_type: type,
        title: typeof c.title === 'string' ? c.title : null,
        channel: typeof c.channel === 'string' ? c.channel : null,
        thumbnail_url: typeof c.thumbnail_url === 'string' ? c.thumbnail_url : null,
        duration_seconds: Number(c.duration_seconds) > 0 ? Number(c.duration_seconds) : null,
      };
    }
  }
  // linha antiga sem alternatives mas com video_id principal → aproveita
  if (Object.keys(out).length === 0 && typeof row?.video_id === 'string' && row?.video_type !== 'none') {
    const type = (VIDEO_TYPE_PRIORITY as string[]).includes(String(row.video_type))
      ? row.video_type as VideoType : 'official';
    out[type] = {
      video_id: row.video_id as string,
      video_type: type,
      thumbnail_url: typeof row.thumbnail_url === 'string' ? row.thumbnail_url : null,
      duration_seconds: Number(row.duration_seconds) > 0 ? Number(row.duration_seconds) : null,
    };
  }
  return out;
}

function resultFrom(
  entry: CacheEntry,
  settings: MediaCenterSettings,
  cacheLevel: VideoLookupResult['cacheLevel'],
  tookMs: number,
): VideoLookupResult {
  const video = pickAllowedVideo(entry.alternatives, settings);
  return {
    status: video ? 'found' : 'none',
    video,
    alternatives: entry.alternatives,
    cacheLevel,
    tookMs,
  };
}

// ── busca principal ──────────────────────────────────────────────────────────
export async function lookupVideo(
  artist: string,
  title: string,
  album: string | null | undefined,
  settings: MediaCenterSettings,
): Promise<VideoLookupResult> {
  const key = trackKey(artist, title);
  if (key.length < 3) return { status: 'none', video: null, alternatives: {}, cacheLevel: null, tookMs: 0 };

  const pending = inflight.get(key);
  if (pending) return pending;

  const p = (async (): Promise<VideoLookupResult> => {
    const t0 = Date.now();
    const logCtx = { artist, title, track_key: key };

    // 1. memória
    const mem = memCache.get(key);
    if (mem) {
      logTrackEvent('cache_hit', { ...logCtx, nivel: 'memoria' });
      return resultFrom(mem, settings, 'memory', Date.now() - t0);
    }

    // 2. localStorage (respeita TTL)
    const local = readLocal()[key];
    if (local && Date.now() - local.ts < LOCAL_TTL_MS) {
      memCache.set(key, local);
      logTrackEvent('cache_hit', { ...logCtx, nivel: 'local' });
      return resultFrom(local, settings, 'local', Date.now() - t0);
    }

    // 3. cache compartilhado no banco (leitura pública)
    try {
      const { data } = await (supabase.from('media_track_videos') as any)
        .select('*').eq('track_key', key).maybeSingle();
      if (data && (data.video_type !== 'none'
        || Date.now() - new Date(data.updated_at).getTime() < LOCAL_TTL_MS)) {
        const entry: CacheEntry = {
          alternatives: rowToAlternatives(data),
          none: data.video_type === 'none',
          ts: Date.now(),
        };
        saveEntry(key, entry);
        logTrackEvent('cache_hit', { ...logCtx, nivel: 'banco' });
        return resultFrom(entry, settings, 'db', Date.now() - t0);
      }
    } catch { /* tabela ausente → segue para a edge function */ }

    // 4. edge function (YouTube Data API + grava o cache do banco)
    logTrackEvent('cache_miss', logCtx);
    try {
      const { data, error } = await supabase.functions.invoke('media-video-search', {
        body: { artist, title, album: album || undefined },
      });
      const ms = Date.now() - t0;
      if (error) throw new Error(error.message || 'invoke falhou');
      if (!data?.ok) {
        if (data?.reason === 'not_configured' || data?.reason === 'quota') {
          logTrackEvent('video_error', { ...logCtx, ms, reason: data.reason });
          return { status: 'not_configured', video: null, alternatives: {}, cacheLevel: null, tookMs: ms };
        }
        throw new Error(String(data?.reason || 'erro desconhecido'));
      }
      const entry: CacheEntry = {
        alternatives: rowToAlternatives(data.row || {}),
        none: (data.row?.video_type || 'none') === 'none',
        ts: Date.now(),
      };
      saveEntry(key, entry);
      const res = resultFrom(entry, settings, 'live', ms);
      if (res.video) {
        logTrackEvent('video_found', { ...logCtx, ms, video_id: res.video.video_id, tipo: res.video.video_type, cache: data.cached ? 'servidor' : 'api' });
      } else {
        logTrackEvent('video_missing', { ...logCtx, ms });
      }
      return res;
    } catch (e) {
      const ms = Date.now() - t0;
      logTrackEvent('video_error', { ...logCtx, ms, reason: String((e as Error)?.message || e).slice(0, 200) });
      return { status: 'error', video: null, alternatives: {}, cacheLevel: null, tookMs: ms };
    }
  })().finally(() => { inflight.delete(key); });

  inflight.set(key, p);
  return p;
}

/** Pré-busca ao trocar a música (spec: salvar videoId/thumbnail/duração/tipo
 *  temporariamente para o clique em TV ser instantâneo). Nunca lança. */
export function prefetchVideo(
  artist: string,
  title: string,
  album: string | null | undefined,
  settings: MediaCenterSettings,
): void {
  if (!settings.tv_enabled) return;
  void lookupVideo(artist, title, album, settings).catch(() => { /* silencioso */ });
}
