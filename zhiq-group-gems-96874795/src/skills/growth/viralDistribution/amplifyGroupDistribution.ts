/**
 * 📢 amplify_group_distribution
 * For viral products, expands distribution to adjacent neighborhood groups.
 */
import type { ViralTrend } from "./detectViralTrends";
import { agentBus } from "../agentBus";

export interface AmplificationPlan {
  product_id: string;
  sourceNeighborhood: string;
  targetNeighborhoods: string[];
  amplificationFactor: number;
}

export function amplifyGroupDistribution(trends: ViralTrend[]): AmplificationPlan[] {
  console.log(`[ViralDistribution] 📢 Planning group amplification...`);

  const risingTrends = trends.filter((t) => t.trendDirection === "rising");
  const plans: AmplificationPlan[] = [];

  for (const trend of risingTrends) {
    const factor = Math.min(Math.ceil(trend.velocity_24h / 5), 5);

    plans.push({
      product_id: trend.product_id,
      sourceNeighborhood: trend.neighborhood,
      targetNeighborhoods: [], // TerritoryDominanceAgent will fill adjacent neighborhoods
      amplificationFactor: factor,
    });
  }

  if (plans.length > 0) {
    agentBus.emit("ViralDistributionAgent", "TerritoryDominanceAgent", "POSTER_REALLOC", {
      city: risingTrends[0]?.city,
      products_amplified: plans.length,
      total_amplification: plans.reduce((s, p) => s + p.amplificationFactor, 0),
    });
  }

  console.log(`[ViralDistribution] 📢 ${plans.length} amplification plans created`);
  return plans;
}
