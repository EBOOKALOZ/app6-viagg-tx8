import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MerchantLedgerEntry {
  id: string;
  account_id: string;
  source_type: string;
  amount_cents: number;
  entry_type: "credit" | "debit";
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface MerchantWalletData {
  balanceCents: number;
  balanceReais: number;
  pendingCents: number;
  pendingReais: number;
  transactions: MerchantLedgerEntry[];
}

export function useMerchantWallet() {
  const { data, isLoading, isError, error, refetch } = useQuery<MerchantWalletData | null>({
    queryKey: ["merchant-unified-wallet"],
    queryFn: async (): Promise<MerchantWalletData | null> => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) return null;

        // Fonte da verdade = carteira pay_* do merchant (owner = store_id).
        // A RPC SECURITY DEFINER resolve a loja via auth.uid() e contorna o
        // mismatch de RLS (a conta pay_* tem owner_id = store_id, não o
        // auth.uid()). É a MESMA conta debitada ao pagar o motoboy.
        const { data, error } = await supabase.rpc("get_my_merchant_pay_wallet");
        if (error) throw error;

        const res = (data as Record<string, unknown>) || {};
        if (res.success === false) {
          throw new Error(String(res.error) || "Falha ao carregar carteira");
        }

        const balanceCents = Number(res.available_cents ?? 0);
        const pendingCents = Number(res.pending_cents ?? 0);

        return {
          balanceCents,
          balanceReais: balanceCents / 100,
          pendingCents,
          pendingReais: pendingCents / 100,
          transactions: (res.transactions as MerchantLedgerEntry[]) || [],
        };
      } catch (err) {
        console.error("USEMERCHANTWALLET FATAL:", err);
        throw err;
      }
    },
    staleTime: 0,
    gcTime: 0, // No caching for wallets
  });

  return {
    overview: data || { balanceCents: 0, balanceReais: 0, pendingCents: 0, pendingReais: 0, transactions: [] },
    isLoading,
    isError,
    error,
    loadWallet: refetch,
  };
}
