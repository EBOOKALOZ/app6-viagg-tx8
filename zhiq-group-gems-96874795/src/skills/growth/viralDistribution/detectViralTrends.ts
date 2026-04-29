/**
 * 📡 detect_viral_trends
 * Scans for velocity changes in product_interest_events and listens for VIRAL_DETECTED signals.
 */
import { supabase } from "@/integrations/supabase/client";
import type { NeighborhoodProductDemand } from "../growthAgentTypes";

export interface ViralTrend {
  product_id: string;
  neighborhood: string;
  city: string;
  velocity_24h: number;
  demand_score: number;
  trendDirection: "rising" | "stable" | "declining";
}

export async function detectViralTrends(city: string): Promise<ViralTrend[]> {
  console.log(`[ViralDistribution] 📡 Scanning viral trends in ${city}...`);

  const { data, error } = await (supabase.from("neighborhood_product_demand") as any)
    .select("*")
    .eq("city", city)
    .gt("velocity_24h", 3)
    .order("velocity_24h", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[ViralDistribution] Failed to scan trends:", error);
    return [];
  }

  const trends: ViralTrend[] = ((data || []) as NeighborhoodProductDemand[]).map((d) => ({
    product_id: d.product_id,
    neighborhood: d.neighborhood,
    city: d.city,
    velocity_24h: d.velocity_24h,
    demand_score: d.demand_score,
    trendDirection: d.is_viral ? "rising" as const : d.velocity_24h > 0 ? "stable" as const : "declining" as const,
  }));

  console.log(`[ViralDistribution] ${trends.length} active trends found`);
  return trends;
}
