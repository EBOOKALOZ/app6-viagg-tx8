/**
 * 🎯 prioritize_campaigns_by_zone
 * Reorders campaign queue by zone dominance — weak zones get more campaigns to catch up.
 */
import type { ZoneStrength } from "./measureZoneStrength";

export interface ZoneCampaignPriority {
  zone_id: string;
  zone_name: string;
  level: string;
  campaignMultiplier: number;
  priorityRank: number;
}

export function prioritizeCampaignsByZone(zones: ZoneStrength[]): ZoneCampaignPriority[] {
  console.log(`[TerritoryDominance] 🎯 Prioritizing campaigns by zone...`);

  // Weak zones get more campaigns to accelerate growth
  const MULTIPLIERS: Record<string, number> = {
    weak: 2.5,
    emerging: 2.0,
    growing: 1.5,
    strong: 1.0,
    dominant: 0.8, // already strong, less investment needed
  };

  const priorities: ZoneCampaignPriority[] = zones
    .map((z, idx) => ({
      zone_id: z.zone_id,
      zone_name: z.zone_name,
      level: z.level,
      campaignMultiplier: MULTIPLIERS[z.level] || 1.0,
      priorityRank: idx + 1,
    }))
    .sort((a, b) => b.campaignMultiplier - a.campaignMultiplier);

  // Re-rank after sort
  priorities.forEach((p, i) => { p.priorityRank = i + 1; });

  console.log(`[TerritoryDominance] 🎯 ${priorities.length} zones prioritized`);
  return priorities;
}
