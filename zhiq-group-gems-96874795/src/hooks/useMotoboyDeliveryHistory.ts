import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type DeliveryStatus = 'delivered' | 'cancelled'; // Motoboys only have delivered/cancelled in their final history
export type TimeFilter = 'hoje' | '7_dias' | '30_dias';

export interface MotoboyDeliveryRecord {
    id: string;
    pickup_address: string;
    drop_address: string;
    price: number;
    distance_km: number;
    status: string;
    created_at: string;
}

export function useMotoboyDeliveryHistory() {
    const { user } = useAuth();
    const [deliveries, setDeliveries] = useState<MotoboyDeliveryRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<TimeFilter>('hoje');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    const fetchHistory = useCallback(async () => {
        if (!user?.id) return;
        setIsLoading(true);

        try {
            // Build the date range
            const now = new Date();
            const startDate = new Date();
            startDate.setHours(0, 0, 0, 0);

            if (filter === '7_dias') {
                startDate.setDate(now.getDate() - 7);
            } else if (filter === '30_dias') {
                startDate.setDate(now.getDate() - 30);
            }

            // Fonte da verdade = pay_* (ledger de motoboy_earning), NÃO a
            // tabela legada delivery_orders (que ficava vazia: entregas reais
            // vivem em service_orders e o dinheiro em pay_ledger_entries).
            // RPC SECURITY DEFINER resolve a carteira pay_* por auth.uid().
            const { data, error } = await supabase.rpc(
                'get_my_motoboy_delivery_history',
                { p_since: startDate.toISOString() },
            );

            if (error) throw error;

            setDeliveries((data as MotoboyDeliveryRecord[]) || []);
        } catch (error) {
            console.error("Error fetching motoboy history:", error);
        } finally {
            setIsLoading(false);
        }
    }, [user?.id, filter]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    // Derived Metrics
    const metrics = useMemo(() => {
        let totalCorridas = 0;
        let totalGanhos = 0;
        let totalKm = 0;

        // Calculate only delivered rides for earnings
        deliveries.forEach(d => {
            if (d.status === 'delivered') {
                totalCorridas++;
                totalGanhos += (Number(d.price) || 0);
                totalKm += (Number(d.distance_km) || 0);
            }
        });

        return {
            totalCorridas,
            totalGanhos,
            totalKm: totalKm.toFixed(1)
        };
    }, [deliveries]);

    // Pagination
    const paginatedDeliveries = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return deliveries.slice(start, start + ITEMS_PER_PAGE);
    }, [deliveries, currentPage]);

    const totalPages = Math.ceil(deliveries.length / ITEMS_PER_PAGE);

    return {
        deliveries: paginatedDeliveries,
        allDeliveriesLength: deliveries.length,
        metrics,
        filter,
        setFilter: (f: TimeFilter) => { setFilter(f); setCurrentPage(1); },
        isLoading,
        currentPage,
        totalPages,
        setCurrentPage,
        refetch: fetchHistory
    };
}
