/**
 * ORION-MEDIA-01 — Centro Multimídia (núcleo).
 *
 * Camada de dados/segurança do Centro Multimídia (painel Áudio+Vídeo):
 * • Tipos dos canais (TV, Lives, canal oficial TV Viagg, leilões, produtos).
 * • SEGURANÇA: só HTTPS; embeds apenas de hosts na allowlist; nunca iframe
 *   arbitrário; URLs com credenciais ou IP cru são rejeitadas.
 * • Embed builder (YouTube/Vimeo/Twitch → iframe com JS API; HLS/MP4 → <video>).
 * • Favoritos/Histórico locais (localStorage — mesmo padrão do radioPlayer).
 * • Telemetria fire-and-forget em media_playback_events (ouvintes/espectadores,
 *   tempo, curtidas, compartilhamentos, favoritos, origem do acesso).
 * • Fonte de canais: tabela media_channels (RLS: público lê 'active'; admin tudo).
 *   Se a migration ainda não foi aplicada, degrada para lista vazia SEM quebrar.
 *
 * Preparado (colunas source_type/source_id, priority, featured, region, category)
 * para: leilões ao vivo, vídeos de produtos e recomendações do ORION AI.
 */
import { supabase } from '@/integrations/supabase/client';

export type MediaKind = 'tv' | 'live';
export type MediaProvider = 'youtube' | 'vimeo' | 'twitch' | 'hls' | 'video' | 'iframe';
export type MediaStatus = 'active' | 'inactive' | 'blocked';

export interface MediaChannel {
  id: string;
  kind: MediaKind;
  name: string;
  description?: string | null;
  url: string | null;
  provider?: MediaProvider | null;
  logo_url?: string | null;
  cover_url?: string | null;
  category?: string | null;
  region?: string | null;
  priority?: number;
  featured?: boolean;
  is_official?: boolean; // TV Viagg (canal oficial da plataforma)
  is_live?: boolean;     // 🔴 AO VIVO
  status?: MediaStatus;
  source_type?: 'platform' | 'merchant' | 'auction' | 'product' | null;
  source_id?: string | null;
}

// ── SEGURANÇA: allowlist de hosts de embed (nunca iframe de origem arbitrária) ──
const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com'];
const VIMEO_HOSTS = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'];
const TWITCH_HOSTS = ['twitch.tv', 'www.twitch.tv', 'player.twitch.tv', 'm.twitch.tv'];

/** URL aceitável como fonte de mídia? HTTPS, sem credenciais, sem IP cru. */
export function validateMediaUrl(raw: string | null | undefined): { ok: boolean; reason?: string } {
  if (!raw || !raw.trim()) return { ok: false, reason: 'URL vazia' };
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { ok: false, reason: 'URL inválida' }; }
  if (u.protocol !== 'https:') return { ok: false, reason: 'Apenas HTTPS é permitido' };
  if (u.username || u.password) return { ok: false, reason: 'URL com credenciais não é permitida' };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname) || u.hostname === 'localhost') {
    return { ok: false, reason: 'Endereço IP/local não é permitido' };
  }
  return { ok: true };
}

/** Detecta o provedor a partir da URL (usado quando o cadastro não define). */
export function detectProvider(raw: string): MediaProvider | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (YT_HOSTS.includes(host)) return 'youtube';
  if (VIMEO_HOSTS.includes(host)) return 'vimeo';
  if (TWITCH_HOSTS.includes(host)) return 'twitch';
  if (/\.m3u8([?#]|$)/i.test(u.pathname + u.search)) return 'hls';
  if (/\.(mp4|webm|ogv|ogg|mov)([?#]|$)/i.test(u.pathname)) return 'video';
  return null; // iframe genérico NÃO é permitido fora da allowlist acima
}

function youtubeId(u: URL): string | null {
  if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
  const v = u.searchParams.get('v');
  if (v) return v;
  const m = u.pathname.match(/\/(embed|live|shorts|v)\/([\w-]{6,})/);
  return m ? m[2] : null;
}

export type MediaEmbed =
  | { type: 'iframe'; src: string; api: 'youtube' | 'vimeo' | null }
  | { type: 'video'; src: string; hls: boolean }
  | { type: 'error'; reason: string };

/**
 * Monta o embed SEGURO do canal. Chamado somente após o clique em "Assistir"
 * (lazy loading obrigatório — nada de vídeo carregado em segundo plano).
 */
export function buildEmbed(ch: MediaChannel): MediaEmbed {
  const val = validateMediaUrl(ch.url);
  if (!val.ok || !ch.url) return { type: 'error', reason: val.reason || 'Fonte inválida' };
  const provider = ch.provider || detectProvider(ch.url);
  const u = new URL(ch.url);
  const origin = encodeURIComponent(window.location.origin);
  switch (provider) {
    case 'youtube': {
      const id = youtubeId(u);
      if (!id) return { type: 'error', reason: 'Vídeo do YouTube não identificado' };
      return {
        type: 'iframe', api: 'youtube',
        src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&enablejsapi=1&origin=${origin}`,
      };
    }
    case 'vimeo': {
      const id = (u.pathname.match(/\/(\d{6,})/) || [])[1];
      if (!id) return { type: 'error', reason: 'Vídeo do Vimeo não identificado' };
      return { type: 'iframe', api: 'vimeo', src: `https://player.vimeo.com/video/${id}?autoplay=1&playsinline=1` };
    }
    case 'twitch': {
      const channel = u.hostname === 'player.twitch.tv'
        ? u.searchParams.get('channel') || ''
        : u.pathname.slice(1).split('/')[0] || '';
      if (!channel) return { type: 'error', reason: 'Canal da Twitch não identificado' };
      return {
        type: 'iframe', api: null,
        src: `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${window.location.hostname}&autoplay=true`,
      };
    }
    case 'hls': return { type: 'video', src: ch.url, hls: true };
    case 'video': return { type: 'video', src: ch.url, hls: false };
    default:
      return { type: 'error', reason: 'Fonte não autorizada (permitido: YouTube, Vimeo, Twitch, HLS ou vídeo direto)' };
  }
}

// ── Canais (media_channels) — degrada para vazio se a migration não existir ──
export async function fetchChannels(kind?: MediaKind): Promise<MediaChannel[]> {
  try {
    let q = (supabase.from('media_channels') as any)
      .select('*').eq('status', 'active')
      .order('featured', { ascending: false })
      .order('priority', { ascending: false })
      .order('name', { ascending: true })
      .limit(120);
    if (kind) q = q.eq('kind', kind);
    const { data, error } = await q;
    if (error) { console.warn('[media] canais indisponíveis:', error.message); return []; }
    return (Array.isArray(data) ? data : []).filter((c: MediaChannel) => validateMediaUrl(c.url).ok);
  } catch (e) {
    console.warn('[media] fetchChannels:', e);
    return [];
  }
}

// ── Favoritos + histórico locais (mesmo padrão do radioPlayer) ──
const FAV_KEY = 'viagg_media_favs';
const HIST_KEY = 'viagg_media_hist';
const HIST_MAX = 30;

function readList(key: string): MediaChannel[] {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function writeList(key: string, list: MediaChannel[]) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* quota → ignora */ }
}

export const getMediaFavorites = () => readList(FAV_KEY);
export const isMediaFavorite = (id: string) => readList(FAV_KEY).some(c => c.id === id);
export function toggleMediaFavorite(ch: MediaChannel): boolean {
  const list = readList(FAV_KEY);
  const has = list.some(c => c.id === ch.id);
  writeList(FAV_KEY, has ? list.filter(c => c.id !== ch.id) : [ch, ...list].slice(0, 60));
  logMediaEvent(ch, has ? 'unfavorite' : 'favorite');
  return !has;
}
export const getMediaHistory = () => readList(HIST_KEY);
export function pushMediaHistory(ch: MediaChannel) {
  const list = readList(HIST_KEY).filter(c => c.id !== ch.id);
  writeList(HIST_KEY, [ch, ...list].slice(0, HIST_MAX));
}

// ── Coordenação de áudio: vídeo ativo bloqueia a música de fundo ─────────────
// FIX SHC-02: sem esta flag, abrir/fechar o painel (botão Som) com um vídeo
// tocando religava a música de fundo → dois áudios simultâneos.
declare global { interface Window { __viagg_video_active__?: boolean } }
export const setVideoActive = (v: boolean) => { try { window.__viagg_video_active__ = v; } catch { /* ignore */ } };
export const isVideoActive = () => { try { return !!window.__viagg_video_active__; } catch { return false; } };

// ── Telemetria (media_playback_events) — fire-and-forget, nunca quebra a UI ──
function sessionId(): string {
  try {
    let s = sessionStorage.getItem('viagg_media_session');
    if (!s) {
      s = (crypto?.randomUUID?.() || `s-${Math.random().toString(36).slice(2)}${Date.now()}`);
      sessionStorage.setItem('viagg_media_session', s);
    }
    return s;
  } catch { return 'anon'; }
}

export type MediaEvento =
  | 'view_start' | 'view_end' | 'favorite' | 'unfavorite'
  | 'share' | 'fullscreen' | 'open_window' | 'mute' | 'unmute';

/** Eventos do modo Rádio+TV (ORION-MEDIA-02) — sem canal (channel_id null). */
export type TrackEvento =
  | 'radio_track' | 'video_found' | 'video_missing' | 'video_error'
  | 'cache_hit' | 'cache_miss' | 'like' | 'tv_open' | 'tv_close' | 'share';

export function logMediaEvent(ch: MediaChannel, evento: MediaEvento, detalhes: Record<string, unknown> = {}) {
  try {
    (supabase.from('media_playback_events') as any).insert({
      channel_id: ch.id,
      evento,
      session_id: sessionId(),
      detalhes: {
        ...detalhes,
        canal: ch.name,
        kind: ch.kind,
        origem: window.location.pathname,
        dispositivo: window.innerWidth < 640 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
      },
    }).then(() => { /* ok */ }, () => { /* tabela ausente/offline → ignora */ });
  } catch { /* nunca propaga */ }
}

/**
 * Telemetria do modo Rádio+TV: música detectada, vídeo encontrado/indisponível,
 * cache HIT/MISS, curtir, abrir/fechar TV. Fire-and-forget — nunca quebra a UI.
 * (Requer a migration 20260727120000_radio_tv_mode.sql; sem ela, o insert é
 * recusado pelo CHECK e silenciosamente ignorado.)
 */
export function logTrackEvent(evento: TrackEvento, detalhes: Record<string, unknown> = {}) {
  try {
    (supabase.from('media_playback_events') as any).insert({
      channel_id: null,
      evento,
      session_id: sessionId(),
      detalhes: {
        ...detalhes,
        origem: window.location.pathname,
        dispositivo: window.innerWidth < 640 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
      },
    }).then(() => { /* ok */ }, () => { /* migration ausente/offline → ignora */ });
  } catch { /* nunca propaga */ }
}
