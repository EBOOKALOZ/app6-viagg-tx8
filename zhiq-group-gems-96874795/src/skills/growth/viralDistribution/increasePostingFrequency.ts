/**
 * ⏫ increase_posting_frequency
 * Temporarily reduces cooldown and increases campaign priority for viral products.
 */
import type { ViralTrend } from "./detectViralTrends";

export interface FrequencyBoost {
  product_id: string;
  city: string;
  neighborhood: string;
  originalCooldownDays: number;
  boostedCooldownDays: number;
  priorityBoost: number;
}

export function increasePostingFrequency(trends: ViralTrend[]): FrequencyBoost[] {
  console.log(`[ViralDistribution] ⏫ Calculating frequency boosts...`);

  const boosts: FrequencyBoost[] = trends
    .filter((t) => t.trendDirection === "rising")
    .map((t) => {
      // Calculate cooldown reduction (respect governance min of 3 days)
      const baseCooldown = 7;
      const reduction = Math.min(Math.floor(t.velocity_24h / 10), 4);
      const boostedCooldown = Math.max(baseCooldown - reduction, 3);

      return {
        product_id: t.product_id,
        city: t.city,
        neighborhood: t.neighborhood,
        originalCooldownDays: baseCooldown,
        boostedCooldownDays: boostedCooldown,
        priorityBoost: Math.min(Math.ceil(t.velocity_24h / 5), 5),
      };
    });

  console.log(`[ViralDistribution] ⏫ ${boosts.length} frequency boosts calculated`);
  return boosts;
}
