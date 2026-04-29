import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MototaxiRideHistoryItem } from '@/components/motoboy/MototaxiRideHistoryCard';

const ITEMS_PER_PAGE = 10;
const DEFAULT_COMMISSION_RATE = 15; // Taxa padrão se não houver valor salvo

interface UseMototaxiHistoryOptions {
  initialPage?: number;
}

export function useMototaxiHistory({ initialPage = 1 }: UseMototaxiHistoryOptions = {}) {
  const { user } = useAuth();
  const [history, setHistory] = useState<MototaxiRideHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalCount, setTotalCount] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const fetchHistory = useCallback(async (page: number) => {
    if (!user?.id) {
      console.log('[useMototaxiHistory] Sem usuário logado');
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('[useMototaxiHistory] Buscando histórico - página:', page);

      // Primeiro, buscar contagem total e total de ganhos
      const { count, error: countError } = await (supabase
        .from('moto_taxi_corridas_legacy' as any)
        .select('*', { count: 'exact', head: true })
        .eq('moto_taxi_id', user.id)
        .in('status', ['finalizada', 'cancelada']) as any);

      if (countError) {
        console.error('[useMototaxiHistory] Erro ao contar:', countError);
        throw countError;
      }

      setTotalCount(count || 0);

      // Buscar total de ganhos líquidos (apenas finalizadas)
      const { data: earningsData, error: earningsError } = await (supabase
        .from('moto_taxi_corridas_legacy' as any)
        .select('net_amount, estimated_price, commission_rate')
        .eq('moto_taxi_id', user.id)
        .eq('status', 'finalizada') as any);

      if (earningsError) {
        console.error('[useMototaxiHistory] Erro ao buscar ganhos:', earningsError);
      } else if (earningsData) {
        // Calcular total líquido
        const total = earningsData.reduce((sum, ride) => {
          // Se net_amount já está salvo, usar ele
          if (ride.net_amount && ride.net_amount > 0) {
            return sum + Number(ride.net_amount);
          }
          // Senão, calcular com base na taxa
          const price = Number(ride.estimated_price) || 0;
          const rate = Number(ride.commission_rate) || DEFAULT_COMMISSION_RATE;
          const fee = price * (rate / 100);
          return sum + (price - fee);
        }, 0);
        setTotalEarnings(total);
      }

      // Buscar página atual de corridas com offset
      const offset = (page - 1) * ITEMS_PER_PAGE;
      
      const { data: ridesData, error: ridesError } = await (supabase
        .from('moto_taxi_corridas_legacy' as any)
        .select(`
          id,
          origin_address,
          destination_address,
          estimated_price,
          estimated_km,
          estimated_time_minutes,
          status,
          finished_at,
          canceled_at,
          created_at,
          passenger_id,
          moto_taxi_id,
          commission_rate,
          platform_fee,
          net_amount
        `)
        .eq('moto_taxi_id', user.id)
        .in('status', ['finalizada', 'cancelada'])
        .order('created_at', { ascending: false })
        .range(offset, offset + ITEMS_PER_PAGE - 1) as any);

      if (ridesError) {
        console.error('[useMototaxiHistory] Erro ao buscar corridas:', ridesError);
        setError('Erro ao carregar histórico');
        setHistory([]);
        return;
      }

      if (!ridesData || ridesData.length === 0) {
        console.log('[useMototaxiHistory] Nenhuma corrida encontrada');
        setHistory([]);
        return;
      }

      // Buscar dados dos passageiros
      const passengerIds = ridesData
        .map(ride => ride.passenger_id)
        .filter((id): id is string => id !== null);

      const uniqueIds = [...new Set(passengerIds)] as string[];

      let profilesMap: Record<string, { name: string; avatar_url: string | null }> = {};

      if (uniqueIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, name, avatar_url')
          .in('id', uniqueIds);

        if (profilesData) {
          profilesMap = profilesData.reduce((acc, profile) => {
            acc[profile.id] = { name: profile.name || 'Passageiro', avatar_url: profile.avatar_url };
            return acc;
          }, {} as Record<string, { name: string; avatar_url: string | null }>);
        }
      }

      // Mapear para o formato de histórico com dados financeiros
      const historyItems: MototaxiRideHistoryItem[] = ridesData.map(ride => {
        const participant = ride.passenger_id ? profilesMap[ride.passenger_id] : null;
        const completedDate = ride.status === 'finalizada' 
          ? ride.finished_at 
          : ride.canceled_at;
        
        const price = Number(ride.estimated_price) || 0;
        
        // Usar valores do banco se disponíveis, senão calcular
        const commissionRate = Number(ride.commission_rate) || DEFAULT_COMMISSION_RATE;
        const platformFee = Number(ride.platform_fee) || (price * commissionRate / 100);
        const netAmount = Number(ride.net_amount) || (price - platformFee);

        return {
          id: ride.id,
          origin: ride.origin_address,
          destination: ride.destination_address,
          value: price,
          status: ride.status as 'finalizada' | 'cancelada',
          completedAt: new Date(completedDate || ride.created_at),
          participantId: ride.passenger_id || '',
          participantName: participant?.name || 'Passageiro',
          participantAvatar: participant?.avatar_url || undefined,
          participantRating: 4.8, // Placeholder
          distanceKm: ride.estimated_km ? Number(ride.estimated_km) : undefined,
          durationMinutes: ride.estimated_time_minutes || undefined,
          commissionRate,
          platformFee,
          netAmount,
        };
      });

      setHistory(historyItems);
      console.log('[useMototaxiHistory] Histórico carregado:', historyItems.length, 'itens');
    } catch (err) {
      console.error('[useMototaxiHistory] Erro:', err);
      setError('Erro ao carregar histórico');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Fetch quando página muda
  useEffect(() => {
    fetchHistory(currentPage);
  }, [currentPage, fetchHistory]);

  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  }, [totalPages]);

  const refresh = useCallback(() => {
    fetchHistory(currentPage);
  }, [currentPage, fetchHistory]);

  return {
    history,
    isLoading,
    error,
    currentPage,
    totalPages,
    totalCount,
    totalEarnings,
    goToPage,
    refresh,
  };
}
