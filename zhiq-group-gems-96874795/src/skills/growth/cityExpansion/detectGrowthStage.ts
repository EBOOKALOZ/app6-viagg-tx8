/**
 * 📈 detect_growth_stage
 * Classifies cities into growth stages and detects transitions.
 */
import { supabase } from "@/integrations/supabase/client";
import type { CityGrowthMetrics, GrowthStage } from "../growthAgentTypes";
import { GROWTH_THRESHOLDS } from "../growthAgentTypes";

export interface StageTransition {
  city: string;
  from: GrowthStage;
  to: GrowthStage;
}

export function classifyGrowthStage(metrics: CityGrowthMetrics): GrowthStage {
  const t = GROWTH_THRESHOLDS.city;
  if (metrics.demand_score >= t.dominant.minDemandScore && metrics.total_stores >= t.dominant.minStores) return "dominant";
  if (metrics.demand_score >= t.hot.minDemandScore && metrics.total_stores >= t.hot.minStores) return "hot";
  if (metrics.demand_score >= t.growing.minDemandScore && metrics.total_stores >= t.growing.minStores) return "growing";
  if (metrics.demand_score >= t.warming.minDemandScore && metrics.total_stores >= t.warming.minStores) return "warming";
  return "cold";
}

export async function detectGrowthStage(cities: CityGrowthMetrics[]): Promise<StageTransition[]> {
  console.log("[CityExpansion] 🔍 Detecting growth stages...");
  const transitions: StageTransition[] = [];

  for (const city of cities) {
    const newStage = classifyGrowthStage(city);
    if (newStage !== city.growth_stage) {
      transitions.push({ city: city.city, from: city.growth_stage, to: newStage });
      console.log(`[CityExpansion] 🔄 ${city.city}: ${city.growth_stage} → ${newStage}`);

      // Persist the new stage
      await (supabase.from("city_growth_metrics") as never)
        .update({
          growth_stage: newStage,
          previous_stage: city.growth_stage,
          stage_changed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("city", city.city);
    }
  }

  console.log(`[CityExpansion] ${transitions.length} stage transitions detected`);
  return transitions;
}
