/**
 * useUnifiedWallet — carteira unificada do profissional, 100% no motor pay_*.
 *
 * REESCRITO (2026-07-10, correção definitiva das comissões): as fontes
 * legadas financial_accounts/ledger_entries foram DESCONTINUADAS aqui —
 * o dinheiro real (liquidação pay_release_ride_payment) vive em
 * pay_financial_accounts/pay_ledger_entries, e o extrato oficial é a view
 * v_wallet_statement (security_invoker sobre pay_*).
 */
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
  mototaxi: "Moto-Táxi",
  passenger: "Passageiro",
  freight: "Freteiro",
};

/** owner_type/account_type pay_* → chave de perfil da UI */
function payProfileKey(ownerOrAccount: string): string {
  if (ownerOrAccount.includes("mototaxi")) return "mototaxi";
  if (ownerOrAccount.includes("driver")) return "driver";
  if (ownerOrAccount.includes("merchant")) return "merchant";
  if (ownerOrAccount.includes("customer")) return "passenger";
  return "motoboy";
}

// ============= Carteiras pay_* do usuário =============
export function useUnifiedWalletAccounts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["unified-wallet-accounts", user?.id],
    queryFn: async (): Promise<ProfileBalance[]> => {
      if (!user?.id) return [];

      const { data, error } = await (supabase as any)
        .from("pay_financial_accounts")
        .select("id, account_type, available_balance")
        .eq("owner_id", user.id)
        .in("account_type", [
          "motoboy_wallet", "mototaxi_wallet", "driver_wallet", "merchant_wallet",
        ]);

      if (error) {
        console.error("[useUnifiedWalletAccounts] erro pay_financial_accounts:", error);
        return [];
      }

      return (data || []).map((acc: any) => {
        const key = payProfileKey(String(acc.account_type));
        return {
          profileType: key,
          label: PROFILE_LABELS[key] || key,
          balanceCents: Math.round(Number(acc.available_balance || 0) * 100),
          accountId: acc.id,
        };
      });
    },
    enabled: !!user?.id,
    staleTime: 0,
  });
}

// ============= Saldo unificado (pay_*) =============
export function useUnifiedBalance() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: accounts, isLoading } = useUnifiedWalletAccounts();

  const byProfile = accounts ?? [];
  const total = byProfile.reduce((s, p) => s + p.balanceCents, 0) / 100;

  // Realtime: qualquer lançamento pay_* do usuário atualiza os saldos.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`unified-pay-balance-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pay_ledger_entries" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["unified-wallet-accounts", user.id] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  return { total, byProfile, isLoading };
}

// ============= Extrato unificado (view oficial sobre pay_*) =============
export function useUnifiedTimeline(filterProfile?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["unified-timeline", user?.id, filterProfile],
    queryFn: async (): Promise<UnifiedLedgerEntry[]> => {
      if (!user?.id) return [];

      const { data, error } = await (supabase as any)
        .from("v_wallet_statement")
        .select("*")
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("[useUnifiedTimeline] erro v_wallet_statement:", error);
        return [];
      }

      const mapped: UnifiedLedgerEntry[] = (data || []).map((e: any, i: number) => {
        const cents = Number(e.amount_cents || 0);
        return {
          id: `${e.created_at}-${e.source_id ?? i}`,
          amount_cents: String(e.direction).toLowerCase() === "debit" ? -cents : cents,
          created_at: e.created_at,
          entry_type: e.source_type ?? null,
          reference_type: e.source_type ?? null,
          reference_id: e.source_id ?? null,
          profile_type: payProfileKey(String(e.profile_type ?? "motoboy_profile")),
        };
      });

      return filterProfile
        ? mapped.filter((m) => m.profile_type === filterProfile)
        : mapped;
    },
    enabled: !!user?.id,
    staleTime: 0,
  });
}
