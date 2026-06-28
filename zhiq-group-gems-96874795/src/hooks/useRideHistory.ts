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
  participantId: string;
  participantName: string;
  participantAvatar?: string;
  participantRating?: number;
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
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const isPassenger = role === 'passenger';
      const userColumn = isPassenger ? 'customer_id' : 'motoboy_id';
      const participantColumn = isPassenger ? 'motoboy_id' : 'customer_id';

      const { data: ridesData, error: ridesError } = await supabase
        .from('service_orders')
        .select(`
          id,
          pickup_location,
          destination,
          total_price,
          distance_km,
          status,
          completed_at,
          created_at,
          customer_id,
          motoboy_id
        `)
        .eq(userColumn, user.id)
        .eq('service_type', 'mototaxi')
        .in('status', ['completed', 'cancelled'])
        .order('created_at', { ascending: false })
        .limit(limit);

      if (ridesError) {
        console.error('[useRideHistory] Erro ao buscar corridas:', ridesError);
        setError('Erro ao carregar histórico');
        setHistory([]);
        return;
      }

      if (!ridesData || ridesData.length === 0) {
        setHistory([]);
        return;
      }

      // Buscar dados dos participantes
      const participantIds = ridesData
        .map(ride => ride[participantColumn as keyof typeof ride] as string | null)
        .filter((id): id is string => id !== null);

      const uniqueIds = [...new Set(participantIds)];

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

      const historyItems: RideHistoryItem[] = ridesData.map(ride => {
        const participantId = ride[participantColumn as keyof typeof ride] as string | null;
        const participant = participantId ? profilesMap[participantId] : null;
        const statusPt = ride.status === 'completed' ? 'finalizada' : 'cancelada';

        return {
          id: ride.id,
          origin: ride.pickup_location || '',
          destination: ride.destination || '',
          value: Number(ride.total_price) || 0,
          status: statusPt,
          completedAt: new Date(ride.completed_at || ride.created_at),
          participantId: participantId || '',
          participantName: participant?.name || (isPassenger ? 'Moto-Táxi' : 'Passageiro'),
          participantAvatar: participant?.avatar_url || undefined,
          participantRating: 4.8,
          distanceKm: ride.distance_km ? Number(ride.distance_km) : undefined,
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
