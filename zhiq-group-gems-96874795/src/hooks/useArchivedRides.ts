import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ArchivedRide {
  id: string;
  delivery_order_id: string;
  loja_nome: string | null;
  cliente_nome: string | null;
  pickup_location: string;
  destination: string;
  valor_liquido: number;
  valor_bruto: number;
  taxa_plataforma: number;
  status: string;
  finalizada_em: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
}

type StatusFilter = 'todos' | 'finalizada' | 'cancelada';

const PAGE_SIZE = 15;

export function useArchivedRides() {
  const { user } = useAuth();
  const [rides, setRides] = useState<ArchivedRide[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchRides = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);

    try {
      // Build count query
      let countQuery = supabase
        .from('delivery_history')
        .select('*', { count: 'exact', head: true })
        .eq('motoboy_id', user.id);

      if (statusFilter !== 'todos') {
        countQuery = countQuery.eq('status', statusFilter);
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;
      setTotalCount(count ?? 0);

      // Fetch page
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let dataQuery = supabase
        .from('delivery_history')
        .select('id, delivery_order_id, loja_nome, cliente_nome, pickup_location, destination, valor_liquido, valor_bruto, taxa_plataforma, status, finalizada_em, distance_km, duration_minutes')
        .eq('motoboy_id', user.id)
        .order('finalizada_em', { ascending: false })
        .range(from, to);

      if (statusFilter !== 'todos') {
        dataQuery = dataQuery.eq('status', statusFilter);
      }

      const { data, error } = await dataQuery;
      if (error) throw error;

      setRides((data as ArchivedRide[]) || []);
    } catch (err) {
      console.error('[useArchivedRides] Error:', err);
      toast.error('Erro ao carregar corridas arquivadas');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, statusFilter, currentPage]);

  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return {
    rides,
    isLoading,
    statusFilter,
    setStatusFilter,
    currentPage,
    setCurrentPage,
    totalPages,
    totalCount,
    refetch: fetchRides,
  };
}
