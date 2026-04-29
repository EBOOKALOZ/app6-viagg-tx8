import { supabase } from "@/integrations/supabase/client";

/**
 * Interface para metadados flexíveis de tracking
 */
export interface TrackingMetadata {
  [key: string]: any;
}

/**
 * TTLs recomendados em milissegundos
 */
export const TRACKING_TTL = {
  STORE_VISIT: 20 * 60 * 1000,    // 20 minutos
  PRODUCT_VISIT: 20 * 60 * 1000,  // 20 minutos
  CATEGORY_VIEW: 10 * 60 * 1000,  // 10 minutos
};

/**
 * Constrói uma chave única para controle de deduplicação no sessionStorage
 */
export const buildTrackingKey = (type: string, id: string | null | undefined): string => {
  if (!id) return `v-track-${type}-global`;
  return `v-track-${type}-${id}`;
};

/**
 * Verifica se um evento foi trackeado recentemente no sessionStorage
 */
export const wasRecentlyTracked = (key: string, ttlMs: number): boolean => {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return false;
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return false;

    const timestamp = parseInt(stored, 10);
    if (isNaN(timestamp)) return false;

    const now = Date.now();
    return now - timestamp < ttlMs;
  } catch (e) {
    return false;
  }
};

/**
 * Marca um evento como trackeado agora no sessionStorage
 */
export const markTrackedNow = (key: string): void => {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    window.sessionStorage.setItem(key, Date.now().toString());
  } catch (e) {
    // Falha silenciosa
  }
};

/**
 * Helper genérico para chamadas de RPC com tratamento de erro
 */
const safeRpcTrack = async (rpcName: string, params: any) => {
  try {
    const { error } = await supabase.rpc(rpcName, params);
    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[Tracking] Error in ${rpcName}:`, error);
      }
    }
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error(`[Tracking] Exception in ${rpcName}:`, e);
    }
  }
};

/**
 * Registra uma busca no marketplace
 */
export const trackMarketplaceSearch = async (
  query: string, 
  categoryId?: string | null, 
  metadata: TrackingMetadata = {}
) => {
  if (!query || query.trim().length < 2) return;
  
  await safeRpcTrack("track_market_search", {
    p_query: query.trim(),
    p_category_id: categoryId || null,
    p_metadata: metadata
  });
};

/**
 * Registra uma visita a uma loja
 */
export const trackMarketplaceStoreVisit = async (
  storeId: string, 
  metadata: TrackingMetadata = {}
) => {
  if (!storeId) return;

  const key = buildTrackingKey("store", storeId);
  if (wasRecentlyTracked(key, TRACKING_TTL.STORE_VISIT)) return;

  await safeRpcTrack("track_store_visit", {
    p_store_id: storeId,
    p_metadata: metadata
  });

  markTrackedNow(key);
};

/**
 * Registra uma visualização de produto
 */
export const trackMarketplaceProductVisit = async (
  productId: string, 
  storeId?: string | null, 
  metadata: TrackingMetadata = {}
) => {
  if (!productId) return;

  const key = buildTrackingKey("product", productId);
  if (wasRecentlyTracked(key, TRACKING_TTL.PRODUCT_VISIT)) return;

  await safeRpcTrack("track_product_visit", {
    p_product_id: productId,
    p_store_id: storeId || null,
    p_metadata: metadata
  });

  markTrackedNow(key);
};

/**
 * Registra uma visualização de categoria
 */
export const trackMarketplaceCategoryView = async (
  categoryId: string, 
  metadata: TrackingMetadata = {}
) => {
  if (!categoryId) return;

  const key = buildTrackingKey("category", categoryId);
  if (wasRecentlyTracked(key, TRACKING_TTL.CATEGORY_VIEW)) return;

  await safeRpcTrack("track_category_view", {
    p_category_id: categoryId,
    p_metadata: metadata
  });

  markTrackedNow(key);
};
