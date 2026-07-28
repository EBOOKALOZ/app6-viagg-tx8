/**
 * 🏰 TerritoryDominanceAgent — Orchestrator
 *
 * Controls territorial growth and dominance of neighborhoods inside cities.
 * Manages the full zone lifecycle from clustering to expansion.
 *
 * Pipeline: cluster → measure → assign → prioritize → expand
 */
import type { AgentRunResult } from "../growthAgentTypes";
import { supabase } from "@/integrations/supabase/client";
import { clusterCityIntoZones } from "./clusterCityIntoZones";
import { measureZoneStrength } from "./measureZoneStrength";
import { assignPostersToZones } from "./assignPostersToZones";
import { prioritizeCampaignsByZone } from "./prioritizeCampaignsByZone";
import { expandToNeighborZones } from "./expandToNeighborZones";
import { agentBus } from "../agentBus";

export async function runTerritoryDominanceAgent(city: string): Promise<AgentRunResult> {
  const startTime = Date.now();
  const logs: string[] = [];
  const signalsBefore = agentBus.getSignalsFor("TerritoryDominanceAgent").length;

  try {
    logs.push(`🏰 TerritoryDominanceAgent started for ${city}`);

    // 0. Get known neighborhoods from demand data
    const { data: demandData } = await (supabase.from("neighborhood_product_demand") as never)
      .select("neighborhood")
      .eq("city", city);
    const neighborhoods = [...new Set((demandData || []).map((d: Record<string, unknown>) => String(d.neighborhood)))];
    logs.push(`📍 ${neighborhoods.length} known neighborhoods`);

    // 1. Cluster city into zones
    const clusters = await clusterCityIntoZones(city, neighborhoods);
    logs.push(`🗺️ ${clusters.length} zones active`);

    // 2. Measure zone strength
    const zoneStrengths = await measureZoneStrength(city);
    logs.push(`📏 ${zoneStrengths.length} zones measured`);

    // 3. Assign posters to zones
    const assignments = assignPostersToZones(zoneStrengths);
    const totalNeeded = assignments.reduce((s, a) => s + a.postersNeeded, 0);
    logs.push(`👥 ${totalNeeded} posters needed across ${assignments.filter(a => a.postersNeeded > 0).length} zones`);

    // 4. Prioritize campaigns by zone
    const priorities = prioritizeCampaignsByZone(zoneStrengths);
    logs.push(`🎯 Campaigns prioritized for ${priorities.length} zones`);

    // 5. Expand to neighbor zones
    const expansions = await expandToNeighborZones(city, zoneStrengths);
    logs.push(`🌐 ${expansions.length} expansion targets`);

    // Count dominance levels
    const dominantCount = zoneStrengths.filter((z) => z.level === "dominant").length;
    const strongCount = zoneStrengths.filter((z) => z.level === "strong").length;

    logs.push("✅ TerritoryDominanceAgent completed");

    return {
      agent: "TerritoryDominanceAgent",
      success: true,
      signals: agentBus.getSignalsFor("TerritoryDominanceAgent").slice(signalsBefore),
      metrics: {
        neighborhoods: neighborhoods.length,
        zones: clusters.length,
        zones_measured: zoneStrengths.length,
        posters_needed: totalNeeded,
        campaigns_prioritized: priorities.length,
        expansions: expansions.length,
        dominant_zones: dominantCount,
        strong_zones: strongCount,
      },
      logs,
      duration_ms: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push(`❌ Error: ${msg}`);
    return {
      agent: "TerritoryDominanceAgent",
      success: false,
      signals: [],
      metrics: {},
      logs,
      duration_ms: Date.now() - startTime,
    };
  }
}
