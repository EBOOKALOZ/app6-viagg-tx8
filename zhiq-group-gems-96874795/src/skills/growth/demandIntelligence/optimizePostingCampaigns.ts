/**
 * ⚡ optimize_posting_campaigns
 * Adjusts campaign priority based on neighborhood demand.
 * High-demand neighborhoods get higher posting frequency.
 */
import type { NeighborhoodProductDemand } from "../growthAgentTypes";
import { agentBus } from "../agentBus";

export interface CampaignOptimization {
  product_id: string;
  neighborhood: string;
  city: string;
  currentDemand: number;
  priorityBoost: number;
  recommendedFrequency: "low" | "normal" | "high" | "urgent";
}

export function optimizePostingCampaigns(demands: NeighborhoodProductDemand[]): CampaignOptimization[] {
  console.log(`[DemandIntelligence] ⚡ Optimizing posting campaigns...`);

  const optimizations: CampaignOptimization[] = demands
    .filter((d) => d.demand_score > 0)
    .map((d) => {
      let frequency: CampaignOptimization["recommendedFrequency"] = "normal";
      let priorityBoost = 0;

      if (d.is_viral || d.velocity_24h > 20) {
        frequency = "urgent";
        priorityBoost = 3;
      } else if (d.demand_score > 500) {
        frequency = "high";
        priorityBoost = 2;
      } else if (d.demand_score > 100) {
        frequency = "normal";
        priorityBoost = 1;
      } else {
        frequency = "low";
        priorityBoost = 0;
      }

      return {
        product_id: d.product_id,
        neighborhood: d.neighborhood,
        city: d.city,
        currentDemand: d.demand_score,
        priorityBoost,
        recommendedFrequency: frequency,
      };
    })
    .sort((a, b) => b.priorityBoost - a.priorityBoost);

  // Emit demand shift signal if there are significant changes
  const highPriority = optimizations.filter((o) => o.priorityBoost >= 2);
  if (highPriority.length > 0) {
    agentBus.emit("DemandIntelligenceAgent", "TerritoryDominanceAgent", "DEMAND_SHIFT", {
      city: highPriority[0].city,
      high_demand_neighborhoods: highPriority.map((o) => o.neighborhood),
      count: highPriority.length,
    });
  }

  console.log(`[DemandIntelligence] ⚡ ${optimizations.length} optimizations (${highPriority.length} high-priority)`);
  return optimizations;
}
