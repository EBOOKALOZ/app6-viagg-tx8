/**
 * 📊 useGrowthMetrics — React Query hook for Growth Engine monitoring
 *
 * Fetches the admin_growth_overview view and exposes
 * growth data for the GrowthEngineMonitor component.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { GrowthOverviewRow } from "@/skills/growth/growthAgentTypes";
import { agentBus } from "@/skills/growth/agentBus";

export function useGrowthMetrics() {
  const { data: cities = [], isLoading, refetch } = useQuery<GrowthOverviewRow[]>({
    queryKey: ["growth-metrics"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("admin_growth_overview") as any)
        .select("*");

      if (error) {
        console.error("[useGrowthMetrics] Failed:", error);
        return [];
      }
      return (data || []) as GrowthOverviewRow[];
    },
    refetchInterval: 30_000, // Auto-refresh every 30s
  });

  // Computed stats
  const totalCities = cities.length;
  const hotCities = cities.filter((c) => c.growth_stage === "hot" || c.growth_stage === "dominant").length;
  const totalZones = cities.reduce((s, c) => s + (c.total_zones || 0), 0);
  const dominantZones = cities.reduce((s, c) => s + (c.dominant_zones || 0), 0);
  const totalDemand = cities.reduce((s, c) => s + (c.demand_score || 0), 0);
  const totalStores = cities.reduce((s, c) => s + (c.total_stores || 0), 0);

  // Agent bus stats
  const busStats = agentBus.getStats();
  const recentSignals = agentBus.getSignalLog().slice(-20).reverse();

  return {
    cities,
    isLoading,
    refetch,
    stats: {
      totalCities,
      hotCities,
      totalZones,
      dominantZones,
      totalDemand,
      totalStores,
      totalSignals: busStats.total_signals || 0,
    },
    recentSignals,
    busStats,
  };
}
