import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateCommissionRate } from "@/lib/api";

export interface MotoboyWhatsAppGroup {
  id: string;
  user_id: string;
  link: string;
  cidade: string;
  estado: string;
  tipo: string;
  status: string;
  city_id: string;
  created_at: string;
  updated_at: string;
}

export interface MotoboyExpansionData {
  percentualComissaoAtual: number | null;
  quantidadeGruposAtivos: number | null;
  cidade: string | null;
  estado: string | null;
  cityId: string | null;
}

export interface MonthlySavingsData {
  savings: number;
  monthlyEarnings: number;
  currentCommission: number;
}

export interface CityRankingEntry {
  userId: string;
  nome: string;
  gruposAtivos: number;
  totalEntregas: number;
  position: number;
  isCurrentUser: boolean;
}

export interface CityEconomicRadar {
  totalMotoboys: number;
  avgGruposAtivos: number;
  avgComissao: number;
  volumeFinanceiro: number;
}

export function useMotoboyExpansionData(userId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['motoboy-expansion', userId],
    queryFn: async (): Promise<MotoboyExpansionData> => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('quantidade_grupos_ativos, cidade, estado, city_id')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching expansion data:', error);
        throw error;
      }

      const activeGroups = data?.quantidade_grupos_ativos ?? 0;

      return {
        percentualComissaoAtual: calculateCommissionRate(activeGroups),
        quantidadeGruposAtivos: activeGroups,
        cidade: data?.cidade ?? null,
        estado: data?.estado ?? null,
        cityId: data?.city_id ?? null,
      };
    },
    enabled: !!userId,
    staleTime: 0,
    gcTime: 0,
  });

  // Realtime subscription for profile changes
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`expansion-profile-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          console.log('[Expansion Realtime] Profile updated:', payload);
          queryClient.invalidateQueries({ queryKey: ['motoboy-expansion', userId] });
          queryClient.invalidateQueries({ queryKey: ['monthly-savings', userId] });
          queryClient.invalidateQueries({ queryKey: ['city-ranking'] });
          queryClient.invalidateQueries({ queryKey: ['city-radar'] });
        }
      )
      .subscribe((status) => {
        console.log('[Expansion Realtime] Profile subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return query;
}

// Hook for Monthly Savings calculation
export function useMonthlySavings(userId: string | undefined) {
  return useQuery({
    queryKey: ['monthly-savings', userId],
    queryFn: async (): Promise<MonthlySavingsData> => {
      if (!userId) throw new Error('User ID is required');

      // Get current commission
      const { data: profile } = await supabase
        .from('profiles')
        .select('quantidade_grupos_ativos')
        .eq('id', userId)
        .single();

      const currentCommission = calculateCommissionRate(profile?.quantidade_grupos_ativos ?? 0);
      const baseCommission = 25;

      // Get monthly earnings from delivery_history
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: deliveries } = await supabase
        .from('delivery_history')
        .select('valor_bruto')
        .eq('motoboy_id', userId)
        .eq('status', 'finalizada')
        .gte('finalizada_em', startOfMonth.toISOString());

      const monthlyEarnings = deliveries?.reduce((sum, d) => sum + (d.valor_bruto || 0), 0) || 0;

      // Calculate savings: (baseCommission - currentCommission) * earnings / 100
      const savings = currentCommission < baseCommission
        ? ((baseCommission - currentCommission) * monthlyEarnings) / 100
        : 0;

      return {
        savings,
        monthlyEarnings,
        currentCommission,
      };
    },
    enabled: !!userId,
    staleTime: 30000,
  });
}

// Hook for City Ranking
export function useCityRanking(userId: string | undefined, cityId: string | undefined) {
  return useQuery({
    queryKey: ['city-ranking', cityId, userId],
    queryFn: async (): Promise<CityRankingEntry[]> => {
      if (!cityId || !userId) throw new Error('City ID and User ID are required');

      // Get all motoboys in the same city with their active groups count
      type ProfileRow = { id: string; quantidade_grupos_ativos: number | null };
      const profilesResponse = await supabase
        .from('profiles')
        .select('id, quantidade_grupos_ativos')
        .eq('city_id', cityId);

      const allProfiles = (profilesResponse.data || []) as ProfileRow[];
      const cityMotoboys = allProfiles.filter((p) => true); // Already filtered by city_id
      if (cityMotoboys.length === 0) return [];

      // Get delivery counts for each motoboy this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const motoboyIds = cityMotoboys.map((m: { id: string }) => m.id);

      const { data: deliveryCounts } = await supabase
        .from('delivery_history')
        .select('motoboy_id, motoboy_nome')
        .in('motoboy_id', motoboyIds)
        .eq('status', 'finalizada')
        .gte('finalizada_em', startOfMonth.toISOString());

      // Count deliveries per motoboy and get names
      const deliveryCountMap: Record<string, number> = {};
      const nameMap: Record<string, string> = {};
      deliveryCounts?.forEach(d => {
        deliveryCountMap[d.motoboy_id] = (deliveryCountMap[d.motoboy_id] || 0) + 1;
        if (d.motoboy_nome) nameMap[d.motoboy_id] = d.motoboy_nome;
      });

      // Sort by groups desc, then deliveries desc
      const ranked = cityMotoboys
        .map((m: { id: string; quantidade_grupos_ativos: number | null }) => ({
          userId: m.id,
          nome: nameMap[m.id] || 'Motoboy',
          gruposAtivos: m.quantidade_grupos_ativos || 0,
          totalEntregas: deliveryCountMap[m.id] || 0,
          position: 0,
          isCurrentUser: m.id === userId,
        }))
        .sort((a, b) => {
          if (b.gruposAtivos !== a.gruposAtivos) return b.gruposAtivos - a.gruposAtivos;
          return b.totalEntregas - a.totalEntregas;
        })
        .map((entry, index) => ({ ...entry, position: index + 1 }));

      // Return top 10, but always include current user
      const top10 = ranked.slice(0, 10);
      const currentUserEntry = ranked.find(e => e.isCurrentUser);

      if (currentUserEntry && !top10.find(e => e.isCurrentUser)) {
        top10.push(currentUserEntry);
      }

      return top10;
    },
    enabled: !!cityId && !!userId,
    staleTime: 60000,
  });
}

// Hook for City Economic Radar
export function useCityEconomicRadar(cityId: string | undefined) {
  return useQuery({
    queryKey: ['city-radar', cityId],
    queryFn: async (): Promise<CityEconomicRadar> => {
      if (!cityId) throw new Error('City ID is required');

      // Get all motoboys in the city
      type RadarProfileRow = { id: string; quantidade_grupos_ativos: number | null };
      const radarResponse = await supabase
        .from('profiles')
        .select('id, quantidade_grupos_ativos')
        .eq('city_id', cityId);

      const cityMotoboys = (radarResponse.data || []) as RadarProfileRow[];

      const totalMotoboys = cityMotoboys?.length || 0;

      const avgGruposAtivos = totalMotoboys > 0
        ? cityMotoboys!.reduce((sum, m) => sum + (m.quantidade_grupos_ativos || 0), 0) / totalMotoboys
        : 0;

      const avgComissao = totalMotoboys > 0
        ? cityMotoboys!.reduce((sum, m) => sum + calculateCommissionRate(m.quantidade_grupos_ativos || 0), 0) / totalMotoboys
        : 25;

      // Get monthly volume
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const motoboyIds = cityMotoboys?.map(m => m.id) || [];

      const { data: deliveries } = await supabase
        .from('delivery_history')
        .select('valor_bruto')
        .in('motoboy_id', motoboyIds)
        .eq('status', 'finalizada')
        .gte('finalizada_em', startOfMonth.toISOString());

      const volumeFinanceiro = deliveries?.reduce((sum, d) => sum + (d.valor_bruto || 0), 0) || 0;

      return {
        totalMotoboys,
        avgGruposAtivos: Math.round(avgGruposAtivos * 10) / 10,
        avgComissao: Math.round(avgComissao * 10) / 10,
        volumeFinanceiro,
      };
    },
    enabled: !!cityId,
    staleTime: 60000,
  });
}

export function useMotoboyWhatsAppGroups(userId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['motoboy-whatsapp-groups', userId],
    queryFn: async (): Promise<MotoboyWhatsAppGroup[]> => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const { data, error } = await supabase
        .from('motoboy_whatsapp_groups')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching groups:', error);
        throw error;
      }

      return data || [];
    },
    enabled: !!userId,
    staleTime: 0,
    gcTime: 0,
  });

  // Realtime subscription for groups changes
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`expansion-groups-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'motoboy_whatsapp_groups',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('[Expansion Realtime] Groups updated:', payload);
          queryClient.invalidateQueries({ queryKey: ['motoboy-whatsapp-groups', userId] });
          // Also invalidate profile data as commission may change
          queryClient.invalidateQueries({ queryKey: ['motoboy-expansion', userId] });
          queryClient.invalidateQueries({ queryKey: ['motoboy-commission', userId] });
        }
      )
      .subscribe((status) => {
        console.log('[Expansion Realtime] Groups subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return query;
}

export function useAddMotoboyGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      userId: string;
      link: string;
      cidade: string;
      estado: string;
      cityId: string;
      tipo: string;
    }) => {
      const { userId, link, cidade, estado, cityId, tipo } = params;

      // Check active groups count
      const { data: activeGroups } = await supabase
        .from('motoboy_whatsapp_groups')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'ativo');

      if (activeGroups && activeGroups.length >= 3) {
        throw new Error('Você já atingiu o limite de 3 grupos ativos');
      }

      // @ts-expect-error - RPC definition missing
      const { data, error } = await supabase.rpc('try_create_motoboy_whatsapp_group', {
        p_link: link.trim(),
        p_cidade: cidade,
        p_estado: estado,
        p_city_id: cityId,
        p_tipo: tipo,
        p_user_id: userId,
      });

      if (error) {
        console.error('Error adding group:', error);
        throw error;
      }

      const result = Array.isArray(data) ? data[0] : data;
      if (result && result.created === false) {
        throw new Error('Link já utilizado. Cada grupo pode ser cadastrado apenas uma vez.');
      }
    },
    onSuccess: () => {
      toast.success('Grupo adicionado! Aguarde a validação.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao adicionar grupo');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['motoboy-whatsapp-groups'] });
      queryClient.invalidateQueries({ queryKey: ['motoboy-expansion'] });
    },
  });
}

export function useRemoveMotoboyGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { groupId: string; userId: string }) => {
      const { groupId, userId } = params;

      const { error } = await supabase
        .from('motoboy_whatsapp_groups')
        .delete()
        .eq('id', groupId)
        .eq('user_id', userId);

      if (error) {
        console.error('Error removing group:', error);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Grupo removido com sucesso');
    },
    onError: () => {
      toast.error('Erro ao remover grupo');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['motoboy-whatsapp-groups'] });
      queryClient.invalidateQueries({ queryKey: ['motoboy-expansion'] });
    },
  });
}
