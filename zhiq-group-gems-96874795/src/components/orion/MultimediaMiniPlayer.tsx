/**
 * ORION-MEDIA-01 — Mini Player do Centro Multimídia (16:9, lazy).
 *
 * • LAZY LOADING OBRIGATÓRIO: nenhum vídeo/iframe é carregado até o usuário
 *   clicar em ▶ Assistir. Só ouvindo rádio → zero requisições de vídeo.
 * • Sem vídeo carregado: mostra capa/logomarca do canal (ou logo Viagg-TX8)
 *   com visualizador de equalizador animado — nunca espaço vazio.
 * • Controles: ▶ Assistir · ⏸ Pausar · 🔊 Volume · 🔇 Mudo · ⛶ Tela Cheia
 *   · ❤ Favoritar · 📤 Compartilhar · 📺 Abrir em Janela.
 * • Ao assistir: pausa a música de fundo e a rádio (nunca dois áudios).
 * • Controle de players embutidos por postMessage (YouTube/Vimeo — sem SDK).
 * • Telemetria: view_start/view_end (duração), share, fullscreen, open_window.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Heart, Share2, ExternalLink, MonitorPlay,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import viaggLogo from '@/assets/logo.png';
import { Slider } from '@/components/ui/slider';
import { getRadioState, togglePlay as toggleRadioPlay } from '@/lib/radioPlayer';
import {
  MediaChannel, MediaEmbed, buildEmbed, isMediaFavorite, toggleMediaFavorite,
  pushMediaHistory, logMediaEvent,
} from '@/lib/multimedia/mediaCenter';

// Barras do visualizador (placeholder animado quando não há vídeo carregado)
const EQ_BARS = [0, 150, 300, 90, 240, 60, 210, 330, 120, 270];

interface MiniPlayerProps {
  channel: MediaChannel | null;
  /** Incrementado quando o usuário clica ▶ numa linha da lista (gesto explícito
      de assistir) — dispara o watch() sem quebrar a regra de lazy loading. */
  watchSignal?: number;
}

export function MultimediaMiniPlayer({ channel, watchSignal = 0 }: MiniPlayerProps) {
  const [embed, setEmbed] = useState<MediaEmbed | null>(null); // null = nada carregado (lazy)
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [favTick, setFavTick] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const channelRef = useRef<MediaChannel | null>(channel);

  const stopView = useCallback((ch: MediaChannel | null) => {
    if (ch && startedAtRef.current) {
      logMediaEvent(ch, 'view_end', { segundos: Math.round((Date.now() - startedAtRef.current) / 1000) });
    }
    startedAtRef.current = null;
  }, []);

  // Troca de canal ou desmonte → descarrega o vídeo e registra a duração.
  useEffect(() => {
    if (channelRef.current?.id !== channel?.id) {
      stopView(channelRef.current);
      setEmbed(null);
      setPaused(false);
    }
    channelRef.current = channel;
  }, [channel, stopView]);
  useEffect(() => () => stopView(channelRef.current), [stopView]);

  // postMessage para os players embutidos (YouTube/Vimeo) — sem SDK externo.
  const embedCmd = useCallback((cmd: 'play' | 'pause' | 'mute' | 'unmute' | 'volume', value?: number) => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !embed || embed.type !== 'iframe') return false;
    if (embed.api === 'youtube') {
      const map = { play: 'playVideo', pause: 'pauseVideo', mute: 'mute', unmute: 'unMute', volume: 'setVolume' } as const;
      win.postMessage(JSON.stringify({ event: 'command', func: map[cmd], args: cmd === 'volume' ? [value ?? 80] : [] }), '*');
      return true;
    }
    if (embed.api === 'vimeo') {
      const payload = cmd === 'volume'
        ? { method: 'setVolume', value: (value ?? 80) / 100 }
        : cmd === 'mute' ? { method: 'setVolume', value: 0 }
        : cmd === 'unmute' ? { method: 'setVolume', value: volume / 100 }
        : { method: cmd };
      win.postMessage(JSON.stringify(payload), '*');
      return true;
    }
    return false; // Twitch/HLS genérico: sem API → Pausar descarrega
  }, [embed, volume]);

  // ▶ Assistir — ÚNICO ponto que carrega vídeo (lazy loading).
  const watch = useCallback(() => {
    if (!channel) return;
    const e = buildEmbed(channel);
    setEmbed(e);
    setPaused(false);
    if (e.type === 'error') return;
    // nunca dois áudios: corta música de fundo e pausa a rádio
    try { window.dispatchEvent(new Event('viagg:stop-bg-music')); } catch { /* ignore */ }
    if (getRadioState().playing) toggleRadioPlay();
    startedAtRef.current = Date.now();
    pushMediaHistory(channel);
    logMediaEvent(channel, 'view_start', { provider: channel.provider || 'auto' });
  }, [channel]);

  const pauseOrResume = useCallback(() => {
    if (!embed || embed.type === 'error') return;
    if (embed.type === 'video') {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) { v.play().catch(() => {}); setPaused(false); } else { v.pause(); setPaused(true); }
      return;
    }
    if (embed.api) {
      embedCmd(paused ? 'play' : 'pause');
      setPaused(p => !p);
    } else {
      // sem API (Twitch/genérico): pausar = descarregar (volta ao placeholder)
      stopView(channel);
      setEmbed(null);
    }
  }, [embed, paused, embedCmd, stopView, channel]);

  const toggleMuted = useCallback(() => {
    const next = !muted;
    setMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
    embedCmd(next ? 'mute' : 'unmute');
    if (channel) logMediaEvent(channel, next ? 'mute' : 'unmute');
  }, [muted, embedCmd, channel]);

  const changeVolume = useCallback((v: number[]) => {
    const pct = v[0] ?? 80;
    setVolume(pct);
    setMuted(pct === 0);
    if (videoRef.current) { videoRef.current.volume = pct / 100; videoRef.current.muted = pct === 0; }
    embedCmd('volume', pct);
  }, [embedCmd]);

  const fullscreen = useCallback(() => {
    boxRef.current?.requestFullscreen?.().catch(() => {});
    if (channel) logMediaEvent(channel, 'fullscreen');
  }, [channel]);

  const openWindow = useCallback(() => {
    if (!channel?.url) return;
    window.open(channel.url, '_blank', 'popup,noopener,width=960,height=600');
    logMediaEvent(channel, 'open_window');
  }, [channel]);

  const share = useCallback(() => {
    if (!channel) return;
    const text = `📺 ${channel.name} — assista no Centro Multimídia Viagg-TX8™`;
    const url = channel.url || window.location.origin;
    if (navigator.share) navigator.share({ title: channel.name, text, url }).catch(() => {});
    else window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n👉 ${url}`)}`, '_blank');
    logMediaEvent(channel, 'share');
  }, [channel]);

  const fav = useCallback(() => {
    if (!channel) return;
    toggleMediaFavorite(channel);
    setFavTick(n => n + 1);
  }, [channel]);

  // ▶ na lista de canais: gesto explícito do usuário → assistir imediatamente.
  const handledSignalRef = useRef(0);
  useEffect(() => {
    if (watchSignal > 0 && watchSignal !== handledSignalRef.current) {
      handledSignalRef.current = watchSignal;
      watch();
    }
  }, [watchSignal, watch]);

  const faved = channel ? isMediaFavorite(channel.id) : false;
  const cover = channel?.cover_url || channel?.logo_url || null;
  const loaded = !!embed && embed.type !== 'error';

  return (
    <div>
      {/* keyframes do visualizador do placeholder */}
      <style>{'@keyframes vggEqBar{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}'}</style>

      {/* ═══ TELA 16:9 ═══ */}
      <div
        ref={boxRef}
        className="relative w-full aspect-video overflow-hidden rounded-xl bg-black/60 ring-1 ring-white/15 shadow-[0_0_24px_-8px_rgba(34,197,94,0.4)]"
      >
        {loaded && embed.type === 'iframe' && (
          <iframe
            ref={iframeRef}
            src={embed.src}
            title={channel?.name || 'Transmissão'}
            className="absolute inset-0 h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            referrerPolicy="origin"
          />
        )}
        {loaded && embed.type === 'video' && (
          <video
            ref={videoRef}
            src={embed.src}
            className="absolute inset-0 h-full w-full object-contain"
            autoPlay
            playsInline
            controls={false}
            muted={muted}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            onError={() => setEmbed({ type: 'error', reason: 'Não foi possível reproduzir este stream neste navegador.' })}
          />
        )}

        {/* PLACEHOLDER — capa/logomarca + visualizador (nunca espaço vazio) */}
        {!loaded && (
          <button
            onClick={watch}
            disabled={!channel?.url}
            className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-2 group"
            aria-label={channel ? `Assistir ${channel.name}` : 'Selecione um canal'}
          >
            {cover ? (
              <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/50" />
            <img
              src={channel?.logo_url || viaggLogo}
              alt=""
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = viaggLogo; }}
              className="relative h-12 w-12 rounded-xl object-contain ring-1 ring-emerald-400/40 bg-black/40 p-1"
            />
            <p className="relative max-w-[90%] truncate text-[12px] font-black text-white">
              {channel?.name || 'Centro Multimídia Viagg-TX8'}
            </p>
            {/* visualizador de áudio animado */}
            <div className="relative flex h-6 items-end gap-[3px]" aria-hidden="true">
              {EQ_BARS.map((delay, i) => (
                <span
                  key={i}
                  className="w-[4px] rounded-sm bg-gradient-to-t from-emerald-500 to-green-300 origin-bottom"
                  style={{ height: '100%', animation: `vggEqBar ${900 + (i % 4) * 180}ms ease-in-out ${delay}ms infinite` }}
                />
              ))}
            </div>
            {channel?.url ? (
              <span className="relative mt-1 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-green-500 px-3.5 py-1.5 text-[11px] font-black text-white shadow-[0_0_16px_-4px_rgba(16,185,129,0.9)] transition-transform group-hover:scale-105 group-active:scale-95">
                <Play className="h-3.5 w-3.5" /> Assistir
              </span>
            ) : (
              <span className="relative text-[10px] font-bold text-white/50">Escolha um canal na lista abaixo</span>
            )}
          </button>
        )}

        {/* erro de fonte (segurança/compatibilidade) */}
        {embed?.type === 'error' && (
          <div className="absolute inset-x-0 bottom-0 bg-red-500/85 px-2 py-1 text-center text-[10px] font-bold text-white">
            {embed.reason}
          </div>
        )}

        {/* 🔴 AO VIVO */}
        {channel?.is_live && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Ao vivo
          </span>
        )}
        {channel?.is_official && (
          <span className="absolute right-2 top-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow">
            TV Viagg
          </span>
        )}
      </div>

      {/* ═══ CONTROLES ═══ */}
      <div className="mt-1.5 flex items-center gap-1">
        <button
          onClick={loaded ? pauseOrResume : watch}
          disabled={!channel?.url}
          title={!loaded ? 'Assistir' : paused ? 'Continuar' : 'Pausar'}
          aria-label={!loaded ? 'Assistir' : paused ? 'Continuar' : 'Pausar'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 text-white disabled:opacity-40 active:scale-95"
        >
          {!loaded || paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={toggleMuted}
          disabled={!loaded}
          title={muted ? 'Ativar som' : 'Mudo'}
          aria-label={muted ? 'Ativar som' : 'Mudo'}
          className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors disabled:opacity-40 active:scale-95',
            muted ? 'bg-red-500/15 text-red-300 ring-red-500/30' : 'bg-white/5 text-white/70 ring-white/10 hover:text-white')}
        >
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
        <div className="mx-1 min-w-0 flex-1">
          <Slider value={[muted ? 0 : volume]} min={0} max={100} step={1} onValueChange={changeVolume} aria-label="Volume do vídeo" />
        </div>
        {([
          [Maximize, 'Tela Cheia', fullscreen, false],
          [Heart, faved ? 'Remover dos favoritos' : 'Favoritar', fav, faved],
          [Share2, 'Compartilhar', share, false],
          [ExternalLink, 'Abrir em Janela', openWindow, false],
        ] as [typeof Maximize, string, () => void, boolean][]).map(([I, label, fn, active]) => (
          <button
            key={label}
            onClick={fn}
            disabled={!channel}
            title={label}
            aria-label={label}
            className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors disabled:opacity-40 active:scale-95',
              active ? 'bg-rose-500/20 text-rose-300 ring-rose-500/40' : 'bg-white/5 text-white/70 ring-white/10 hover:text-white')}
          >
            <I className={cn('h-3.5 w-3.5', active && 'fill-current')} />
          </button>
        ))}
      </div>
      <p className="mt-1 flex items-center gap-1 text-[8px] font-bold text-white/30" key={favTick}>
        <MonitorPlay className="h-2.5 w-2.5" /> O vídeo só carrega quando você toca em Assistir (economia de dados).
      </p>
    </div>
  );
}

export default MultimediaMiniPlayer;
