import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculateCommissionRate } from "@/lib/api";

// Commission tiers based on active groups
const COMMISSION_TIERS = [
  { groups: 0, rate: 25 },
  { groups: 1, rate: 18 },
  { groups: 2, rate: 11 },
  { groups: 3, rate: 6 },
];

export interface ExpansionMetrics {
  totalUsers: number;
  totalGroups: number;
  activeGroups: number;
  averageCommission: number;
  averageSavings: number;
  activeCities: number;
}

export interface CommissionDistribution {
  groups: number;
  rate: number;
  userCount: number;
  percentage: number;
}

export interface RegionalEngagement {
  region: string;
  city: string;
  totalUsers: number;
  avgGroupsPerUser: number;
  avgCommission: number;
  status: 'strong' | 'moderate' | 'weak';
}

export interface GroupMonitoring {
  id: string;
  profileType: string;
  status: string;
  lastValidation: string;
  postingFrequency: string;
  region: string;
  city: string;
}

export interface ExpansionSettings {
  baseCommission: number;
  minCommission: number;
  maxGroups: number;
  aggressiveExpansion: boolean;
  autoValidation: boolean;
}

export function useExpansionMetrics() {
  return useQuery({
    queryKey: ['expansion-metrics'],
    queryFn: async (): Promise<ExpansionMetrics> => {
      // Fetch total users
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Fetch motoboy groups
      const { data: motoboyGroups } = await supabase
        .from('motoboy_whatsapp_groups')
        .select('id, status');

      // Fetch merchant groups
      const { data: merchantGroups } = await supabase
        .from('merchant_whatsapp_groups')
        .select('id, status');

      // Fetch driver groups
      const { data: driverGroups } = await supabase
        .from('driver_whatsapp_groups')
        .select('id, status');

      const allGroups = [
        ...(motoboyGroups || []),
        ...(merchantGroups || []),
        ...(driverGroups || []),
      ];

      const totalGroups = allGroups.length;
      const activeGroups = allGroups.filter(g => g.status === 'active').length;

      // Fetch profiles with commission data
      const { data: profiles } = await supabase
        .from('profiles')
        .select('quantidade_grupos_ativos, cidade');

      const validProfiles = (profiles || []).filter(p => p.quantidade_grupos_ativos != null);
      const averageCommission = validProfiles.length > 0
        ? validProfiles.reduce((sum, p) => sum + calculateCommissionRate(p.quantidade_grupos_ativos || 0), 0) / validProfiles.length
        : 25;

      // Calculate average savings (25% base - average commission)
      const averageSavings = 25 - averageCommission;

      // Count unique active cities
      const uniqueCities = new Set((profiles || []).filter(p => p.cidade).map(p => p.cidade));
      const activeCities = uniqueCities.size;

      return {
        totalUsers: totalUsers || 0,
        totalGroups,
        activeGroups,
        averageCommission: Math.round(averageCommission * 100) / 100,
        averageSavings: Math.round(averageSavings * 100) / 100,
        activeCities,
      };
    },
  });
}

export function useCommissionDistribution() {
  return useQuery({
    queryKey: ['commission-distribution'],
    queryFn: async (): Promise<CommissionDistribution[]> => {
      // Fetch all motoboy profiles with their active groups count
      const { data: motoboyGroups } = await supabase
        .from('motoboy_whatsapp_groups')
        .select('user_id, status')
        .eq('status', 'active');

      // Count groups per user
      const groupCountByUser: Record<string, number> = {};
      (motoboyGroups || []).forEach(g => {
        groupCountByUser[g.user_id] = (groupCountByUser[g.user_id] || 0) + 1;
      });

      // Fetch all motoboy users
      const { data: motoboyProfiles } = await supabase
        .from('profiles')
        .select('id')
        .contains('perfis_ativos', ['motoboy']);

      const totalMotoboys = (motoboyProfiles || []).length;

      // Distribution by tier
      const distribution = COMMISSION_TIERS.map(tier => {
        let userCount = 0;
        
        if (tier.groups === 6) {
          // 6+ groups
          userCount = (motoboyProfiles || []).filter(p => 
            (groupCountByUser[p.id] || 0) >= 6
          ).length;
        } else {
          userCount = (motoboyProfiles || []).filter(p => 
            (groupCountByUser[p.id] || 0) === tier.groups
          ).length;
        }

        return {
          groups: tier.groups,
          rate: tier.rate,
          userCount,
          percentage: totalMotoboys > 0 ? Math.round((userCount / totalMotoboys) * 100) : 0,
        };
      });

      return distribution;
    },
  });
}

export function useRegionalEngagement() {
  return useQuery({
    queryKey: ['regional-engagement'],
    queryFn: async (): Promise<RegionalEngagement[]> => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, estado, cidade, quantidade_grupos_ativos');

      const { data: motoboyGroups } = await supabase
        .from('motoboy_whatsapp_groups')
        .select('user_id, status')
        .eq('status', 'active');

      // Count groups per user
      const groupCountByUser: Record<string, number> = {};
      (motoboyGroups || []).forEach(g => {
        groupCountByUser[g.user_id] = (groupCountByUser[g.user_id] || 0) + 1;
      });

      // Group by region/city
      const regionMap: Record<string, {
        users: string[];
        commissions: number[];
        groupCounts: number[];
      }> = {};

      (profiles || []).forEach(p => {
        if (!p.estado || !p.cidade) return;
        const key = `${p.estado}|${p.cidade}`;
        if (!regionMap[key]) {
          regionMap[key] = { users: [], commissions: [], groupCounts: [] };
        }
        regionMap[key].users.push(p.id);
        regionMap[key].commissions.push(calculateCommissionRate(p.quantidade_grupos_ativos || 0));
        regionMap[key].groupCounts.push(groupCountByUser[p.id] || 0);
      });

      const results: RegionalEngagement[] = Object.entries(regionMap).map(([key, data]) => {
        const [region, city] = key.split('|');
        const avgGroups = data.groupCounts.reduce((a, b) => a + b, 0) / data.groupCounts.length;
        const avgCommission = data.commissions.reduce((a, b) => a + b, 0) / data.commissions.length;

        let status: 'strong' | 'moderate' | 'weak' = 'weak';
        if (avgGroups >= 3) status = 'strong';
        else if (avgGroups >= 1) status = 'moderate';

        return {
          region,
          city,
          totalUsers: data.users.length,
          avgGroupsPerUser: Math.round(avgGroups * 100) / 100,
          avgCommission: Math.round(avgCommission * 100) / 100,
          status,
        };
      });

      return results.sort((a, b) => b.totalUsers - a.totalUsers).slice(0, 20);
    },
  });
}

export function useGroupMonitoring(filters?: {
  profileType?: string;
  status?: string;
  city?: string;
}) {
  return useQuery({
    queryKey: ['group-monitoring', filters],
    queryFn: async (): Promise<GroupMonitoring[]> => {
      // Fetch motoboy groups
      let motoboyQuery = supabase
        .from('motoboy_whatsapp_groups')
        .select('id, user_id, status, cidade, estado, updated_at');

      if (filters?.status) {
        motoboyQuery = motoboyQuery.eq('status', filters.status);
      }
      if (filters?.city) {
        motoboyQuery = motoboyQuery.ilike('cidade', `%${filters.city}%`);
      }

      const { data: motoboyGroups } = await motoboyQuery;

      // Fetch merchant groups
      let merchantQuery = supabase
        .from('merchant_whatsapp_groups')
        .select('id, user_id, status, cidade, estado, updated_at');

      if (filters?.status) {
        merchantQuery = merchantQuery.eq('status', filters.status);
      }
      if (filters?.city) {
        merchantQuery = merchantQuery.ilike('cidade', `%${filters.city}%`);
      }

      const { data: merchantGroups } = await merchantQuery;

      // Fetch group posting settings
      const { data: postingSettings } = await supabase
        .from('group_posting_settings')
        .select('group_id, posting_interval_days, last_posted_at');

      const postingMap: Record<string, { interval: number; lastPosted: string | null }> = {};
      (postingSettings || []).forEach(s => {
        postingMap[s.group_id] = { interval: s.posting_interval_days, lastPosted: s.last_posted_at };
      });

      const results: GroupMonitoring[] = [];

      // Apply profile type filter
      if (!filters?.profileType || filters.profileType === 'motoboy') {
        (motoboyGroups || []).forEach(g => {
          const posting = postingMap[g.id];
          results.push({
            id: g.id,
            profileType: 'Motoboy',
            status: g.status,
            lastValidation: g.updated_at,
            postingFrequency: posting ? `${posting.interval} dias` : 'N/A',
            region: g.estado,
            city: g.cidade,
          });
        });
      }

      if (!filters?.profileType || filters.profileType === 'merchant') {
        (merchantGroups || []).forEach(g => {
          const posting = postingMap[g.id];
          results.push({
            id: g.id,
            profileType: 'Comerciante',
            status: g.status,
            lastValidation: g.updated_at,
            postingFrequency: posting ? `${posting.interval} dias` : 'N/A',
            region: g.estado,
            city: g.cidade,
          });
        });
      }

      return results.slice(0, 100);
    },
  });
}

export function useExpansionSettings() {
  return useQuery({
    queryKey: ['expansion-settings'],
    queryFn: async (): Promise<ExpansionSettings & { id: string; updatedAt: string | null; updatedBy: string | null }> => {
      const { data, error } = await supabase
        .from('expansion_settings')
        .select('*')
        .limit(1)
        .single();

      if (error || !data) {
        return {
          id: '',
          baseCommission: 25,
          minCommission: 6,
          maxGroups: 6,
          aggressiveExpansion: false,
          autoValidation: false,
          updatedAt: null,
          updatedBy: null,
        };
      }

      return {
        id: data.id,
        baseCommission: data.base_commission_percent,
        minCommission: data.min_commission_percent,
        maxGroups: data.max_groups,
        aggressiveExpansion: data.aggressive_mode,
        autoValidation: data.auto_validation_enabled,
        updatedAt: data.updated_at,
        updatedBy: data.updated_by,
      };
    },
  });
}

export function useUpdateExpansionSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      baseCommission: number;
      minCommission: number;
      maxGroups: number;
      aggressiveExpansion: boolean;
      autoValidation: boolean;
      userId: string;
    }) => {
      const { error } = await supabase
        .from('expansion_settings')
        .update({
          base_commission_percent: params.baseCommission,
          min_commission_percent: params.minCommission,
          max_groups: params.maxGroups,
          aggressive_mode: params.aggressiveExpansion,
          auto_validation_enabled: params.autoValidation,
          updated_by: params.userId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expansion-settings'] });
    },
  });
}

export function useRecalculateCommissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('recalculate_all_user_commissions');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expansion-settings'] });
      queryClient.invalidateQueries({ queryKey: ['expansion-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['commission-distribution'] });
    },
  });
}

export function useTerritorialImpact() {
  return useQuery({
    queryKey: ['territorial-impact'],
    queryFn: async () => {
      const { data: groups } = await supabase
        .from('motoboy_whatsapp_groups')
        .select('cidade, estado, status')
        .eq('status', 'active');

      // Count groups per city
      const cityMap: Record<string, number> = {};
      (groups || []).forEach(g => {
        if (g.cidade) {
          cityMap[g.cidade] = (cityMap[g.cidade] || 0) + 1;
        }
      });

      // Convert to array and sort by count
      const cityData = Object.entries(cityMap)
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return cityData;
    },
  });
}
