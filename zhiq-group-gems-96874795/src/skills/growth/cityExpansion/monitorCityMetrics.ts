/**
 * 🏙️ monitor_city_metrics
 * Fetches city_growth_metrics for all active cities, sorted by demand score.
 */
import { supabase } from "@/integrations/supabase/client";
import type { CityGrowthMetrics } from "../growthAgentTypes";

export async function monitorCityMetrics(): Promise<CityGrowthMetrics[]> {
  console.log("[CityExpansion] 📊 Monitoring city metrics...");

  const { data, error } = await (supabase.from("city_growth_metrics") as never)
    .select("*")
    .order("demand_score", { ascending: false });

  if (error) {
    console.error("[CityExpansion] Failed to fetch city metrics:", error);
    return [];
  }

  console.log(`[CityExpansion] Found ${data?.length || 0} cities tracked`);
  return (data || []) as CityGrowthMetrics[];
}
