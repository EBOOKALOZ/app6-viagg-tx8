/**
 * travelMedia — resolveTravelMedia() é o ÚNICO resolver oficial de mídia
 * do módulo Viagens (Missão Orion 2026-07-23, arquitetura definitiva).
 *
 * Contrato: NENHUMA tela pode montar uma URL de travel_media manualmente
 * (nem via supabase.storage.from(bucket).getPublicUrl(path), nem por
 * concatenação de string). Toda leitura de mídia de viagem passa por
 * resolveTravelMedia(row) — que:
 *   1. confia exclusivamente na coluna `public_url`, gravada no banco no
 *      momento exato em que a mídia é aprovada (edge moderate-image,
 *      seja aprovação automática ou manual via approve_travel_media);
 *   2. retorna null enquanto não houver public_url — nunca "tenta
 *      adivinhar" um bucket, porque supabase.storage.getPublicUrl() NUNCA
 *      falha (devolve URL válida-na-forma mesmo para bucket/objeto
 *      inexistente), o que produzia URLs fantasma 404 silenciosas;
 *   3. não depende de nome de bucket fixo no código: o bucket é dado por
 *      `row.bucket`, escrito pelo backend no momento da aprovação.
 *
 * Por que isto substitui a geração de URL em runtime (getTravelMediaUrl /
 * a cadeia de buckets candidatos): aquele modelo assumia que qualquer
 * path aprovado estava sempre em um de N buckets conhecidos, e não tinha
 * como distinguir "aprovada, deve aparecer" de "em quarentena, o arquivo
 * está em um bucket privado que a leitura pública nunca alcança" — essa
 * ambiguidade era a causa raiz do bug de imagens que desaparecem.
 */

export interface TravelMediaRow {
  bucket?: string | null;
  storage_path?: string | null;
  public_url?: string | null;
  moderation_status?: string | null;
  sort_order?: number | null;
  /** Campos legados (pré-migration definitiva) — usados apenas para
   * detectar mídia órfã pendente de backfill, nunca para montar URL. */
  original_storage_path?: string | null;
  public_masked_storage_path?: string | null;
}

export type TravelMediaState =
  | { kind: "ready"; url: string }
  | { kind: "reviewing" }
  | { kind: "empty" };

const APPROVED_STATUSES = new Set(["approved", "approved_clean", "approved_masked", "masked"]);

/**
 * Resolver único. Retorna:
 *  - { kind: 'ready', url }   → há public_url gravada; pode renderizar.
 *  - { kind: 'reviewing' }    → existe arquivo (path legado) mas ainda sem
 *                               public_url — está em moderação/quarentena.
 *  - { kind: 'empty' }        → não há mídia nenhuma nesta linha.
 */
export function resolveTravelMedia(row: TravelMediaRow | null | undefined): TravelMediaState {
  if (!row) return { kind: "empty" };
  if (row.public_url && APPROVED_STATUSES.has(String(row.moderation_status))) {
    return { kind: "ready", url: row.public_url };
  }
  const hasLegacyPath = !!(row.storage_path || row.original_storage_path || row.public_masked_storage_path);
  if (hasLegacyPath) return { kind: "reviewing" };
  return { kind: "empty" };
}

/** Açúcar sintático para os callers que só querem a URL ou null — cobre a
 * maioria dos cards (thumbnail simples). Para exibir o estado "em análise"
 * de forma explícita na UI, use resolveTravelMedia() diretamente. */
export function resolveTravelMediaUrl(row: TravelMediaRow | null | undefined): string | null {
  const state = resolveTravelMedia(row);
  return state.kind === "ready" ? state.url : null;
}

/**
 * Dado um array de linhas de travel_media (já ordenadas por sort_order),
 * resolve o estado da CAPA (primeira mídia com qualquer estado não-vazio).
 * Usado pelos cards de listagem, que mostram só uma thumbnail por anúncio.
 */
export function resolveTravelCoverMedia(rows: TravelMediaRow[] | null | undefined): TravelMediaState {
  if (!rows || rows.length === 0) return { kind: "empty" };
  for (const row of rows) {
    const state = resolveTravelMedia(row);
    if (state.kind !== "empty") return state;
  }
  return { kind: "empty" };
}

/**
 * URL da CAPA para cards de listagem: primeira mídia APROVADA na ordem de
 * sort_order, ou null. Diferente de resolveTravelCoverMedia(), pula mídias
 * em análise — um card nunca deve ficar sem imagem só porque a mídia
 * sort_order=0 está em moderação e a sort_order=1 já foi aprovada.
 * (Bug da galeria "Mais Produtos desta Loja": o adaptador usava media[0]
 * cru, sem ordenar nem filtrar por aprovação.)
 */
export function resolveTravelCoverUrl(rows: TravelMediaRow[] | null | undefined): string | null {
  if (!rows || rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  for (const row of sorted) {
    const state = resolveTravelMedia(row);
    if (state.kind === "ready") return state.url;
  }
  return null;
}

/**
 * Handler de <img onError> — mantido por compatibilidade de defesa em
 * profundidade (ex: CDN/proxy intermitente), mas NÃO faz mais fallback
 * entre buckets: se public_url (gravada no banco) falhar ao carregar, o
 * problema é no CDN/objeto, não em "qual bucket tentar" — não há mais
 * ambiguidade de bucket a percorrer.
 */
export function travelImgFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  img.style.display = "none";
}
