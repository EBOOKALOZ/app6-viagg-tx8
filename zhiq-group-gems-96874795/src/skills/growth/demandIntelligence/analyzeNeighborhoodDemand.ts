/**
 * 📊 analyze_neighborhood_demand
 * Queries neighborhood_product_demand to build a ranked demand map per city.
 */
import { supabase } from "@/integrations/supabase/client";
import type { NeighborhoodProductDemand } from "../growthAgentTypes";

export interface DemandMap {
  city: string;
  neighborhoods: NeighborhoodProductDemand[];
  totalDemand: number;
  topNeighborhood: string | null;
}

export async function analyzeNeighborhoodDemand(city: string): Promise<DemandMap> {
  console.log(`[DemandIntelligence] 📊 Analyzing demand for ${city}...`);

  const { data, error } = await (supabase.from("neighborhood_product_demand") as any)
    .select("*")
    .eq("city", city)
    .order("demand_score", { ascending: false });

  if (error) {
    console.error("[DemandIntelligence] Failed to fetch demand data:", error);
    return { city, neighborhoods: [], totalDemand: 0, topNeighborhood: null };
  }

  const neighborhoods = (data || []) as NeighborhoodProductDemand[];
  const totalDemand = neighborhoods.reduce((sum, n) => sum + n.demand_score, 0);

  console.log(`[DemandIntelligence] ${neighborhoods.length} neighborhoods, total demand: ${totalDemand}`);

  return {
    city,
    neighborhoods,
    totalDemand,
    topNeighborhood: neighborhoods[0]?.neighborhood || null,
  };
}
