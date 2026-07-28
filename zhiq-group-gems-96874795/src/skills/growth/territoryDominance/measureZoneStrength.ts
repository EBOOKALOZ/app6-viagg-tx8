/**
 * 📏 measure_zone_strength
 * Calculates zone strength metrics and updates zone_dominance_metrics.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ZoneDominanceMetrics, DominanceLevel } from "../growthAgentTypes";
import { GROWTH_THRESHOLDS } from "../growthAgentTypes";

export interface ZoneStrength {
  zone_id: string;
  zone_name: string;
  demandScore: number;
  groupCount: number;
  posterCount: number;
  level: DominanceLevel;
  previousLevel: DominanceLevel | null;
  isLevelUp: boolean;
}

export function classifyDominanceLevel(demandScore: number, groupCount: number): DominanceLevel {
  const t = GROWTH_THRESHOLDS.zone;
  if (demandScore >= t.dominant.minDemandScore && groupCount >= t.dominant.minGroups) return "dominant";
  if (demandScore >= t.strong.minDemandScore && groupCount >= t.strong.minGroups) return "strong";
  if (demandScore >= t.growing.minDemandScore && groupCount >= t.growing.minGroups) return "growing";
  if (demandScore >= t.emerging.minDemandScore) return "emerging";
  return "weak";
}

export async function measureZoneStrength(city: string): Promise<ZoneStrength[]> {
  console.log(`[TerritoryDominance] 📏 Measuring zone strength in ${city}...`);

  const { data: zones } = await (supabase.from("city_zones") as never)
    .select("id, zone_name")
    .eq("city", city)
    .eq("is_active", true);

  if (!zones || zones.length === 0) return [];

  const results: ZoneStrength[] = [];

  for (const zone of zones) {
    // Call the RPC to refresh zone metrics
    await supabase.rpc("refresh_zone_dominance", { p_zone_id: zone.id });

    // Fetch updated metrics
    const { data: metrics } = await (supabase.from("zone_dominance_metrics") as never)
      .select("*")
      .eq("zone_id", zone.id)
      .single();

    if (metrics) {
      const m = metrics as ZoneDominanceMetrics;
      const newLevel = classifyDominanceLevel(m.demand_score, m.group_count);

      results.push({
        zone_id: zone.id,
        zone_name: zone.zone_name,
        demandScore: m.demand_score,
        groupCount: m.group_count,
        posterCount: m.poster_count,
        level: newLevel,
        previousLevel: (m.previous_level as DominanceLevel) || null,
        isLevelUp: m.previous_level !== null && newLevel !== m.dominance_level,
      });
    }
  }

  console.log(`[TerritoryDominance] 📏 ${results.length} zones measured`);
  return results;
}
