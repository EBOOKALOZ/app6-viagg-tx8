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
  metadata: any | null;
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

        if (!user) {
          return null;
        }

        console.log(`[DEBUG useMerchantWallet] Auth User ID: ${user.id}`);
        
        // 1. Fetch Merchant Wallet directly from financial_accounts
        const { data: accountData, error: accountError } = await supabase
          .from("financial_accounts")
          .select("id, available_balance, pending_balance")
          .eq("owner_user_id", user.id)
          .eq("profile_type", "merchant")
          .maybeSingle();

        console.log(`[DEBUG useMerchantWallet] Raw Supabase Result for ${user.id}:`, { accountData, accountError });
        if (accountError) throw accountError;

        if (!accountData?.id) {
          console.log("DEBUG_WALLET: account not found, returning zero");
          return { balanceCents: 0, balanceReais: 0, pendingCents: 0, pendingReais: 0, transactions: [] };
        }

        const balanceReais = accountData.available_balance || 0;
        const balanceCents = Math.round(balanceReais * 100);
        const accountId = accountData.id;

        console.log(`[DEBUG useMerchantWallet] Final Render Value: R$ ${balanceReais}`);

        // 2. Fetch Ledger Entries strictly filtered by merchant
        const { data: ledgerData, error: ledgerError } = await supabase
          .from("ledger_entries")
          .select("*")
          .eq("account_id", accountId)
          .eq("source_type", "merchant")
          .order("created_at", { ascending: false });

        if (ledgerError) throw ledgerError;

        const pendingReais = accountData.pending_balance || 0;
        const pendingCents = Math.round(pendingReais * 100);

        return {
          balanceCents,
          balanceReais,
          pendingCents,
          pendingReais,
          transactions: (ledgerData as any) || [],
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
