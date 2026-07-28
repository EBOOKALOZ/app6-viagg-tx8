import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const DRIVER_COMMISSION_TIERS = [
  { min: 0, rate: 25 },
  { min: 1, rate: 18 },
  { min: 2, rate: 11 },
  { min: 3, rate: 6 },
];

function calcDriverCommission(activeGroups: number): number {
  const tier = [...DRIVER_COMMISSION_TIERS].reverse().find(t => activeGroups >= t.min);
  return tier?.rate ?? 25;
}

export interface DriverCommissionData {
  commissionRate: number;
  activeGroups: number;
  totalGroups: number;
  nextTierRate: number | null;
  groupsToNextTier: number;
  isOnline: boolean;
}

export function useDriverCommission(userId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['driver-commission', userId],
    queryFn: async (): Promise<DriverCommissionData> => {
      if (!userId) throw new Error('User ID is required');

      const [{ data: groups }, { data: profile }] = await Promise.all([
        // @ts-expect-error - ignore
        supabase
          .from('driver_whatsapp_groups')
          .select('id, status')
          .eq('user_id', userId),
        supabase
          .from('driver_profiles')
          .select('is_online')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      const allGroups: { status: string }[] = (groups as { status: string }[]) || [];
      const activeGroups = allGroups.filter(g => g.status === 'ativo').length;
      const totalGroups = allGroups.length;
      const commissionRate = calcDriverCommission(activeGroups);
      const isOnline = profile?.is_online ?? false;

      const nextTier = DRIVER_COMMISSION_TIERS.find(t => t.min > activeGroups);
      const nextTierRate = nextTier?.rate ?? null;
      const groupsToNextTier = nextTier ? nextTier.min - activeGroups : 0;

      return { commissionRate, activeGroups, totalGroups, nextTierRate, groupsToNextTier, isOnline };
    },
    enabled: !!userId,
    staleTime: 0,
    gcTime: 30_000,
  });

  useEffect(() => {
    if (!userId) return;
    const ch1 = supabase
      .channel(`driver-groups-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_whatsapp_groups' }, () => {
        queryClient.invalidateQueries({ queryKey: ['driver-commission', userId] });
      }).subscribe();

    const ch2 = supabase
      .channel(`driver-profile-status-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_profiles', filter: `user_id=eq.${userId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['driver-commission', userId] });
      }).subscribe();

    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [userId, queryClient]);

  const toggleOnline = async () => {
    if (!userId) return;
    const newStatus = !query.data?.isOnline;
    await supabase.from('driver_profiles').update({ is_online: newStatus }).eq('user_id', userId);
    queryClient.setQueryData<DriverCommissionData>(['driver-commission', userId], (old) => old ? { ...old, isOnline: newStatus } : undefined);
  };

  return {
    commissionRate: query.data?.commissionRate ?? 25,
    activeGroups: query.data?.activeGroups ?? 0,
    totalGroups: query.data?.totalGroups ?? 0,
    nextTierRate: query.data?.nextTierRate ?? null,
    groupsToNextTier: query.data?.groupsToNextTier ?? 0,
    isOnline: query.data?.isOnline ?? false,
    isLoading: query.isLoading,
    toggleOnline,
  };
}
