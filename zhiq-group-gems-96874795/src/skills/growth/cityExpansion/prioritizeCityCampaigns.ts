/**
 * 🎯 prioritize_city_campaigns
 * Ranks campaigns by city heat level for the dispatch system.
 */
import type { CityGrowthMetrics, GrowthStage } from "../growthAgentTypes";

const STAGE_PRIORITY: Record<GrowthStage, number> = {
  dominant: 1,
  hot: 2,
  growing: 3,
  warming: 4,
  cold: 5,
};

export interface CampaignPriority {
  city: string;
  priority: number;
  stage: GrowthStage;
  demandScore: number;
  boostFactor: number;
}

export function prioritizeCityCampaigns(cities: CityGrowthMetrics[]): CampaignPriority[] {
  console.log("[CityExpansion] 🎯 Prioritizing campaigns by city heat...");

  return cities
    .map((city) => ({
      city: city.city,
      priority: STAGE_PRIORITY[city.growth_stage],
      stage: city.growth_stage,
      demandScore: city.demand_score,
      boostFactor: city.growth_stage === "hot" ? 2.0
        : city.growth_stage === "growing" ? 1.5
        : city.growth_stage === "warming" ? 1.2
        : 1.0,
    }))
    .sort((a, b) => a.priority - b.priority || b.demandScore - a.demandScore);
}
