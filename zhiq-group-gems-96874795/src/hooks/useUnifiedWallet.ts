import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

// ============= Types =============
export interface ProfileBalance {
  profileType: string;
  label: string;
  balanceCents: number;
  accountId: string;
}

export interface UnifiedLedgerEntry {
  id: string;
  amount_cents: number;
  created_at: string;
  entry_type: string | null;
  reference_type: string | null;
  reference_id: string | null;
  profile_type: string;
}

const PROFILE_LABELS: Record<string, string> = {
  motoboy: "Motoboy",
  merchant: "Lojista",
  driver: "Motorista",
  passenger: "Passageiro",
  freight: "Freteiro",
};

// ============= All wallet accounts for user =============
export function useUnifiedWalletAccounts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["unified-wallet-accounts", user?.id],
    queryFn: async (): Promise<ProfileBalance[]> => {
      if (!user?.id) return [];

      console.log(`[DEBUG useUnifiedWalletAccounts] Auth User ID: ${user.id}`);
      
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, available_balance, profile_type")
        .eq("owner_user_id", user.id)
        .eq("account_type", "user_wallet")
        .eq("is_active", true);

      console.log(`[DEBUG useUnifiedWalletAccounts] Raw Supabase Result for ${user.id}:`, { data, error });

      if (error) {
        console.error("Error fetching wallet accounts from financial_accounts:", error);
        return [];
      }

      const result = (data || []).map((acc) => ({
        profileType: acc.profile_type,
        label: PROFILE_LABELS[acc.profile_type] || acc.profile_type,
        balanceCents: Math.round((acc.available_balance || 0) * 100),
        accountId: acc.id,
      }));

      console.log('[DEBUG useUnifiedWalletAccounts] Final Mapped Result:', result);
      return result;
    },
    enabled: !!user?.id,
    staleTime: 0,
  });
}

// ============= Unified balance from ledger =============
export function useUnifiedBalance() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: accounts } = useUnifiedWalletAccounts();

  const accountIds = (accounts || []).map((a) => a.accountId);

  const balanceQuery = useQuery({
    queryKey: ["unified-ledger-balance", user?.id, accountIds],
    queryFn: async (): Promise<{ total: number; byProfile: ProfileBalance[] }> => {
      console.log('[DEBUG useUnifiedBalance] Fetching balance for accounts:', accountIds);
      if (!accountIds.length) return { total: 0, byProfile: [] };

      // Fetch ledger entries for all accounts
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("amount_cents, account_id")
        .in("account_id", accountIds);

      console.log('[DEBUG useUnifiedBalance] Ledger entries for accounts:', data);

      if (error) {
        console.error("[DEBUG useUnifiedBalance] Error fetching unified balance:", error);
        return { total: 0, byProfile: accounts || [] };
      }

      // Sum per account
      const sumByAccount: Record<string, number> = {};
      (data || []).forEach((e) => {
        sumByAccount[e.account_id] = (sumByAccount[e.account_id] || 0) + e.amount_cents;
      });

      // Fetch pending payouts for these accounts to subtract from available balance
      const { data: payoutData, error: payoutError } = await supabase
        .from("payout_requests")
        .select("amount_cents, owner_id, owner_type")
        .eq("status", "pending");

      const reservedByProfile: Record<string, number> = {};
      if (!payoutError && payoutData) {
        payoutData.forEach(p => {
          const profileType = p.owner_type;
          reservedByProfile[profileType] = (reservedByProfile[profileType] || 0) + p.amount_cents;
        });
      }

      console.log('[DEBUG useUnifiedBalance] Payouts reserved by profile:', reservedByProfile);

      const byProfile = (accounts || []).map((acc) => {
        const ledgerSum = sumByAccount[acc.accountId] || 0;
        const reserved = reservedByProfile[acc.profileType] || 0;
        const finalBalance = ledgerSum - reserved;
        
        console.log(`[DEBUG useUnifiedBalance] Profile: ${acc.profileType} | Ledger: ${ledgerSum} | Reserved: ${reserved} | Final: ${finalBalance}`);
        
        return {
          ...acc,
          balanceCents: finalBalance,
        };
      });

      const total = byProfile.reduce((s, p) => s + p.balanceCents, 0) / 100;
      console.log('[DEBUG useUnifiedBalance] Final UI Total (Reais):', total);

      return { total, byProfile };
    },
    enabled: accountIds.length > 0,
    staleTime: 0,
  });

  // Realtime for all accounts
  useEffect(() => {
    if (!accountIds.length) return;

    const channel = supabase
      .channel(`unified-balance-${user?.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ledger_entries" },
        (payload: any) => {
          if (accountIds.includes(payload.new?.account_id || payload.old?.account_id)) {
            queryClient.invalidateQueries({ queryKey: ["unified-ledger-balance", user?.id] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountIds.join(","), user?.id, queryClient]);

  return {
    total: balanceQuery.data?.total ?? 0,
    byProfile: balanceQuery.data?.byProfile ?? [],
    isLoading: balanceQuery.isLoading,
  };
}

// ============= Unified timeline =============
export function useUnifiedTimeline(filterProfile?: string) {
  const { data: accounts } = useUnifiedWalletAccounts();
  const accountIds = (accounts || []).map((a) => a.accountId);
  const accountToProfile = Object.fromEntries(
    (accounts || []).map((a) => [a.accountId, a.profileType])
  );

  return useQuery({
    queryKey: ["unified-timeline", accountIds, filterProfile],
    queryFn: async (): Promise<UnifiedLedgerEntry[]> => {
      if (!accountIds.length) return [];

      const targetIds = filterProfile
        ? accountIds.filter((id) => accountToProfile[id] === filterProfile)
        : accountIds;

      if (!targetIds.length) return [];

      const { data, error } = await supabase
        .from("ledger_entries")
        .select("id, amount_cents, created_at, entry_type, reference_type, reference_id, account_id")
        .in("account_id", targetIds)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error fetching unified timeline:", error);
        return [];
      }

      return (data || []).map((e) => ({
        ...e,
        profile_type: accountToProfile[e.account_id] || "unknown",
      }));
    },
    enabled: accountIds.length > 0,
    staleTime: 0,
  });
}
