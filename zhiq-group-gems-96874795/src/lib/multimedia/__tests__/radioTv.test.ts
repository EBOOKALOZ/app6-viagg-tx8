/**
 * Homologação ORION-MEDIA-02 (modo Rádio+TV) — lógica pura:
 * • parseStreamTitle: ICY StreamTitle → artista/título, filtro de vinheta/ads.
 * • normTrack/trackKey: chave canônica do cache (acentos, feat, colchetes).
 * • pickAllowedVideo: fallback oficial → lyric → live → visualizer sob as
 *   configurações do admin (só oficiais / permitir lyric / permitir live).
 */
import { describe, it, expect, vi } from 'vitest';

// supabase client não é usado pelas funções puras — mock evita exigir env/browser
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ insert: () => Promise.resolve({ error: null }) }),
    rpc: () => Promise.resolve({ data: null, error: null }),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  },
}));

import { parseStreamTitle } from '@/lib/multimedia/nowPlaying';
import {
  normTrack, trackKey, pickAllowedVideo, VIDEO_TYPE_PRIORITY, type TrackVideo, type VideoType,
} from '@/lib/multimedia/videoLookup';
import { DEFAULT_MEDIA_SETTINGS, type MediaCenterSettings } from '@/lib/multimedia/mediaSettings';

describe('parseStreamTitle (ICY → artista/título)', () => {
  it('separa "Artista - Título" (hífen padrão)', () => {
    expect(parseStreamTitle('AC/DC - Thunderstruck')).toEqual({ artist: 'AC/DC', title: 'Thunderstruck' });
  });

  it('aceita en-dash, em-dash e pipe como separadores', () => {
    expect(parseStreamTitle('Anitta – Envolver')).toEqual({ artist: 'Anitta', title: 'Envolver' });
    expect(parseStreamTitle('Skank — Vou Deixar')).toEqual({ artist: 'Skank', title: 'Vou Deixar' });
    expect(parseStreamTitle('Djavan | Oceano')).toEqual({ artist: 'Djavan', title: 'Oceano' });
  });

  it('sem separador → só título (artista vazio)', () => {
    expect(parseStreamTitle('Evidências')).toEqual({ artist: '', title: 'Evidências' });
  });

  it('preserva apóstrofos dentro do título', () => {
    expect(parseStreamTitle("Guns N' Roses - Sweet Child O' Mine"))
      .toEqual({ artist: "Guns N' Roses", title: "Sweet Child O' Mine" });
  });

  it('normaliza espaços múltiplos', () => {
    expect(parseStreamTitle('  Legião   Urbana   -   Tempo Perdido  '))
      .toEqual({ artist: 'Legião Urbana', title: 'Tempo Perdido' });
  });

  it('vinheta/publicidade/jingle NUNCA viram música', () => {
    expect(parseStreamTitle('VINHETA INSTITUCIONAL')).toBeNull();
    expect(parseStreamTitle('Publicidade - Supermercado X')).toBeNull();
    expect(parseStreamTitle('Jingle da casa')).toBeNull();
    expect(parseStreamTitle('COMERCIAL 30s')).toBeNull();
    expect(parseStreamTitle('Intervalo - voltamos já')).toBeNull();
  });

  it('URL no StreamTitle é lixo', () => {
    expect(parseStreamTitle('https://www.radioexemplo.com.br')).toBeNull();
  });

  it('apenas o nome da emissora (mesmo com acentos diferentes) ≠ música', () => {
    expect(parseStreamTitle('Radio Navegantes FM', 'Rádio Navegantes FM')).toBeNull();
    expect(parseStreamTitle('RÁDIO NAVEGANTES FM', 'Radio Navegantes FM')).toBeNull();
  });

  it('"Emissora - Programa" derruba o prefixo da emissora (não é artista)', () => {
    expect(parseStreamTitle('Jovem Pan - Prova de Amor', 'Jovem Pan'))
      .toEqual({ artist: '', title: 'Prova de Amor' });
  });

  it('curto demais/vazio é rejeitado', () => {
    expect(parseStreamTitle('')).toBeNull();
    expect(parseStreamTitle('ab')).toBeNull();
  });
});

describe('normTrack / trackKey (chave canônica do cache)', () => {
  it('remove acentos e caixa', () => {
    expect(trackKey('João Gilberto', 'Águas de Março')).toBe('joao gilberto|aguas de marco');
  });

  it('remove (feat./ft./part.) do título', () => {
    expect(normTrack('Envolver (feat. Bad Bunny)')).toBe('envolver');
    expect(normTrack('Baby Me Atende (part. Marília Mendonça)')).toBe('baby me atende');
  });

  it('remove colchetes e pontuação', () => {
    expect(normTrack('Song Title [Official Video]')).toBe('song title');
    expect(normTrack('AC/DC')).toBe('ac dc');
  });

  it('a MESMA música em grafias diferentes gera a MESMA chave (cache HIT)', () => {
    expect(trackKey('ANITTA', 'Envolver')).toBe(trackKey('anitta', 'envolver (feat. alguém)'));
  });
});

describe('pickAllowedVideo (fallback oficial → lyric → live → visualizer)', () => {
  const v = (id: string, type: VideoType): TrackVideo => ({ video_id: id, video_type: type });
  const ALL: Partial<Record<VideoType, TrackVideo>> = {
    official: v('vid-official', 'official'),
    lyric: v('vid-lyric', 'lyric'),
    live: v('vid-live', 'live'),
    visualizer: v('vid-visualizer', 'visualizer'),
  };
  const s = (patch: Partial<MediaCenterSettings> = {}): MediaCenterSettings =>
    ({ ...DEFAULT_MEDIA_SETTINGS, ...patch });

  it('ordem de prioridade da spec', () => {
    expect(VIDEO_TYPE_PRIORITY).toEqual(['official', 'lyric', 'live', 'visualizer']);
  });

  it('com tudo disponível escolhe o OFICIAL', () => {
    expect(pickAllowedVideo(ALL, s())?.video_id).toBe('vid-official');
  });

  it('sem oficial cai para lyric; sem lyric para live; sem live para visualizer', () => {
    const { official, ...semOficial } = ALL;
    expect(pickAllowedVideo(semOficial, s())?.video_id).toBe('vid-lyric');
    const { lyric, ...semLyric } = semOficial;
    expect(pickAllowedVideo(semLyric, s())?.video_id).toBe('vid-live');
    const { live, ...semLive } = semLyric;
    expect(pickAllowedVideo(semLive, s())?.video_id).toBe('vid-visualizer');
  });

  it('"apenas vídeos oficiais": ignora todo o resto', () => {
    expect(pickAllowedVideo(ALL, s({ tv_official_only: true }))?.video_id).toBe('vid-official');
    const { official, ...rest } = ALL;
    expect(pickAllowedVideo(rest, s({ tv_official_only: true }))).toBeNull();
  });

  it('lyric desabilitado pula para live', () => {
    const { official, ...rest } = ALL;
    expect(pickAllowedVideo(rest, s({ tv_allow_lyric: false }))?.video_id).toBe('vid-live');
  });

  it('live desabilitado pula para visualizer', () => {
    const { official, lyric, ...rest } = ALL;
    expect(pickAllowedVideo(rest, s({ tv_allow_live: false }))?.video_id).toBe('vid-visualizer');
  });

  it('nada disponível → null ("Vídeo indisponível para esta música.")', () => {
    expect(pickAllowedVideo({}, s())).toBeNull();
  });
});
