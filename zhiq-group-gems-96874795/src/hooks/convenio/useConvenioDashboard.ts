import { useQuery } from "@tanstack/react-query";
import { getDashboardStats, getMonthlyEvolution } from "@/services/convenio/dashboard";

export function useConvenioDashboardStats() {
  return useQuery({
    queryKey: ["convenio", "dashboard-stats"],
    queryFn: getDashboardStats,
    staleTime: 60 * 1000,
  });
}

export function useConvenioMonthlyEvolution() {
  return useQuery({
    queryKey: ["convenio", "monthly-evolution"],
    queryFn: () => getMonthlyEvolution(6),
    staleTime: 60 * 1000,
  });
}
