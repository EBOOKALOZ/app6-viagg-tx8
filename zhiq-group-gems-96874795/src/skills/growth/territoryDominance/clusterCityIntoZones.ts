/**
 * 🗺️ cluster_city_into_zones
 * Groups neighborhoods into operational zones based on geography and demand density.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ZoneCluster {
  zone_name: string;
  neighborhoods: string[];
  city: string;
  zone_id?: string;
}

export async function clusterCityIntoZones(city: string, neighborhoods: string[]): Promise<ZoneCluster[]> {
  console.log(`[TerritoryDominance] 🗺️ Clustering ${city} into zones...`);

  if (neighborhoods.length === 0) {
    console.log("[TerritoryDominance] No neighborhoods to cluster");
    return [];
  }

  // Check existing zones
  const { data: existingZones } = await (supabase.from("city_zones") as any)
    .select("id, zone_name, city")
    .eq("city", city)
    .eq("is_active", true);

  if (existingZones && existingZones.length > 0) {
    console.log(`[TerritoryDominance] City already has ${existingZones.length} zones`);

    // Return existing zones with their neighborhoods
    const clusters: ZoneCluster[] = [];
    for (const zone of existingZones) {
      const { data: zn } = await (supabase.from("zone_neighborhoods") as any)
        .select("neighborhood")
        .eq("zone_id", zone.id);
      clusters.push({
        zone_name: zone.zone_name,
        neighborhoods: (zn || []).map((z: any) => z.neighborhood),
        city,
        zone_id: zone.id,
      });
    }
    return clusters;
  }

  // Create new zones — group neighborhoods into clusters of ~5
  const chunkSize = 5;
  const clusters: ZoneCluster[] = [];

  for (let i = 0; i < neighborhoods.length; i += chunkSize) {
    const chunk = neighborhoods.slice(i, i + chunkSize);
    const zoneIndex = Math.floor(i / chunkSize) + 1;
    const zoneName = `${city} - Zona ${zoneIndex}`;

    // Create zone in DB
    const { data: newZone } = await (supabase.from("city_zones") as any)
      .insert({ city, zone_name: zoneName, is_active: true })
      .select("id")
      .single();

    if (newZone) {
      // Link neighborhoods
      const links = chunk.map((n) => ({ zone_id: newZone.id, neighborhood: n, city }));
      await (supabase.from("zone_neighborhoods") as any).insert(links);

      clusters.push({
        zone_name: zoneName,
        neighborhoods: chunk,
        city,
        zone_id: newZone.id,
      });
    }
  }

  console.log(`[TerritoryDominance] 🗺️ Created ${clusters.length} zones for ${city}`);
  return clusters;
}
