import { supabase } from "@/integrations/supabase/client";

/**
 * travelMedia — resolução ÚNICA de URL de mídia do módulo Viagens.
 *
 * RESILIÊNCIA DE BUCKET (correção do P0 "galeria vazia"):
 * a mídia de viagens pode fisicamente estar em mais de um bucket dependendo
 * de quando foi enviada e de qual migration de storage já foi aplicada:
 *   • 'travel-public'        — bucket oficial (20260723_travel_storage_bucket).
 *   • 'real-estate-public'   — bucket público provisionado desde 2026-03,
 *                              usado como destino operacional enquanto o
 *                              travel-public não estiver criado em produção.
 *   • 'real-estate-original' — bucket legado (mídia antiga de viagens).
 * Como `getPublicUrl` NUNCA falha (retorna URL mesmo p/ bucket inexistente),
 * a leitura não pode depender de um único bucket: resolvemos no primário e o
 * <img onError> percorre a cadeia de fallback até uma URL que carregue.
 *
 * UPLOAD_BUCKET é o destino dos novos uploads. Enquanto a migration do
 * travel-public não roda em produção, apontamos para 'real-estate-public'
 * (que já existe e é público) — assim novos anúncios exibem foto na hora.
 * Ao aplicar a migration, basta trocar para 'travel-public'.
 */

/** Bucket de destino dos NOVOS uploads (deve existir em produção). */
export const TRAVEL_UPLOAD_BUCKET = "real-estate-public";

/** Bucket primário de LEITURA (onde o UPLOAD_BUCKET grava). */
const PRIMARY_READ_BUCKET = TRAVEL_UPLOAD_BUCKET;

/** Cadeia de buckets candidatos, em ordem de tentativa na leitura. */
const READ_BUCKETS = [
  "real-estate-public",
  "travel-public",
  "real-estate-original",
] as const;

/** Extrai o caminho relativo (sem host/bucket) de uma URL pública do storage. */
function extractObjectPath(url: string): string | null {
  const marker = "/storage/v1/object/public/";
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const rest = url.slice(i + marker.length).split("?")[0]; // <bucket>/<path...>
  const slash = rest.indexOf("/");
  return slash === -1 ? null : rest.slice(slash + 1);
}

/** URL pública de um path num bucket específico. */
function urlIn(bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export function getTravelMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return urlIn(PRIMARY_READ_BUCKET, path);
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

/**
 * Handler de <img onError>: percorre a cadeia de buckets candidatos até uma
 * URL que carregue; esconde a imagem só depois de esgotar todos. Idempotente
 * por elemento (guarda o índice já tentado em data-bucket-idx).
 */
export function travelImgFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const path = extractObjectPath(img.src);
  if (!path) { img.style.display = "none"; return; }

  const tried = Number(img.dataset.bucketIdx ?? "0");
  const currentBucket = READ_BUCKETS.find((b) => img.src.includes(`/${b}/`));
  const startFrom = currentBucket ? READ_BUCKETS.indexOf(currentBucket) + 1 : 0;
  const nextIdx = Math.max(tried + 1, startFrom);

  if (nextIdx >= READ_BUCKETS.length) { img.style.display = "none"; return; }
  img.dataset.bucketIdx = String(nextIdx);
  img.src = urlIn(READ_BUCKETS[nextIdx], path);
}
