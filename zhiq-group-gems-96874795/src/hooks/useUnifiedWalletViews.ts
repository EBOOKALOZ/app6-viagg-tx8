import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfDay, startOfWeek, startOfMonth, isAfter } from 'date-fns';

export interface WalletOverview {
    available_balance: number;
    processing_balance: number;
    total_balance: number;
}

export interface WalletStatement {
    id: string; // fallback if needed, views might not have id
    created_at: string;
    profile_type: string;
    source_type: string;
    direction: string;
    amount_cents: number;
    currency: string;
    source_id: string;
}

export interface WalletPayout {
    id: string; // fallback if needed
    created_at: string;
    amount_cents: number;
    status: string;
    pix_key: string;
}

// Mapeia o activeProfile (interno) para o label do filtro (exibição)
const PROFILE_TO_FILTER: Record<string, string> = {
    motoboy:   'Motoboy',
    mototaxi:  'Motoboy',   // mototaxi usa o mesmo profile_type que motoboy no ledger
    driver:    'Motorista',
    merchant:  'Lojista',
    freteiro:  'Frete',
    passenger: 'Passageiro',
};

export function useUnifiedWalletViews() {
    const { user, activeProfile } = useAuth();

    const [overview, setOverview] = useState<WalletOverview | null>(null);
    const [statement, setStatement] = useState<WalletStatement[]>([]);
    const [payouts, setPayouts] = useState<WalletPayout[]>([]);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filtra automaticamente pelo perfil ativo; usuário pode trocar manualmente
    const defaultFilter = PROFILE_TO_FILTER[activeProfile || ''] || 'Todos';
    const [filterProfile, setFilterProfile] = useState<string>(defaultFilter);

    // Sincroniza filtro quando o perfil ativo muda (ex: troca de perfil)
    useEffect(() => {
        const mapped = PROFILE_TO_FILTER[activeProfile || ''] || 'Todos';
        setFilterProfile(mapped);
    }, [activeProfile]);

    const fetchWalletData = useCallback(async () => {
        if (!user?.id) return;
        setIsLoading(true);
        setError(null);

        try {
            // 1. Fetch Overview
            const { data: overviewData, error: overviewErr } = await supabase
                .from('v_wallet_overview')
                .select('*')
                .single();

            if (overviewData) {
                setOverview(overviewData as WalletOverview);
            } else if (overviewErr && overviewErr.code !== 'PGRST116') {
                throw overviewErr;
            } else {
                // Empty state fallback
                setOverview({
                    available_balance: 0,
                    processing_balance: 0,
                    total_balance: 0
                });
            }

            // 2. Fetch Statement
            let statementQuery = supabase
                .from('v_wallet_statement')
                .select('*')
                .order('created_at', { ascending: false });

            if (filterProfile !== 'Todos') {
                const profileMap: Record<string, string> = {
                    'Motoboy': 'motoboy',
                    'Lojista': 'merchant',
                    'Motorista': 'driver',
                    'Frete': 'freight', // Or whatever your freteiro string is
                    'Passageiro': 'passenger'
                };
                const mappedProfile = profileMap[filterProfile];
                if (mappedProfile) {
                    statementQuery = statementQuery.eq('profile_type', mappedProfile);
                }
            }

            const { data: statementData, error: statementErr } = await statementQuery;
            if (statementErr) throw statementErr;
            setStatement((statementData as WalletStatement[]) || []);

            // 3. Fetch Payout History
            const { data: payoutData, error: payoutErr } = await supabase
                .from('v_wallet_payout_history')
                .select('*')
                .order('created_at', { ascending: false });

            if (payoutErr) throw payoutErr;
            setPayouts((payoutData as WalletPayout[]) || []);

        } catch (err: any) {
            console.error('[useUnifiedWalletViews] Error:', err);
            setError(err.message || 'Erro ao carregar dados da carteira');
        } finally {
            setIsLoading(false);
        }
    }, [user?.id, filterProfile]);

    // Derived metrics from the UNFILTERED statement (or filtered, but usually you want global earnings)
    // Since we fetch the statement based on filter, the metrics will update based on the filter.
    // If you want global metrics regardless of filter, we'd need a separate fetch. For now, calculating from fetched statement.
    const today = startOfDay(new Date());
    const thisWeek = startOfWeek(new Date(), { weekStartsOn: 1 }); // Assuming Monday starts
    const thisMonth = startOfMonth(new Date());

    const earningsToday = statement
        .filter(s => s.direction === 'credit' && isAfter(new Date(s.created_at), today))
        .reduce((sum, s) => sum + s.amount_cents, 0);

    const earningsWeek = statement
        .filter(s => s.direction === 'credit' && isAfter(new Date(s.created_at), thisWeek))
        .reduce((sum, s) => sum + s.amount_cents, 0);

    const earningsMonth = statement
        .filter(s => s.direction === 'credit' && isAfter(new Date(s.created_at), thisMonth))
        .reduce((sum, s) => sum + s.amount_cents, 0);

    return {
        overview,
        statement,
        payouts,
        isLoading,
        error,
        filterProfile,
        setFilterProfile,
        fetchWalletData,
        metrics: {
            earningsToday,
            earningsWeek,
            earningsMonth
        }
    };
}
