/**
 * useAIAds — Dados de anúncios, promoções e fila de divulgação para a Central de IA.
 * Consulta todas as categorias de listing, promoted_listing_slots, posting_lots e campaign_queue.
 * Auto-refresh a cada 30s. Nunca quebra o fluxo — usa Promise.allSettled.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AIAdsListingCategory {
  total:    number;
  hoje:     number;
  recentes: unknown[];
}

export interface AIAdsData {
  listings: {
    viagens:     AIAdsListingCategory;
    veiculos:    AIAdsListingCategory;
    servicos:    AIAdsListingCategory;
    fretes:      AIAdsListingCategory;
    imoveis:     AIAdsListingCategory;
    marketplace: AIAdsListingCategory;
  };
  promoted: {
    total:         number;
    por_categoria: Record<string, number>;
    recentes: unknown[];
  };
  fila: {
    lotes_disponiveis:   number;
    lotes_claimed:       number;
    lotes_postados_hoje: number;
    lotes_cooldown:      number;
    detalhes: unknown[];
  };
  campanhas_queue: {
    pendente:    number;
    aprovado:    number;
    processando: number;
    postado:     number;
    falhou:      number;
    cancelado:   number;
    detalhes: unknown[];
  };
}

// Aliases legados
export type GLMAdsListingCategory = AIAdsListingCategory;
export type GLMAdsData            = AIAdsData;

function extractRows(result: PromiseSettledResult<unknown>): unknown[] {
  return result.status === "fulfilled" ? (result.value?.data ?? []) : [];
}

export function useAIAds() {
  return useQuery<AIAdsData>({
    queryKey: ["ai-ads-data"],
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const todayISO = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

      const [
        viagens, veiculos, servicos, fretes, imoveis, marketplace,
        promoted, lotes, campaignQueue,
      ] = await Promise.allSettled([
        (supabase.from("travel_listings") as unknown).select("id, title, city, state, created_at").order("created_at", { ascending: false }).limit(200),
        (supabase.from("vehicle_listings") as unknown).select("id, title, city, state, created_at").order("created_at", { ascending: false }).limit(200),
        (supabase.from("service_listings") as unknown).select("id, title, city, state, created_at").order("created_at", { ascending: false }).limit(200),
        (supabase.from("freight_listings") as unknown).select("id, title, city, state, created_at").order("created_at", { ascending: false }).limit(200),
        (supabase.from("real_estate_listings") as unknown).select("id, title, city, state, created_at").order("created_at", { ascending: false }).limit(200),
        (supabase.from("advertiser_listings") as unknown).select("id, title, city, created_at").order("created_at", { ascending: false }).limit(200),
        (supabase.from("promoted_listing_slots") as unknown).select("id, listing_type, listing_title, listing_city, created_at").order("created_at", { ascending: false }).limit(300),
        (supabase.from("posting_lots") as unknown).select("id, status, store_name, target_city, items_count, posted_at, created_at").order("created_at", { ascending: false }).limit(150),
        (supabase.from("campaign_queue") as unknown).select("id, title, status, created_at").order("created_at", { ascending: false }).limit(150),
      ]);

      const viagensData     = extractRows(viagens);
      const veiculosData    = extractRows(veiculos);
      const servicosData    = extractRows(servicos);
      const fretesData      = extractRows(fretes);
      const imoveisData     = extractRows(imoveis);
      const marketplaceData = extractRows(marketplace);
      const promotedData    = extractRows(promoted);
      const lotesData       = extractRows(lotes);
      const cqData          = extractRows(campaignQueue);

      const countToday = (items: unknown[]) => items.filter(i => i.created_at >= todayISO).length;
      const buildCat   = (items: unknown[]): AIAdsListingCategory => ({ total: items.length, hoje: countToday(items), recentes: items.slice(0, 5) });

      const porCategoria: Record<string, number> = {};
      promotedData.forEach((p: unknown) => {
        const cat = p.listing_type || "outros";
        porCategoria[cat] = (porCategoria[cat] || 0) + 1;
      });

      const lotePostadosHoje = lotesData.filter((l: unknown) => l.posted_at && l.posted_at >= todayISO).length;

      const cqCount = (statuses: string[]) => cqData.filter((c: unknown) => statuses.includes(c.status)).length;

      return {
        listings: {
          viagens:     buildCat(viagensData),
          veiculos:    buildCat(veiculosData),
          servicos:    buildCat(servicosData),
          fretes:      buildCat(fretesData),
          imoveis:     buildCat(imoveisData),
          marketplace: buildCat(marketplaceData),
        },
        promoted: { total: promotedData.length, por_categoria: porCategoria, recentes: promotedData.slice(0, 15) },
        fila: {
          lotes_disponiveis:   lotesData.filter((l: unknown) => l.status === "available").length,
          lotes_claimed:       lotesData.filter((l: unknown) => l.status === "claimed").length,
          lotes_postados_hoje: lotePostadosHoje,
          lotes_cooldown:      lotesData.filter((l: unknown) => l.status === "cooldown").length,
          detalhes:            lotesData.slice(0, 40),
        },
        campanhas_queue: {
          pendente:    cqCount(["pending", "queued", "scheduled"]),
          aprovado:    cqCount(["approved", "ready"]),
          processando: cqCount(["processing"]),
          postado:     cqCount(["posted", "confirmed"]),
          falhou:      cqCount(["failed"]),
          cancelado:   cqCount(["cancelled", "canceled"]),
          detalhes:    cqData.slice(0, 40),
        },
      };
    },
  });
}

/** Alias legado */
export const useGLMAds = useAIAds;
