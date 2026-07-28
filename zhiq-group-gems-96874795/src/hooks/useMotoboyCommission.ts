import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculateCommissionRate } from "@/lib/api";

export interface GroupDetail {
  id: string;
  group_name: string | null;
  group_link: string | null;
  city_name: string | null;
  neighborhood: string | null;
  validation_status: string;
  is_active: boolean;
  is_valid: boolean;
  valid_for_commission: boolean;
  members_count: number;
  last_posted_at: string | null;
  created_at: string;
}

export interface MotoboyCommissionData {
  commissionRate: number;
  activeGroups: number;
  validForCommission: number;
  totalGroups: number;
  pendingGroups: number;
  expiredGroups: number;
  atRiskGroups: number;
  groups: GroupDetail[];
  groupsByRegion: Record<string, { total: number; valid: number }>;
  nextTierRate: number | null;
  groupsToNextTier: number;
  isOnline: boolean;
}

const COMMISSION_TIERS = [
  { min: 0, rate: 25, name: 'Inicial' },
  { min: 1, rate: 20, name: 'Bronze' },
  { min: 2, rate: 16, name: 'Prata' },
  { min: 3, rate: 12, name: 'Ouro' },
  { min: 4, rate: 9, name: 'Elite' },
  { min: 5, rate: 6, name: 'VIP' },
];

/**
 * Hook that calculates commission rate from REAL whatsapp_groups data.
 * Also computes detailed breakdowns for the premium groups dashboard.
 *
 * 6-tier ladder (Inicial → VIP):
 *   0 groups → 25% (Inicial)
 *   1 group  → 20% (Bronze)
 *   2 groups → 16% (Prata)
 *   3 groups → 12% (Ouro)
 *   4 groups → 9%  (Elite)
 *   5+ groups → 6% (VIP)
 */
export function useMotoboyCommission(userId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['motoboy-commission', userId],
    queryFn: async (): Promise<MotoboyCommissionData> => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      // @ts-expect-error - Type definitions are missing for whatsapp_groups
      const { data: groups, error } = await supabase
        .from('whatsapp_groups')
        .select('id, group_name, group_link, city_name, neighborhood, validation_status, is_active, is_valid, valid_for_commission, members_count, last_posted_at, created_at')
        .eq('owner_user_id', userId);

      const { data: profile } = await supabase
        .from('motoboy_profiles')
        .select('is_online')
        .eq('user_id', userId)
        .maybeSingle();

      const isOnline = profile?.is_online ?? false;

      if (error) {
        console.error('[useMotoboyCommission] Error fetching groups:', error);
        throw error;
      }

      const allGroups: GroupDetail[] = (groups || []).map((g: Record<string, unknown>) => ({
        id: g.id as string,
        group_name: (g.group_name as string) || null,
        group_link: (g.group_link as string) || null,
        city_name: (g.city_name as string) || null,
        neighborhood: (g.neighborhood as string) || null,
        validation_status: (g.validation_status as string) || 'pending',
        is_active: (g.is_active as boolean) ?? false,
        is_valid: (g.is_valid as boolean) ?? false,
        valid_for_commission: (g.valid_for_commission as boolean) ?? false,
        members_count: (g.members_count as number) ?? 0,
        last_posted_at: (g.last_posted_at as string) || null,
        created_at: g.created_at as string,
      }));

      const totalGroups = allGroups.length;

      // FONTE ÚNICA: o flag valid_for_commission do banco. O trigger aplica
      // as regras oficiais (90+ membros, postagem 30d, localização, raio
      // 100km) — o antigo fallback "approved+active" ignorava essas regras
      // e fazia o painel PROMETER uma faixa que o motor não cobra
      // (mostrava 16% com 2 grupos ativos quando só 1 valia → 20%).
      const validForCommission = allGroups.filter(g => g.valid_for_commission).length;

      const activeGroups = allGroups.filter(g => g.validation_status === 'approved' && g.is_active).length;
      const pendingGroups = allGroups.filter(g => g.validation_status === 'pending').length;
      const expiredGroups = allGroups.filter(g => !g.is_active || (!g.is_valid && g.validation_status !== 'pending')).length;

      // Validade efetiva = SÓ o flag oficial do banco (mesma régua do motor)
      const isGroupEffectivelyValid = (g: GroupDetail) => g.valid_for_commission;

      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      const atRiskGroups = allGroups.filter(g =>
        g.is_active && g.validation_status === 'approved' &&
        (!g.last_posted_at || g.last_posted_at < fifteenDaysAgo)
      ).length;

      const groupsByRegion: Record<string, { total: number; valid: number }> = {};
      allGroups.forEach(g => {
        const region = g.city_name || 'Sem região';
        if (!groupsByRegion[region]) groupsByRegion[region] = { total: 0, valid: 0 };
        groupsByRegion[region].total++;
        if (isGroupEffectivelyValid(g)) groupsByRegion[region].valid++;
      });

      const commissionRate = calculateCommissionRate(validForCommission);

      const cappedValid = Math.min(validForCommission, 5);
      const nextTier = COMMISSION_TIERS.find(t => t.min > cappedValid);
      const nextTierRate = nextTier?.rate ?? null;
      const groupsToNextTier = nextTier ? nextTier.min - validForCommission : 0;

      return {
        commissionRate, activeGroups, validForCommission, totalGroups,
        pendingGroups, expiredGroups, atRiskGroups,
        groups: allGroups, groupsByRegion, nextTierRate, groupsToNextTier,
        isOnline
      };
    },
    enabled: !!userId,
    staleTime: 0,
    gcTime: 30_000,
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`commission-groups-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_groups' },
        (payload: Record<string, unknown>) => {
          console.log('[Commission Realtime] Group changed:', payload.eventType);
          queryClient.invalidateQueries({ queryKey: ['motoboy-commission', userId] });
        }
      ).subscribe();

    const profileChannel = supabase
      .channel(`motoboy-profile-status-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'motoboy_profiles', filter: `user_id=eq.${userId}` },
        () => {
          console.log('[Commission Realtime] Profile status changed');
          queryClient.invalidateQueries({ queryKey: ['motoboy-commission', userId] });
        }
      ).subscribe();

    return () => { 
      supabase.removeChannel(channel); 
      supabase.removeChannel(profileChannel);
    };
  }, [userId, queryClient]);

  const toggleOnline = async () => {
    if (!userId || query.data?.isOnline === undefined) return;
    
    const newStatus = !query.data.isOnline;
    console.log('[useMotoboyCommission] Toggling online to:', newStatus);
    
    try {
      const { error } = await supabase
        .from('motoboy_profiles')
        .update({ is_online: newStatus })
        .eq('user_id', userId);

      if (error) throw error;
      
      // Optimistic update
      queryClient.setQueryData(['motoboy-commission', userId], (old: MotoboyCommissionData | undefined) => old ? ({
        ...old,
        isOnline: newStatus
      }) : undefined);
    } catch (err) {
      console.error('Error toggling online status:', err);
      throw err;
    }
  };

  return {
    ...query,
    commissionRate: query.data?.commissionRate ?? 25,
    activeGroups: query.data?.activeGroups ?? 0,
    validForCommission: query.data?.validForCommission ?? 0,
    totalGroups: query.data?.totalGroups ?? 0,
    pendingGroups: query.data?.pendingGroups ?? 0,
    expiredGroups: query.data?.expiredGroups ?? 0,
    atRiskGroups: query.data?.atRiskGroups ?? 0,
    groups: query.data?.groups ?? [],
    groupsByRegion: query.data?.groupsByRegion ?? {},
    nextTierRate: query.data?.nextTierRate ?? null,
    groupsToNextTier: query.data?.groupsToNextTier ?? 0,
    isOnline: query.data?.isOnline ?? false,
    toggleOnline,
  };
}
