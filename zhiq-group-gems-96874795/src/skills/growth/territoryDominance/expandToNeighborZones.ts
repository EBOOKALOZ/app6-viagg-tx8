/**
 * 🌐 expand_to_neighbor_zones
 * When a zone reaches dominant level, triggers expansion into adjacent zones.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ZoneStrength } from "./measureZoneStrength";
import { agentBus } from "../agentBus";

export interface ExpansionTarget {
  dominantZone: string;
  targetZoneId: string | null;
  targetZoneName: string | null;
  city: string;
  reason: string;
}

export async function expandToNeighborZones(city: string, zones: ZoneStrength[]): Promise<ExpansionTarget[]> {
  console.log(`[TerritoryDominance] 🌐 Checking expansion opportunities in ${city}...`);

  const dominantZones = zones.filter((z) => z.level === "dominant" && z.isLevelUp);
  const expansions: ExpansionTarget[] = [];

  for (const dz of dominantZones) {
    // Get neighbor zone IDs
    const { data: metrics } = await (supabase.from("zone_dominance_metrics") as never)
      .select("neighbor_zone_ids")
      .eq("zone_id", dz.zone_id)
      .single();

    const neighborIds: string[] = metrics?.neighbor_zone_ids || [];

    if (neighborIds.length > 0) {
      // Find weak neighbors to expand into
      const weakNeighbors = zones.filter(
        (z) => neighborIds.includes(z.zone_id) && (z.level === "weak" || z.level === "emerging")
      );

      for (const wn of weakNeighbors) {
        expansions.push({
          dominantZone: dz.zone_name,
          targetZoneId: wn.zone_id,
          targetZoneName: wn.zone_name,
          city,
          reason: `Zone ${dz.zone_name} became dominant, expanding to weak neighbor ${wn.zone_name}`,
        });
      }
    }

    // Always signal the expansion event
    agentBus.emit("TerritoryDominanceAgent", "CityExpansionAgent", "ZONE_DOMINANT", {
      city,
      zone_id: dz.zone_id,
      zone_name: dz.zone_name,
    });
  }

  if (expansions.length > 0) {
    agentBus.emit("TerritoryDominanceAgent", "CityExpansionAgent", "ZONE_EXPANSION", {
      city,
      expansions_count: expansions.length,
      target_zones: expansions.map((e) => e.targetZoneName),
    });
  }

  console.log(`[TerritoryDominance] 🌐 ${expansions.length} expansion targets identified`);
  return expansions;
}
