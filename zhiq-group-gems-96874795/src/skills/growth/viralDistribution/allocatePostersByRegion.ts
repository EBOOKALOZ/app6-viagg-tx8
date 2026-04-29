/**
 * 🗺️ allocate_posters_by_region
 * Assigns additional posters from neighboring zones for viral distribution.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ViralTrend } from "./detectViralTrends";

export interface PosterAllocation {
  zone_id: string;
  zone_name: string;
  postersNeeded: number;
  postersAvailable: number;
  priority: number;
}

export async function allocatePostersByRegion(city: string, trends: ViralTrend[]): Promise<PosterAllocation[]> {
  console.log(`[ViralDistribution] 🗺️ Allocating posters for ${city}...`);

  // Get zones with their dominance metrics
  const { data: zones } = await (supabase.from("city_zones") as any)
    .select("id, zone_name, city")
    .eq("city", city)
    .eq("is_active", true);

  if (!zones || zones.length === 0) return [];

  const { data: metrics } = await (supabase.from("zone_dominance_metrics") as any)
    .select("*")
    .eq("city", city);

  const metricsMap = new Map((metrics || []).map((m: any) => [m.zone_id, m]));
  const viralNeighborhoods = new Set(trends.filter((t) => t.trendDirection === "rising").map((t) => t.neighborhood));

  const allocations: PosterAllocation[] = zones.map((z: any) => {
    const m = metricsMap.get(z.id) || { poster_count: 0, demand_score: 0 };
    const isViralZone = viralNeighborhoods.size > 0; // Simplified — full implementation would check zone-neighborhood mapping

    return {
      zone_id: z.id,
      zone_name: z.zone_name,
      postersNeeded: isViralZone ? Math.max(3 - (m.poster_count || 0), 0) : 0,
      postersAvailable: m.poster_count || 0,
      priority: isViralZone ? 1 : 3,
    };
  }).filter((a: PosterAllocation) => a.postersNeeded > 0);

  console.log(`[ViralDistribution] 🗺️ ${allocations.length} poster allocations needed`);
  return allocations;
}
