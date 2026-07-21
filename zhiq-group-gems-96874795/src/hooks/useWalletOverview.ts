import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WalletOverview {
    balance_reais: number;
    balance_cents: number;
    total_recargas: number;
    total_gastos: number;
}

const defaultOverview: WalletOverview = {
    balance_reais: 0,
    balance_cents: 0,
    total_recargas: 0,
    total_gastos: 0
};

export function useWalletOverview() {
    const { data: overview, isLoading, refetch, error } = useQuery({
        queryKey: ['v-wallet-balance'],
        queryFn: async (): Promise<WalletOverview> => {
            try {
                console.log("SUPABASE URL:", import.meta.env.VITE_SUPABASE_URL);

                const { data: { user }, error: authError } = await supabase.auth.getUser();

                if (authError) {
                    console.error("[Wallet] Erro de autenticação:", authError);
                    return defaultOverview;
                }

                if (!user) {
                    console.log("[Wallet] Usuário não autenticado");
                    return defaultOverview;
                }

                console.log("[Wallet] Buscando dados para USER ID:", user.id);

                // 1) Puxar Contas Financeiras Oficiais do motor pay_*
                const { data: accounts, error: accountError } = await (supabase.from('pay_financial_accounts') as any)
                    .select('id, account_type, available_balance')
                    .eq('owner_id', user.id)
                    .in('account_type', [
                        'motoboy_wallet', 'mototaxi_wallet', 'driver_wallet', 'merchant_wallet', 'customer_wallet'
                    ]);

                console.log("[Wallet] Supabase Result (pay_financial_accounts):", { accounts, accountError });

                if (accountError) {
                    console.error("[Wallet] Erro ao buscar pay_financial_accounts:", accountError);
                    return defaultOverview;
                }

                const balance_reais = (accounts || []).reduce((acc: number, curr: any) => acc + Number(curr.available_balance || 0), 0);
                const balance_cents = Math.round(balance_reais * 100);

                let total_recargas = 0;
                let total_gastos = 0;

                try {
                    const { data: statementData, error: statementError } = await (supabase.from('v_wallet_statement') as any)
                        .select('amount_cents, direction')
                        .eq('owner_user_id', user.id);

                    if (statementError) {
                        console.error("[Wallet] Erro ao buscar v_wallet_statement:", statementError);
                    } else if (statementData && Array.isArray(statementData)) {
                        total_recargas = statementData
                            .filter(e => String(e.direction).toLowerCase() === 'credit')
                            .reduce((acc, curr) => acc + ((curr as any).amount_cents || 0) / 100, 0);

                        total_gastos = statementData
                            .filter(e => String(e.direction).toLowerCase() === 'debit')
                            .reduce((acc, curr) => acc + ((curr as any).amount_cents || 0) / 100, 0);
                    }
                } catch (innerErr) {
                    console.error("[Wallet] Falha não esperada no fetch do statement:", innerErr);
                }

                return {
                    balance_reais,
                    balance_cents,
                    total_recargas,
                    total_gastos
                };
            } catch (fatalError) {
                console.error("[Wallet] FATAL ERROR no useWalletOverview:", fatalError);
                return defaultOverview; // Nunca deixar estourar a tela
            }
        },
        staleTime: 0,
        gcTime: 0,
    });

    return {
        overview: overview || defaultOverview,
        isLoading,
        error,
        loadWallet: refetch,
    };
}
