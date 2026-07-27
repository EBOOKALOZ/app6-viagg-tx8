/**
 * ORION-MEDIA-01 — Áreas de vídeo do Centro Multimídia.
 *
 * Um componente, quatro modos (aba do painel):
 * • tv    — WebTV/canais (TV Viagg em destaque no topo) + Mini Player 16:9.
 * • live  — transmissões ao vivo (lives de lojistas, leilões, eventos) + player.
 * • favs  — favoritos UNIFICADOS: rádios (radioPlayer) + TVs/Lives (mediaCenter).
 * • hist  — histórico unificado (rádios + vídeos).
 *
 * Canais vêm de media_channels (admin gerencia em /admin/multimidia). Sem
 * migration aplicada → lista vazia declarada (nunca quebra). Lazy: nenhuma
 * mídia carrega antes do clique em Assistir (regra vive no MiniPlayer).
 */
import { useEffect, useMemo, useState } from 'react';
import { Search, Heart, Play, Pause, Loader2, Tv, RadioTower, Star, History as HistoryIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MultimediaMiniPlayer } from './MultimediaMiniPlayer';
import {
  MediaChannel, MediaKind, fetchChannels, getMediaFavorites, getMediaHistory,
  isMediaFavorite, toggleMediaFavorite,
} from '@/lib/multimedia/mediaCenter';
import {
  playStation, togglePlay, subscribeRadio, getRadioState,
  getFavorites as getRadioFavorites, getHistory as getRadioHistory, type RadioState,
} from '@/lib/radioPlayer';
import { countClick, type RadioStation } from '@/lib/radioBrowser';

export type MultimediaMode = 'tv' | 'live' | 'favs' | 'hist';

interface Props {
  mode: MultimediaMode;
  selected: MediaChannel | null;
  onSelect: (ch: MediaChannel) => void;
  /** favs/hist: abrir um canal de vídeo → o pai troca para a aba TV/Lives. */
  onOpenChannel: (ch: MediaChannel) => void;
}

function useRadio(): RadioState {
  const [st, setSt] = useState<RadioState>(getRadioState());
  useEffect(() => subscribeRadio(setSt), []);
  return st;
}

function ChannelLogo({ src, name }: { src?: string | null; name: string }) {
  const [ok, setOk] = useState(!!src);
  if (!src || !ok) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/25 text-[13px]">
        📺
      </span>
    );
  }
  return <img src={src} alt={name} onError={() => setOk(false)} className="h-9 w-9 shrink-0 rounded-lg bg-white/5 object-cover" />;
}

function ChannelRow({ ch, active, onPlay, onFavTick }: {
  ch: MediaChannel; active: boolean; onPlay: () => void; onFavTick: () => void;
}) {
  const faved = isMediaFavorite(ch.id);
  return (
    <div className={cn('flex items-center gap-2 rounded-xl border p-1.5',
      active ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-white/10 bg-white/[0.03]')}>
      <ChannelLogo src={ch.logo_url} name={ch.name} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[12px] font-bold text-white">
          <span className="truncate">{ch.name}</span>
          {ch.is_live && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-1.5 py-px text-[8px] font-black uppercase text-white">
              <span className="h-1 w-1 animate-pulse rounded-full bg-white" /> Ao vivo
            </span>
          )}
          {ch.is_official && <Star className="h-3 w-3 shrink-0 fill-current text-emerald-300" />}
        </p>
        <p className="truncate text-[9px] text-white/45">
          {[ch.category, ch.region].filter(Boolean).join(' · ') || (ch.kind === 'live' ? 'Transmissão' : 'WebTV')}
        </p>
      </div>
      <button
        onClick={() => { toggleMediaFavorite(ch); onFavTick(); }}
        className={cn('flex h-7 w-7 items-center justify-center rounded-lg', faved ? 'bg-pink-500/20 text-pink-400' : 'bg-white/5 text-white/40')}
        title={faved ? 'Remover dos favoritos' : 'Favoritar'}
        aria-label={faved ? 'Remover dos favoritos' : 'Favoritar'}
      >
        <Heart className={cn('h-3.5 w-3.5', faved && 'fill-current')} />
      </button>
      <button
        onClick={onPlay}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 text-white active:scale-95"
        title="Assistir"
        aria-label={`Assistir ${ch.name}`}
      >
        <Play className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── TV / LIVES ───────────────────────────────────────────────────────────────
function VideoArea({ kind, selected, onSelect }: { kind: MediaKind; selected: MediaChannel | null; onSelect: (c: MediaChannel) => void }) {
  const [channels, setChannels] = useState<MediaChannel[] | null>(null);
  const [q, setQ] = useState('');
  const [, setTick] = useState(0);
  // clique ▶ na lista = gesto explícito de assistir → sinaliza o MiniPlayer
  const [watchTick, setWatchTick] = useState(0);
  const playCh = (ch: MediaChannel) => { onSelect(ch); setWatchTick(t => t + 1); };

  useEffect(() => {
    let alive = true;
    fetchChannels(kind).then(list => { if (alive) setChannels(list); });
    return () => { alive = false; };
  }, [kind]);

  const list = useMemo(() => {
    const base = channels || [];
    const term = q.trim().toLowerCase();
    if (!term) return base;
    return base.filter(c =>
      c.name.toLowerCase().includes(term)
      || (c.category || '').toLowerCase().includes(term)
      || (c.region || '').toLowerCase().includes(term));
  }, [channels, q]);

  const official = list.filter(c => c.is_official);
  const others = list.filter(c => !c.is_official);
  const sel = selected && selected.kind === kind ? selected : null;

  return (
    <div className="space-y-2.5">
      <MultimediaMiniPlayer channel={sel || official[0] || others[0] || null} watchSignal={watchTick} />

      {/* Buscar canal */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400/80" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={kind === 'tv' ? 'Buscar TV/canal…' : 'Buscar transmissão…'}
          aria-label="Buscar canais"
          className="w-full rounded-xl border border-emerald-500/30 bg-white/[0.07] py-2 pl-9 pr-2 text-[13px] font-medium text-white outline-none transition-all placeholder:text-white/40 focus:border-emerald-400/70 focus:bg-white/[0.1]"
        />
      </div>

      {channels === null && <div className="flex justify-center py-5"><Loader2 className="h-5 w-5 animate-spin text-emerald-400" /></div>}

      {channels !== null && (
        <div className="space-y-1.5">
          {official.length > 0 && (
            <p className="flex items-center gap-1 px-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300/70">
              <Star className="h-2.5 w-2.5" /> Canal oficial
            </p>
          )}
          {official.map(ch => (
            <ChannelRow key={ch.id} ch={ch} active={sel?.id === ch.id} onPlay={() => playCh(ch)} onFavTick={() => setTick(n => n + 1)} />
          ))}
          {official.length > 0 && others.length > 0 && (
            <p className="px-0.5 pt-1 text-[9px] font-bold uppercase tracking-wider text-white/35">
              {kind === 'tv' ? 'Canais' : 'Transmissões'}
            </p>
          )}
          {others.map(ch => (
            <ChannelRow key={ch.id} ch={ch} active={sel?.id === ch.id} onPlay={() => playCh(ch)} onFavTick={() => setTick(n => n + 1)} />
          ))}
          {list.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-4 text-center">
              <p className="text-[11px] font-bold text-white/60">
                {kind === 'tv'
                  ? '📺 Nenhum canal de TV publicado ainda.'
                  : '🔴 Nenhuma transmissão ao vivo agora.'}
              </p>
              <p className="mt-0.5 text-[9px] text-white/35">
                {kind === 'tv'
                  ? 'Em breve: TV Viagg, WebTVs e canais parceiros — gerenciados pela plataforma.'
                  : 'Lives de lojistas, leilões ao vivo e eventos aparecerão aqui.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── FAVORITOS / HISTÓRICO unificados (rádio + vídeo) ─────────────────────────
function RadioRow({ st }: { st: RadioStation }) {
  const radio = useRadio();
  const active = radio.station?.stationuuid === st.stationuuid;
  const listen = async () => {
    if (active && radio.playing) { togglePlay(); return; }
    await playStation(st);
    countClick(st.stationuuid);
  };
  return (
    <div className={cn('flex items-center gap-2 rounded-xl border p-1.5',
      active ? 'border-orange-400/40 bg-orange-500/10' : 'border-white/10 bg-white/[0.03]')}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 ring-1 ring-orange-500/25 text-[13px]">📻</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-bold text-white">{st.name?.trim() || 'Rádio'}</p>
        <p className="truncate text-[9px] text-white/45">{[st.state, st.country].filter(Boolean).join(' · ') || 'Rádio online'}</p>
      </div>
      <button
        onClick={listen}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF6A00] to-[#FF9A00] text-white active:scale-95"
        title={active && radio.playing ? 'Pausar' : 'Ouvir'}
        aria-label={`${active && radio.playing ? 'Pausar' : 'Ouvir'} ${st.name || 'rádio'}`}
      >
        {active && radio.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : active && radio.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function SavedArea({ mode, onOpenChannel }: { mode: 'favs' | 'hist'; onOpenChannel: (c: MediaChannel) => void }) {
  const [, setTick] = useState(0);
  const radios = mode === 'favs' ? getRadioFavorites() : getRadioHistory();
  const medias = mode === 'favs' ? getMediaFavorites() : getMediaHistory();
  const Empty = mode === 'favs'
    ? 'Toque no ♥ em rádios, TVs ou lives para salvá-las aqui.'
    : 'O que você ouvir ou assistir aparece aqui.';
  return (
    <div className="space-y-1.5">
      {medias.length > 0 && (
        <p className="flex items-center gap-1 px-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300/70">
          <Tv className="h-2.5 w-2.5" /> TVs & Lives
        </p>
      )}
      {medias.map(ch => (
        <ChannelRow key={ch.id} ch={ch} active={false} onPlay={() => onOpenChannel(ch)} onFavTick={() => setTick(n => n + 1)} />
      ))}
      {radios.length > 0 && (
        <p className="flex items-center gap-1 px-0.5 pt-1 text-[9px] font-bold uppercase tracking-wider text-orange-300/70">
          <RadioTower className="h-2.5 w-2.5" /> Rádios
        </p>
      )}
      {radios.map(st => <RadioRow key={st.stationuuid} st={st} />)}
      {radios.length === 0 && medias.length === 0 && (
        <p className="flex items-center justify-center gap-1.5 py-6 text-center text-[11px] text-white/35">
          {mode === 'favs' ? <Heart className="h-3.5 w-3.5" /> : <HistoryIcon className="h-3.5 w-3.5" />} {Empty}
        </p>
      )}
    </div>
  );
}

export function MultimediaTV({ mode, selected, onSelect, onOpenChannel }: Props) {
  if (mode === 'favs' || mode === 'hist') return <SavedArea mode={mode} onOpenChannel={onOpenChannel} />;
  return <VideoArea kind={mode} selected={selected} onSelect={onSelect} />;
}

export default MultimediaTV;
