/**
 * 🔥 detect_viral_products
 * Identifies products with abnormal demand spikes (2x average in 24h).
 * Emits VIRAL_DETECTED signal to ViralDistributionAgent.
 */
import { supabase } from "@/integrations/supabase/client";
import type { NeighborhoodProductDemand } from "../growthAgentTypes";
import { GROWTH_THRESHOLDS } from "../growthAgentTypes";
import { agentBus } from "../agentBus";

export interface ViralProduct {
  product_id: string;
  neighborhood: string;
  city: string;
  velocity_24h: number;
  demand_score: number;
}

export async function detectViralProducts(city: string): Promise<ViralProduct[]> {
  console.log(`[DemandIntelligence] 🔥 Scanning for viral products in ${city}...`);

  const { data, error } = await (supabase.from("neighborhood_product_demand") as any)
    .select("*")
    .eq("city", city)
    .eq("is_viral", true)
    .order("velocity_24h", { ascending: false });

  if (error) {
    console.error("[DemandIntelligence] Failed to fetch viral products:", error);
    return [];
  }

  const viralProducts: ViralProduct[] = ((data || []) as NeighborhoodProductDemand[])
    .filter((d) => d.velocity_24h >= GROWTH_THRESHOLDS.viral.minEventsForViral)
    .map((d) => ({
      product_id: d.product_id,
      neighborhood: d.neighborhood,
      city: d.city,
      velocity_24h: d.velocity_24h,
      demand_score: d.demand_score,
    }));

  // Emit signals for each viral product
  for (const vp of viralProducts) {
    agentBus.emit("DemandIntelligenceAgent", "ViralDistributionAgent", "VIRAL_DETECTED", {
      product_id: vp.product_id,
      neighborhood: vp.neighborhood,
      city: vp.city,
      velocity_24h: vp.velocity_24h,
    });
  }

  console.log(`[DemandIntelligence] 🔥 ${viralProducts.length} viral products detected`);
  return viralProducts;
}
