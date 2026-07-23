import { supabase } from "@/integrations/supabase/client";

/**
 * travelMedia — resolução ÚNICA de URL de mídia do módulo Viagens.
 *
 * Bucket oficial: 'travel-public' (criado/policiado em
 * 20260723_travel_storage_bucket_oficial.sql). O upload já ia para
 * ele via moderate-image; a leitura resolvia (errado) no bucket de
 * imóveis — este helper elimina a inconsistência.
 *
 * Para mídia antiga que porventura tenha sido gravada no bucket
 * legado, use getTravelMediaFallbackUrl no onError do <img>
 * (mesmo padrão de src/lib/real-estate/mediaUtils.ts).
 */

const OFFICIAL_BUCKET = "travel-public";
const LEGACY_BUCKET = "real-estate-original";

export function getTravelMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return supabase.storage.from(OFFICIAL_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** URL alternativa no bucket legado — para onError de <img>. */
export function getTravelMediaFallbackUrl(currentUrl: string | null | undefined): string | undefined {
  if (!currentUrl || !currentUrl.includes(`/${OFFICIAL_BUCKET}/`)) return undefined;
  return currentUrl.replace(`/${OFFICIAL_BUCKET}/`, `/${LEGACY_BUCKET}/`).split("?")[0];
}

/**
 * Escolhe o caminho exibível de uma linha de travel_media
 * (mascarada quando existir, original caso contrário) e resolve a URL.
 */
export function resolveTravelMediaRow(row: {
  original_storage_path?: string | null;
  public_masked_storage_path?: string | null;
}): string | null {
  const p = row.public_masked_storage_path || row.original_storage_path;
  return getTravelMediaUrl(p);
}

/** Handler pronto para <img onError>: tenta o bucket legado uma única vez. */
export function travelImgFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.dataset.fallbackTried === "1") { img.style.display = "none"; return; }
  const fb = getTravelMediaFallbackUrl(img.src);
  img.dataset.fallbackTried = "1";
  if (fb) img.src = fb; else img.style.display = "none";
}
