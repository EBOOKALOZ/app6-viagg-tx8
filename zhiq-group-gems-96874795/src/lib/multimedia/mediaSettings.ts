/**
 * mediaSettings.ts — ORION-MEDIA-02: configurações do Centro Multimídia.
 *
 * Fonte: tabela media_center_settings (singleton; público lê, admin escreve).
 * Sem migration aplicada / offline → degrada para os DEFAULTS sem quebrar.
 * Cache em memória com TTL curto (o player consulta a cada abertura).
 */
import { supabase } from '@/integrations/supabase/client';

export interface MediaCenterSettings {
  tv_enabled: boolean;         // Habilitar modo TV
  tv_autoplay: boolean;        // Reprodução automática (troca de música mantém a TV)
  tv_official_only: boolean;   // Mostrar apenas vídeos oficiais
  tv_allow_lyric: boolean;     // Permitir lyric videos
  tv_allow_live: boolean;      // Permitir apresentações ao vivo
  tv_auto_quality: boolean;    // Qualidade automática
  tv_max_resolution: 'auto' | '360' | '480' | '720' | '1080'; // Limitar resolução
}

export const DEFAULT_MEDIA_SETTINGS: MediaCenterSettings = {
  tv_enabled: true,
  tv_autoplay: true,
  tv_official_only: false,
  tv_allow_lyric: true,
  tv_allow_live: true,
  tv_auto_quality: true,
  tv_max_resolution: 'auto',
};

const TTL_MS = 5 * 60 * 1000;
let cache: { value: MediaCenterSettings; ts: number } | null = null;
let inflight: Promise<MediaCenterSettings> | null = null;

export async function fetchMediaSettings(force = false): Promise<MediaCenterSettings> {
  if (!force && cache && Date.now() - cache.ts < TTL_MS) return cache.value;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await (supabase.from('media_center_settings') as any)
        .select('*').eq('id', true).maybeSingle();
      if (error || !data) return DEFAULT_MEDIA_SETTINGS;
      const v: MediaCenterSettings = {
        tv_enabled: data.tv_enabled !== false,
        tv_autoplay: data.tv_autoplay !== false,
        tv_official_only: data.tv_official_only === true,
        tv_allow_lyric: data.tv_allow_lyric !== false,
        tv_allow_live: data.tv_allow_live !== false,
        tv_auto_quality: data.tv_auto_quality !== false,
        tv_max_resolution: (['auto', '360', '480', '720', '1080'] as const)
          .includes(data.tv_max_resolution) ? data.tv_max_resolution : 'auto',
      };
      cache = { value: v, ts: Date.now() };
      return v;
    } catch {
      return DEFAULT_MEDIA_SETTINGS;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Admin: grava e invalida o cache local (RLS garante is_admin no banco). */
export async function saveMediaSettings(patch: Partial<MediaCenterSettings>): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await (supabase.from('media_center_settings') as any)
      .upsert({ id: true, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) return { ok: false, error: error.message };
    cache = null; // próxima leitura busca do banco
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
