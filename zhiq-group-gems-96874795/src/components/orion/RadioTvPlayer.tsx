/**
 * RadioTvPlayer — ORION-MEDIA-02: player inteligente Rádio ⇄ TV.
 *
 * Aparece na aba Rádio QUANDO uma música é detectada no ar (nowPlaying):
 * • MODO RÁDIO: capa da música, nome/artista/álbum, equalizador animado,
 *   barra de progresso (duração via iTunes; sem duração → barra viva),
 *   informações da transmissão (emissora, bitrate, codec, EQ).
 * • MODO TV: troca o equalizador pelo videoclipe (embed youtube-nocookie —
 *   NUNCA hospedamos vídeo). Fallback: oficial → lyric → live → visualizer,
 *   respeitando as configurações do admin. Sem vídeo → "Vídeo indisponível
 *   para esta música." e o áudio continua.
 * • NUNCA dois áudios: abrir TV pausa a rádio (pauseRadio); voltar retoma.
 * • Vídeo terminou → volta sozinho para a rádio (reprodução contínua).
 * • Música trocou em modo TV: autoplay ligado → carrega o novo clipe;
 *   desligado → volta para a rádio.
 * • Controles: ⏮ ▶/⏸ ⏭ (estações da lista atual) · 🔊 volume (rádio E vídeo)
 *   · ❤ curtir · 📤 compartilhar · ⛶ tela cheia.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize,
  Heart, Share2, Radio as RadioIcon, Tv, Loader2, Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import viaggLogo from '@/assets/logo.png';
import { Slider } from '@/components/ui/slider';
import type { RadioStation } from '@/lib/radioBrowser';
import {
  playStation, togglePlay, pauseRadio, stopRadio, setRadioVolume,
  subscribeRadio, getRadioState, type RadioState,
} from '@/lib/radioPlayer';
import { setVideoActive, logTrackEvent } from '@/lib/multimedia/mediaCenter';
import {
  subscribeNowPlaying, getNowPlaying, setNowPlayingKeepAlive, type NowPlayingTrack,
} from '@/lib/multimedia/nowPlaying';
import {
  lookupVideo, prefetchVideo, trackKey, VIDEO_TYPE_LABEL, type TrackVideo,
} from '@/lib/multimedia/videoLookup';
import {
  fetchMediaSettings, DEFAULT_MEDIA_SETTINGS, type MediaCenterSettings,
} from '@/lib/multimedia/mediaSettings';

const EQ_BARS = [0, 150, 300, 90, 240, 60, 210, 330, 120, 270, 180, 30];
const LIKES_KEY = 'viagg_track_likes_v1';
const UNAVAILABLE_MSG = 'Vídeo indisponível para esta música.';

// ── curtidas locais (por música) ─────────────────────────────────────────────
function readLikes(): Record<string, { artist: string; title: string; ts: number }> {
  try {
    const v = JSON.parse(localStorage.getItem(LIKES_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}
function toggleLike(key: string, artist: string, title: string): boolean {
  const all = readLikes();
  const liked = !!all[key];
  if (liked) delete all[key];
  else all[key] = { artist, title, ts: Date.now() };
  try {
    const entries = Object.entries(all).sort((a, b) => b[1].ts - a[1].ts).slice(0, 200);
    localStorage.setItem(LIKES_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* quota → ignora */ }
  return !liked;
}

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// mapeia a resolução limite do admin para a escala do player do YouTube
function qualityCap(settings: MediaCenterSettings): string | null {
  if (settings.tv_auto_quality) {
    const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
    const slow = conn?.effectiveType && /(^|\b)(slow-2g|2g|3g)\b/.test(conn.effectiveType);
    return slow ? 'large' : null; // conexão lenta → limita a 480p; senão o YT decide
  }
  const map: Record<string, string> = { '360': 'medium', '480': 'large', '720': 'hd720', '1080': 'hd1080' };
  return map[settings.tv_max_resolution] || null;
}

function useRadio(): RadioState {
  const [st, setSt] = useState<RadioState>(getRadioState());
  useEffect(() => subscribeRadio(setSt), []);
  return st;
}

interface Props {
  /** lista visível na aba Rádio — contexto do ⏮/⏭ (estação anterior/próxima) */
  stations: RadioStation[];
}

export function RadioTvPlayer({ stations }: Props) {
  const radio = useRadio();
  const [track, setTrack] = useState<NowPlayingTrack | null>(getNowPlaying());
  const [settings, setSettings] = useState<MediaCenterSettings>(DEFAULT_MEDIA_SETTINGS);
  const [mode, setMode] = useState<'radio' | 'tv'>('radio');
  const [video, setVideo] = useState<TrackVideo | null>(null);
  const [tvLoading, setTvLoading] = useState(false);
  const [tvPaused, setTvPaused] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [likeTick, setLikeTick] = useState(0);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const tvOpenedAtRef = useRef<number | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => subscribeNowPlaying(setTrack), []);
  useEffect(() => { fetchMediaSettings().then(setSettings); }, []);

  // relógio da barra de progresso (só quando há duração conhecida)
  useEffect(() => {
    if (!track?.durationMs || mode !== 'radio') return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [track?.durationMs, mode]);

  // modo TV mantém a detecção de música viva (rádio pausada) + flag anti-2-áudios
  useEffect(() => {
    setNowPlayingKeepAlive(mode === 'tv');
    setVideoActive(mode === 'tv');
    return () => { setNowPlayingKeepAlive(false); setVideoActive(false); };
  }, [mode]);

  const showBanner = useCallback((msg: string) => {
    setBanner(msg);
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => setBanner(null), 6000);
  }, []);
  useEffect(() => () => { if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current); }, []);

  // ── comandos ao iframe do YouTube (postMessage — sem SDK externo) ──────────
  const ytCmd = useCallback((func: string, args: unknown[] = []) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func, args }), '*',
      );
    } catch { /* ignore */ }
  }, []);

  const backToRadio = useCallback((resume: boolean) => {
    setVideo(null);
    setTvPaused(false);
    setMode('radio');
    if (tvOpenedAtRef.current) {
      logTrackEvent('tv_close', { segundos: Math.round((Date.now() - tvOpenedAtRef.current) / 1000) });
      tvOpenedAtRef.current = null;
    }
    if (resume) {
      const st = getRadioState();
      if (st.station && !st.playing && !st.loading) togglePlay();
    }
  }, []);

  const loadVideoForTrack = useCallback(async (t: NowPlayingTrack, opts: { firstOpen: boolean }) => {
    setTvLoading(true);
    const res = await lookupVideo(t.artist, t.title, t.album, settingsRef.current);
    setTvLoading(false);
    if (res.video) {
      if (opts.firstOpen) {
        pauseRadio();                 // nunca dois áudios: o vídeo assume
        tvOpenedAtRef.current = Date.now();
        logTrackEvent('tv_open', { artist: t.artist, title: t.title, video_id: res.video.video_id, tipo: res.video.video_type });
      }
      setTvPaused(false);
      setVideo(res.video);
      setMode('tv');
      return true;
    }
    showBanner(UNAVAILABLE_MSG);
    if (!opts.firstOpen) backToRadio(true); // troca de música sem clipe → segue só o áudio
    return false;
  }, [showBanner, backToRadio]);

  const openTv = useCallback(() => {
    if (!track || tvLoading) return;
    void loadVideoForTrack(track, { firstOpen: true });
  }, [track, tvLoading, loadVideoForTrack]);

  // ── pré-busca ao trocar a música + comportamento em modo TV ────────────────
  const lastKeyRef = useRef<string>('');
  useEffect(() => {
    if (!track) return;
    const key = trackKey(track.artist, track.title);
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    prefetchVideo(track.artist, track.title, track.album, settingsRef.current);
    if (modeRef.current === 'tv') {
      if (settingsRef.current.tv_autoplay) void loadVideoForTrack(track, { firstOpen: false });
      else backToRadio(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.raw, track?.startedAt]);

  // ── eventos do player do YouTube: fim do vídeo → volta para a rádio ────────
  useEffect(() => {
    if (mode !== 'tv') return;
    const onMsg = (e: MessageEvent) => {
      if (typeof e.origin !== 'string' || !/(^|\.)youtube(-nocookie)?\.com$/.test((() => { try { return new URL(e.origin).hostname; } catch { return ''; } })())) return;
      let d: { event?: string; info?: unknown } | null = null;
      try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
      const state = d?.event === 'onStateChange' ? d.info
        : d?.event === 'infoDelivery' ? (d.info as { playerState?: number })?.playerState
        : undefined;
      if (state === 0) backToRadio(true);           // terminou → reprodução contínua
      else if (state === 2) setTvPaused(true);
      else if (state === 1) setTvPaused(false);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [mode, backToRadio]);

  // handshake + volume + limite de qualidade quando o iframe carrega
  const onIframeLoad = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try { win.postMessage(JSON.stringify({ event: 'listening', id: 'viaggtv', channel: 'widget' }), '*'); } catch { /* ignore */ }
    setTimeout(() => {
      ytCmd('setVolume', [Math.round((getRadioState().volume ?? 0.9) * 100)]);
      const cap = qualityCap(settingsRef.current);
      if (cap) ytCmd('setPlaybackQualityRange', ['tiny', cap]); // melhor esforço (YT pode ignorar)
    }, 400);
  }, [ytCmd]);

  // ── controles ───────────────────────────────────────────────────────────────
  const stationIdx = useMemo(
    () => stations.findIndex(s => s.stationuuid === radio.station?.stationuuid),
    [stations, radio.station?.stationuuid],
  );
  const canSkip = stations.length > 1;

  const skip = useCallback((dir: 1 | -1) => {
    if (!canSkip) return;
    const base = stationIdx >= 0 ? stationIdx : 0;
    const next = stations[(base + dir + stations.length) % stations.length];
    if (!next) return;
    if (modeRef.current === 'tv') backToRadio(false);
    void playStation(next);
  }, [canSkip, stationIdx, stations, backToRadio]);

  const playPause = useCallback(() => {
    if (modeRef.current === 'tv') {
      ytCmd(tvPaused ? 'playVideo' : 'pauseVideo');
      setTvPaused(p => !p);
    } else {
      togglePlay();
    }
  }, [tvPaused, ytCmd]);

  const changeVolume = useCallback((v: number[]) => {
    const vol = (v[0] ?? 90) / 100;
    setRadioVolume(vol);               // rádio (estado global do volume)
    ytCmd('setVolume', [Math.round(vol * 100)]); // vídeo acompanha
  }, [ytCmd]);

  const likeKey = track ? trackKey(track.artist, track.title) : '';
  const liked = likeKey ? !!readLikes()[likeKey] : false;
  const like = useCallback(() => {
    if (!track || !likeKey) return;
    const nowLiked = toggleLike(likeKey, track.artist, track.title);
    setLikeTick(n => n + 1);
    if (nowLiked) logTrackEvent('like', { artist: track.artist, title: track.title, video_id: video?.video_id });
  }, [track, likeKey, video?.video_id]);

  const share = useCallback(() => {
    if (!track) return;
    const nome = track.artist ? `${track.artist} – ${track.title}` : track.title;
    const text = `🎵 ${nome} — tocando agora na Rádio do Viagg-TX8™`;
    const url = video ? `https://youtu.be/${video.video_id}` : window.location.origin;
    if (navigator.share) navigator.share({ title: nome, text, url }).catch(() => { /* cancelou */ });
    else window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n👉 ${url}`)}`, '_blank');
    logTrackEvent('share', { artist: track.artist, title: track.title, video_id: video?.video_id });
  }, [track, video]);

  const fullscreen = useCallback(() => {
    boxRef.current?.requestFullscreen?.().catch(() => { /* iOS não suporta */ });
  }, []);

  if (!radio.station || !track) return null; // sem música detectada → tela atual

  const cover = track.artworkUrl || radio.station.favicon || null;
  const elapsed = nowMs - track.startedAt;
  const progress = track.durationMs ? Math.min(100, (elapsed / track.durationMs) * 100) : null;
  const isPlaying = mode === 'tv' ? !tvPaused : radio.playing;
  const tvVisible = settings.tv_enabled;
  const embedSrc = video
    ? `https://www.youtube-nocookie.com/embed/${video.video_id}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
    : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-950/60 to-black/40 shadow-[0_0_24px_-10px_rgba(16,185,129,0.55)]">
      <style>{'@keyframes vggEqBar{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}@keyframes vggProgress{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}'}</style>

      {/* ═══ CABEÇALHO: alternância Rádio ⇄ TV ═══ */}
      <div className="flex items-center gap-1.5 px-2.5 pt-2.5">
        <div className="flex flex-1 gap-1.5">
          <button
            onClick={() => { if (mode === 'tv') backToRadio(true); }}
            aria-pressed={mode === 'radio'}
            className={cn('flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-black transition-all active:scale-95',
              mode === 'radio'
                ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-[0_0_14px_-4px_rgba(16,185,129,0.9)]'
                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white')}
          >
            <RadioIcon className="h-3.5 w-3.5" /> Rádio
          </button>
          {tvVisible && (
            <button
              onClick={() => { if (mode === 'radio') openTv(); }}
              aria-pressed={mode === 'tv'}
              disabled={tvLoading}
              className={cn('flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-black transition-all active:scale-95',
                mode === 'tv'
                  ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-[0_0_14px_-4px_rgba(14,165,233,0.9)]'
                  : 'bg-sky-500/10 text-sky-300 hover:bg-sky-500/20')}
            >
              {tvLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tv className="h-3.5 w-3.5" />} TV
            </button>
          )}
        </div>
        <button
          onClick={() => { backToRadio(false); stopRadio(); }}
          title="Parar e desligar a rádio"
          aria-label="Parar rádio"
          className="flex h-7 items-center gap-1 rounded-lg bg-red-500/15 px-2 text-red-300 transition-colors hover:bg-red-500/25 active:scale-95"
        >
          <Square className="h-3 w-3 fill-current" />
          <span className="text-[10px] font-bold">Parar</span>
        </button>
      </div>

      {/* mensagem elegante quando não há vídeo (o áudio continua) */}
      {banner && (
        <p className="mx-2.5 mt-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-center text-[11px] font-bold text-amber-200">
          📺 {banner} <span className="font-medium text-amber-200/70">A rádio continua tocando.</span>
        </p>
      )}

      {/* ═══ ÁREA PRINCIPAL ═══ */}
      {mode === 'tv' && embedSrc ? (
        <div className="p-2.5 pb-0">
          <div ref={boxRef} className="relative w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/15" style={{ aspectRatio: '16 / 9' }}>
            <iframe
              ref={iframeRef}
              src={embedSrc}
              onLoad={onIframeLoad}
              title={track.artist ? `${track.artist} – ${track.title}` : track.title}
              className="absolute inset-0 h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
              referrerPolicy="origin"
            />
            <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-sky-300 ring-1 ring-sky-400/40">
              {VIDEO_TYPE_LABEL[video!.video_type]}
            </span>
          </div>
          <p className="mt-1.5 truncate px-0.5 text-[12px] font-bold text-white">
            {track.title} {track.artist && <span className="font-medium text-white/55">· {track.artist}</span>}
          </p>
        </div>
      ) : (
        <div ref={boxRef} className="flex items-center gap-3 bg-transparent p-2.5 pb-0">
          {/* capa da música (iTunes) → logo da rádio → logo Viagg */}
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl ring-1 ring-emerald-400/30 bg-black/40">
            <img
              src={cover || viaggLogo}
              alt=""
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = viaggLogo; }}
              className="h-full w-full object-cover"
            />
            {radio.loading && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-300" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 self-stretch py-0.5">
            <p className="truncate text-[13px] font-black leading-tight text-white">{track.title}</p>
            <p className="truncate text-[11px] font-bold text-emerald-300/90">{track.artist || 'Artista não informado'}</p>
            {track.album && <p className="truncate text-[9px] text-white/40">{track.album}{track.isrc ? ` · ISRC ${track.isrc}` : ''}</p>}
            {/* equalizador animado (vivo só com a rádio tocando) */}
            <div className="mt-1.5 flex h-5 items-end gap-[3px]" aria-hidden="true">
              {EQ_BARS.map((delay, i) => (
                <span
                  key={i}
                  className="w-[4px] origin-bottom rounded-sm bg-gradient-to-t from-emerald-500 to-green-300"
                  style={{
                    height: '100%',
                    animation: radio.playing ? `vggEqBar ${900 + (i % 4) * 180}ms ease-in-out ${delay}ms infinite` : 'none',
                    transform: radio.playing ? undefined : 'scaleY(0.2)',
                    opacity: radio.playing ? 1 : 0.4,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ BARRA DE PROGRESSO (modo rádio) ═══ */}
      {mode === 'radio' && (
        <div className="px-2.5 pt-2">
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            {progress !== null ? (
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-400 transition-[width] duration-1000 ease-linear"
                style={{ width: `${progress}%` }}
              />
            ) : (
              // ao vivo sem duração conhecida → barra "viva" (indeterminada)
              <div
                className="h-full w-2/5 rounded-full bg-gradient-to-r from-transparent via-emerald-400/80 to-transparent"
                style={{ animation: radio.playing ? 'vggProgress 2.4s linear infinite' : 'none' }}
              />
            )}
          </div>
          <div className="mt-0.5 flex justify-between text-[8px] font-bold tabular-nums text-white/35">
            <span>{track.durationMs ? fmtTime(Math.min(elapsed, track.durationMs)) : '● AO VIVO'}</span>
            <span>{track.durationMs ? fmtTime(track.durationMs) : ''}</span>
          </div>
        </div>
      )}

      {/* ═══ CONTROLES ═══ */}
      <div className="flex items-center gap-1 p-2.5 pt-1.5">
        <button
          onClick={() => skip(-1)}
          disabled={!canSkip}
          title="Estação anterior"
          aria-label="Estação anterior"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/70 ring-1 ring-white/10 transition-colors hover:text-white disabled:opacity-30 active:scale-95"
        >
          <SkipBack className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={playPause}
          title={isPlaying ? 'Pausar' : 'Tocar'}
          aria-label={isPlaying ? 'Pausar' : 'Tocar'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 text-white shadow-[0_0_14px_-4px_rgba(16,185,129,0.9)] active:scale-95"
        >
          {radio.loading && mode === 'radio'
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          onClick={() => skip(1)}
          disabled={!canSkip}
          title="Próxima estação"
          aria-label="Próxima estação"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/70 ring-1 ring-white/10 transition-colors hover:text-white disabled:opacity-30 active:scale-95"
        >
          <SkipForward className="h-3.5 w-3.5" />
        </button>

        <div className="mx-1 flex min-w-0 flex-1 items-center gap-1.5">
          {radio.volume === 0
            ? <VolumeX className="h-3.5 w-3.5 shrink-0 text-white/40" />
            : <Volume2 className="h-3.5 w-3.5 shrink-0 text-white/40" />}
          <Slider
            value={[Math.round(radio.volume * 100)]}
            min={0} max={100} step={1}
            onValueChange={changeVolume}
            aria-label="Volume"
          />
        </div>

        {([
          [Heart, liked ? 'Descurtir' : 'Curtir esta música', like, liked],
          [Share2, 'Compartilhar', share, false],
          [Maximize, 'Tela cheia', fullscreen, false],
        ] as [typeof Heart, string, () => void, boolean][]).map(([I, label, fn, active]) => (
          <button
            key={label}
            onClick={fn}
            title={label}
            aria-label={label}
            className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors active:scale-95',
              active ? 'bg-rose-500/20 text-rose-300 ring-rose-500/40' : 'bg-white/5 text-white/70 ring-white/10 hover:text-white')}
          >
            <I className={cn('h-3.5 w-3.5', active && 'fill-current')} />
          </button>
        ))}
      </div>

      {/* ═══ INFORMAÇÕES DA TRANSMISSÃO ═══ */}
      <p className="border-t border-white/5 bg-black/30 px-2.5 py-1.5 text-[9px] font-bold text-white/40" key={likeTick}>
        📡 {radio.station.name?.trim() || 'Rádio'}
        {[radio.station.state, radio.station.country].filter(Boolean).length > 0 && ` · ${[radio.station.state, radio.station.country].filter(Boolean).join('/')}`}
        {radio.station.bitrate ? ` · ${radio.station.bitrate}kbps` : ''}
        {radio.station.codec ? ` · ${radio.station.codec}` : ''}
        {mode === 'radio' && (radio.eqActive ? ' · 🎚 EQ ativo' : '')}
        {mode === 'tv' && ' · 📺 modo TV (áudio pelo vídeo)'}
      </p>
    </div>
  );
}

export default RadioTvPlayer;
