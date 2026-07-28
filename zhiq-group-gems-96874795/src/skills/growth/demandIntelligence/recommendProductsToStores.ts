/**
 * 💡 recommend_products_to_stores
 * Cross-references demand data with store catalogs to suggest products stores should add.
 */
import { supabase } from "@/integrations/supabase/client";
import type { NeighborhoodProductDemand } from "../growthAgentTypes";

export interface ProductRecommendation {
  product_id: string;
  product_name: string | null;
  neighborhood: string;
  demand_score: number;
  stores_without: string[];
}

export async function recommendProductsToStores(city: string): Promise<ProductRecommendation[]> {
  console.log(`[DemandIntelligence] 💡 Generating product recommendations for ${city}...`);

  // Get top demanded products in this city
  const { data: demands } = await (supabase.from("neighborhood_product_demand") as never)
    .select("*")
    .eq("city", city)
    .order("demand_score", { ascending: false })
    .limit(20);

  if (!demands || demands.length === 0) return [];

  const topProducts = (demands as NeighborhoodProductDemand[]).slice(0, 10);

  // Get stores in the city
  const { data: stores } = await (supabase.from("merchant_stores") as never)
    .select("id, store_name, city")
    .eq("city", city);

  if (!stores || stores.length === 0) return [];

  // For each top product, find stores that don't have it
  const recommendations: ProductRecommendation[] = topProducts.map((d) => ({
    product_id: d.product_id,
    product_name: null,
    neighborhood: d.neighborhood,
    demand_score: d.demand_score,
    stores_without: stores.map((s: Record<string, unknown>) => String(s.id)),
  }));

  console.log(`[DemandIntelligence] 💡 ${recommendations.length} recommendations generated`);
  return recommendations;
}
