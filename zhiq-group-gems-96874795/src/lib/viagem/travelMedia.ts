import { supabase } from "@/integrations/supabase/client";

/**
 * travelMedia — resolução ÚNICA de URL de mídia do módulo Viagens, com
 * AUTO-DETECÇÃO do bucket oficial em runtime.
 *
 * Contexto: o bucket oficial 'travel-public' é criado pela migration
 * 20260723_travel_storage_bucket_oficial.sql. Enquanto ela não roda em
 * produção, o bucket não existe e qualquer upload/URL nele falha (404).
 * Como `getPublicUrl` NUNCA falha (devolve URL mesmo p/ bucket inexistente),
 * a leitura não pode depender de um único bucket.
 *
 * Estratégia definitiva (sem troca manual de constante):
 *  • UPLOAD: resolveTravelUploadBucket() checa 1x (cacheado) se 'travel-public'
 *    existe. Se existe → é o bucket oficial. Se não → cai em 'real-estate-public'
 *    (público, provisionado desde 2026-03). Ao aplicar a migration, o código
 *    passa a usar o oficial sozinho — nada a trocar no código.
 *  • LEITURA: <img onError> percorre a cadeia de buckets candidatos até uma
 *    URL que carregue (cobre mídia antiga e nova, em qualquer bucket).
 */

/** Bucket oficial do módulo (após a migration de storage). */
const OFFICIAL_BUCKET = "travel-public";
/** Bucket público de fallback (existe desde 2026-03). */
const FALLBACK_BUCKET = "real-estate-public";

/** Cadeia de buckets candidatos, em ordem de tentativa na leitura. */
const READ_BUCKETS = [
  "travel-public",
  "real-estate-public",
  "real-estate-original",
] as const;

/**
 * Bucket de LEITURA primário. Mantido como fallback público por padrão para
 * que a primeira renderização use um bucket garantidamente existente; o
 * onError sobe para o oficial quando aplicável.
 */
const PRIMARY_READ_BUCKET = FALLBACK_BUCKET;

/**
 * Constante de UPLOAD para compat. de imports síncronos. Prefira
 * resolveTravelUploadBucket() (assíncrona, com auto-detecção). Este valor é
 * o destino seguro-por-padrão enquanto o oficial não é confirmado.
 */
export const TRAVEL_UPLOAD_BUCKET = FALLBACK_BUCKET;

// ── Auto-detecção do bucket oficial (uma verificação, cacheada) ──────────────
let officialBucketExists: boolean | null = null;
let officialProbe: Promise<boolean> | null = null;

async function probeOfficialBucket(): Promise<boolean> {
  try {
    // getBucket é a checagem mais barata; requer bucket público ou permissão.
    const { data, error } = await supabase.storage.getBucket(OFFICIAL_BUCKET);
    if (!error && data) return true;
    // fallback: listBuckets (alguns projetos restringem getBucket ao service_role)
    const { data: list } = await supabase.storage.listBuckets();
    return !!list?.some((b) => b.id === OFFICIAL_BUCKET || b.name === OFFICIAL_BUCKET);
  } catch {
    return false;
  }
}

/**
 * Resolve o bucket oficial de UPLOAD em runtime: 'travel-public' se já existir,
 * senão 'real-estate-public'. Resultado é cacheado por sessão.
 */
export async function resolveTravelUploadBucket(): Promise<string> {
  if (officialBucketExists === true) return OFFICIAL_BUCKET;
  if (officialBucketExists === false) return FALLBACK_BUCKET;
  if (!officialProbe) officialProbe = probeOfficialBucket();
  officialBucketExists = await officialProbe;
  return officialBucketExists ? OFFICIAL_BUCKET : FALLBACK_BUCKET;
}

// ── Resolução de URL ─────────────────────────────────────────────────────────
function urlIn(bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Extrai o caminho relativo (sem host/bucket) de uma URL pública do storage. */
function extractObjectPath(url: string): string | null {
  const marker = "/storage/v1/object/public/";
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const rest = url.slice(i + marker.length).split("?")[0]; // <bucket>/<path...>
  const slash = rest.indexOf("/");
  return slash === -1 ? null : rest.slice(slash + 1);
}

export function getTravelMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  // Se a auto-detecção já confirmou o bucket oficial nesta sessão, resolve
  // direto nele (evita 1 salto de onError); senão usa o fallback seguro e o
  // onError percorre a cadeia. Dispara a sondagem em background (não bloqueia).
  if (officialBucketExists === null && !officialProbe) {
    officialProbe = probeOfficialBucket().then((v) => (officialBucketExists = v));
  }
  const bucket = officialBucketExists === true ? OFFICIAL_BUCKET : PRIMARY_READ_BUCKET;
  return urlIn(bucket, path);
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
 * URL que carregue; esconde a imagem só depois de esgotar todos.
 */
export function travelImgFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const path = extractObjectPath(img.src);
  if (!path) { img.style.display = "none"; return; }

  const tried = Number(img.dataset.bucketIdx ?? "-1");
  const currentBucket = READ_BUCKETS.find((b) => img.src.includes(`/${b}/`));
  const startFrom = currentBucket ? READ_BUCKETS.indexOf(currentBucket) + 1 : 0;
  const nextIdx = Math.max(tried + 1, startFrom);

  if (nextIdx >= READ_BUCKETS.length) { img.style.display = "none"; return; }
  img.dataset.bucketIdx = String(nextIdx);
  img.src = urlIn(READ_BUCKETS[nextIdx], path);
}
