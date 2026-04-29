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

                // 1) Puxar Conta Financeira Primeiro para validar existência
                const { data: account, error: accountError } = await supabase
                    .from('financial_accounts')
                    .select('id, available_balance')
                    .eq('owner_user_id', user.id)
                    .maybeSingle();

                console.log("[Wallet] Supabase Result:", { account, accountError });

                if (accountError) {
                    console.error("[Wallet] Erro ao buscar financial_accounts:", accountError);
                    return defaultOverview;
                }

                if (!account) {
                    console.log("[Wallet] Nenhuma financial_account encontrada. Retornando 0.");
                    return defaultOverview;
                }

                const balance_reais = account.available_balance || 0;
                const balance_cents = Math.round(balance_reais * 100);

                let total_recargas = 0;
                let total_gastos = 0;

                try {
                    const { data: ledgerData, error: ledgerError } = await supabase
                        .from('ledger_entries')
                        .select('amount_cents, entry_type')
                        .eq('account_id', account.id);

                    if (ledgerError) {
                        console.error("[Wallet] Erro ao buscar ledger_entries:", ledgerError);
                    } else if (ledgerData && Array.isArray(ledgerData)) {
                        total_recargas = ledgerData
                            .filter(e => e.entry_type === 'credit')
                            .reduce((acc, curr) => acc + ((curr as any).amount_cents || 0) / 100, 0);

                        total_gastos = ledgerData
                            .filter(e => e.entry_type === 'debit')
                            .reduce((acc, curr) => acc + ((curr as any).amount_cents || 0) / 100, 0);
                    }
                } catch (innerErr) {
                    console.error("[Wallet] Falha não esperada no fetch do ledger:", innerErr);
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
