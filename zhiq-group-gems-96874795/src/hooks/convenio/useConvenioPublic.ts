import { useQuery } from "@tanstack/react-query";
import { getPublicAccountability, getPublicCampaigns, getPublicDonations, getPublicMedPrevStats } from "@/services/convenio/public";

export function usePublicMedPrevStats() {
  return useQuery({ queryKey: ["convenio", "public", "stats"], queryFn: getPublicMedPrevStats, staleTime: 60 * 1000 });
}

export function usePublicCampaigns() {
  return useQuery({ queryKey: ["convenio", "public", "campaigns"], queryFn: getPublicCampaigns, staleTime: 60 * 1000 });
}

export function usePublicDonations() {
  return useQuery({ queryKey: ["convenio", "public", "donations"], queryFn: getPublicDonations, staleTime: 60 * 1000 });
}

export function usePublicAccountability() {
  return useQuery({ queryKey: ["convenio", "public", "accountability"], queryFn: getPublicAccountability, staleTime: 60 * 1000 });
}
