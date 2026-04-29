import { useCallback, useRef } from "react";
import { 
  trackMarketplaceSearch, 
  trackMarketplaceStoreVisit, 
  trackMarketplaceProductVisit, 
  trackMarketplaceCategoryView,
  TrackingMetadata
} from "@/lib/analytics/marketplaceTracking";

/**
 * Hook reutilizável para tracking de eventos no Marketplace
 */
export function useMarketplaceTracking() {
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSearchRef = useRef<string>("");

  /**
   * Track de Busca com Debounce (600ms - 900ms)
   */
  const trackSearch = useCallback((query: string, categoryId?: string | null, metadata?: TrackingMetadata) => {
    if (!query || query.trim().length < 2) return;
    if (query.trim() === lastSearchRef.current) return;

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      lastSearchRef.current = query.trim();
      trackMarketplaceSearch(query, categoryId, metadata);
    }, 800); // 800ms balanceado entre 600ms e 900ms
  }, []);

  /**
   * Track de Visita a Loja (Deduplicado por ref p/ evitar re-render)
   */
  const trackedStoresRef = useRef<Set<string>>(new Set());
  const trackStoreVisit = useCallback((storeId: string, metadata?: TrackingMetadata) => {
    if (!storeId || trackedStoresRef.current.has(storeId)) return;
    
    trackedStoresRef.current.add(storeId);
    trackMarketplaceStoreVisit(storeId, metadata);
  }, []);

  /**
   * Track de Visita a Produto (Deduplicado por ref p/ evitar re-render)
   */
  const trackedProductsRef = useRef<Set<string>>(new Set());
  const trackProductVisit = useCallback((productId: string, storeId?: string | null, metadata?: TrackingMetadata) => {
    if (!productId || trackedProductsRef.current.has(productId)) return;

    trackedProductsRef.current.add(productId);
    trackMarketplaceProductVisit(productId, storeId, metadata);
  }, []);

  /**
   * Track de Visualização de Categoria (Deduplicado por ref p/ evitar re-render)
   */
  const lastCategoryRef = useRef<string | null>(null);
  const trackCategoryView = useCallback((categoryId: string, metadata?: TrackingMetadata) => {
    if (!categoryId || categoryId === lastCategoryRef.current) return;

    lastCategoryRef.current = categoryId;
    trackMarketplaceCategoryView(categoryId, metadata);
  }, []);

  return {
    trackSearch,
    trackStoreVisit,
    trackProductVisit,
    trackCategoryView
  };
}
