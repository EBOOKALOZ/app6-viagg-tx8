import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface RideHistoryItem {
  id: string;
  origin: string;
  destination: string;
  value: number;
  status: 'finalizada' | 'cancelada';
  completedAt: Date;
  // Dados do outro participante
  participantId: string;
  participantName: string;
  participantAvatar?: string;
  participantRating?: number;
  // Dados da corrida
  distanceKm?: number;
  durationMinutes?: number;
}

interface UseRideHistoryOptions {
  role: 'passenger' | 'mototaxi';
  limit?: number;
}

export function useRideHistory({ role, limit = 20 }: UseRideHistoryOptions) {
  const { user } = useAuth();
  const [history, setHistory] = useState<RideHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!user?.id) {
      console.log('[useRideHistory] Sem usuário logado');
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const isPassenger = role === 'passenger';
      const userColumn = isPassenger ? 'passenger_id' : 'moto_taxi_id';

      console.log('[useRideHistory] ===== BUSCANDO HISTÓRICO =====');
      console.log('[useRideHistory] role:', role);
      console.log('[useRideHistory] userColumn:', userColumn);
      console.log('[useRideHistory] userId:', user.id);

      // Buscar corridas finalizadas ou canceladas
      const query = (supabase
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
          moto_taxi_id
        `)
        .eq(userColumn, user.id)
        .in('status', ['finalizada', 'cancelada'])
        .order('created_at', { ascending: false })
        .limit(limit) as any);

      const { data: ridesData, error: ridesError } = await query;

      console.log('[useRideHistory] ===== RESULTADO =====');
      console.log('[useRideHistory] Error:', ridesError);
      console.log('[useRideHistory] Count:', ridesData?.length);
      console.log('[useRideHistory] Data:', JSON.stringify(ridesData, null, 2));

      if (ridesError) {
        console.error('[useRideHistory] Erro ao buscar corridas:', ridesError);
        setError('Erro ao carregar histórico');
        setHistory([]);
        return;
      }

      if (!ridesData || ridesData.length === 0) {
        console.log('[useRideHistory] Nenhuma corrida encontrada para este usuário');
        setHistory([]);
        return;
      }

      // Buscar dados dos participantes (foto, nome)
      const participantIds = ridesData
        .map(ride => isPassenger ? ride.moto_taxi_id : ride.passenger_id)
        .filter((id): id is string => id !== null);

      const uniqueIds = [...new Set(participantIds)] as string[];

      let profilesMap: Record<string, { name: string; avatar_url: string | null }> = {};

      if (uniqueIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, name, avatar_url')
          .in('id', uniqueIds);

        if (profilesData) {
          profilesMap = profilesData.reduce((acc, profile) => {
            acc[profile.id] = { name: profile.name || 'Usuário', avatar_url: profile.avatar_url };
            return acc;
          }, {} as Record<string, { name: string; avatar_url: string | null }>);
        }
      }

      // Mapear para o formato de histórico
      const historyItems: RideHistoryItem[] = ridesData.map(ride => {
        const participantId = isPassenger ? ride.moto_taxi_id : ride.passenger_id;
        const participant = participantId ? profilesMap[participantId] : null;
        const completedDate = ride.status === 'finalizada' 
          ? ride.finished_at 
          : ride.canceled_at;

        return {
          id: ride.id,
          origin: ride.origin_address,
          destination: ride.destination_address,
          value: Number(ride.estimated_price) || 0,
          status: ride.status as 'finalizada' | 'cancelada',
          completedAt: new Date(completedDate || new Date()),
          participantId: participantId || '',
          participantName: participant?.name || (isPassenger ? 'Moto-Táxi' : 'Passageiro'),
          participantAvatar: participant?.avatar_url || undefined,
          participantRating: 4.8, // Placeholder - poderia vir de moto_taxi_historico
          distanceKm: ride.estimated_km ? Number(ride.estimated_km) : undefined,
          durationMinutes: ride.estimated_time_minutes || undefined,
        };
      });

      setHistory(historyItems);
    } catch (err) {
      console.error('[useRideHistory] Erro:', err);
      setError('Erro ao carregar histórico');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, role, limit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return {
    history,
    isLoading,
    error,
    refresh: fetchHistory,
  };
}
