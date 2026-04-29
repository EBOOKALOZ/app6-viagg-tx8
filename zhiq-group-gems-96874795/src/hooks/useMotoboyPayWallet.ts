/**
 * useMotoboyPayWallet — Backend-driven wallet for motoboy
 *
 * Computes from ledger_entries + pay_escrow_holds + payout_requests:
 * - Available balance (total ledger sum - pending escrow - pending payouts)
 * - Pending balance (escrow held for this professional)
 * - Reserved balance (payout requests pending)
 * - Today / week earnings
 * - Per-service history
 * - Commission breakdown
 * - Payout requests with status
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { startOfDay, startOfWeek, format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ============= Types =============
export interface MotoboyPayBalance {
  availableCents: number;
  pendingCents: number;
  reservedCents: number;
  totalCents: number;
}

export interface MotoboyPayEarnings {
  todayCents: number;
  weekCents: number;
  todayCount: number;
  weekCount: number;
}

export interface MotoboyPayServiceEntry {
  id: string;
  amount_cents: number;
  created_at: string;
  entry_type: string | null;
  reference_type: string | null;
  reference_id: string | null;
  source_type: string | null;
  service_label: string;
}

export interface MotoboyPayoutEntry {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
}

export interface MotoboyPayCommission {
  commissionPercent: number;
  activeGroups: number;
}

// ============= Service label helper =============
const SERVICE_LABELS: Record<string, string> = {
  delivery: "Entrega",
  ride: "Corrida",
  mototaxi: "Moto-Táxi",
  freight: "Frete",
  service_earning: "Ganho de Serviço",
  service_payment: "Pagamento",
  escrow_release: "Liberação de Escrow",
  platform_fee: "Taxa da Plataforma",
  payout: "Saque",
  bonus: "Bônus",
  credit: "Crédito",
  debit: "Débito",
};

function getServiceLabel(entry: any): string {
  if (entry.reference_type && SERVICE_LABELS[entry.reference_type]) return SERVICE_LABELS[entry.reference_type];
  if (entry.source_type && SERVICE_LABELS[entry.source_type]) return SERVICE_LABELS[entry.source_type];
  if (entry.entry_type && SERVICE_LABELS[entry.entry_type]) return SERVICE_LABELS[entry.entry_type];
  return "Transação";
}

// ============= Balance Hook =============
export function useMotoboyPayBalance() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["motoboy-pay-balance", user?.id],
    queryFn: async (): Promise<MotoboyPayBalance> => {
      console.log(`[DEBUG useMotoboyPayBalance] Auth User ID: ${user.id}`);

      // Get motoboy wallet account directly (safe & official)
      const { data: viewData, error: viewError } = await supabase
        .from("financial_accounts")
        .select("id, available_balance, reserved_balance, pending_balance")
        .eq("owner_user_id", user.id)
        .eq("profile_type", "motoboy")
        .maybeSingle();

      console.log(`[DEBUG useMotoboyPayBalance] Raw Supabase Result for ${user.id}:`, { viewData, viewError });

      if (viewError || !viewData?.id) return { availableCents: 0, pendingCents: 0, reservedCents: 0, totalCents: 0 };

      const availableCents = Math.round((viewData.available_balance || 0) * 100);
      const pendingCents = Math.round((viewData.pending_balance || 0) * 100);
      const reservedCents = Math.round((viewData.reserved_balance || 0) * 100);
      const totalCents = availableCents + pendingCents + reservedCents;
      
      console.log(`[DEBUG useMotoboyPayBalance] Final Rendering Values (Cents):`, { availableCents, pendingCents, reservedCents, totalCents });
      
      console.log('--------------------------------------------------');
      console.log(`[DEBUG useMotoboyPayBalance] USER_ID: ${user.id}`);
      console.log(`[DEBUG useMotoboyPayBalance] ACCOUNT_ID: ${viewData.id}`);
      console.log(`[DEBUG useMotoboyPayBalance] SOURCE: financial_accounts`);
      console.log(`[DEBUG useMotoboyPayBalance] FINAL AVAILABLE (BRL): ${viewData.available_balance}`);
      console.log('--------------------------------------------------');

      return { availableCents, pendingCents, reservedCents, totalCents };
    },
    enabled: !!user?.id,
    staleTime: 0,
  });

  // Realtime
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`motoboy-pay-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ledger_entries" }, () => {
        queryClient.invalidateQueries({ queryKey: ["motoboy-pay-balance", user.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  return query;
}

// ============= Earnings Hook =============
export function useMotoboyPayEarnings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["motoboy-pay-earnings", user?.id],
    queryFn: async (): Promise<MotoboyPayEarnings> => {
      if (!user?.id) return { todayCents: 0, weekCents: 0, todayCount: 0, weekCount: 0 };

      const { data: accountData } = await supabase
        .from("financial_accounts")
        .select("id")
        .eq("owner_user_id", user.id)
        .eq("profile_type", "motoboy")
        .maybeSingle();

      const accountId = accountData?.id;

      if (!accountId) return { todayCents: 0, weekCents: 0, todayCount: 0, weekCount: 0 };

      const todayStart = startOfDay(new Date()).toISOString();
      const weekStart = startOfWeek(new Date(), { locale: ptBR }).toISOString();

      // Week entries (includes today)
      const { data: weekEntries } = await supabase
        .from("ledger_entries")
        .select("amount_cents, created_at")
        .eq("account_id", accountId)
        .gt("amount_cents", 0)
        .gte("created_at", weekStart);

      const todayEntries = (weekEntries || []).filter(e => e.created_at >= todayStart);

      return {
        todayCents: todayEntries.reduce((s, e) => s + Number(e.amount_cents || 0), 0),
        weekCents: (weekEntries || []).reduce((s, e) => s + Number(e.amount_cents || 0), 0),
        todayCount: todayEntries.length,
        weekCount: (weekEntries || []).length,
      };
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}

// ============= Service History =============
export function useMotoboyPayHistory(limit = 50) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["motoboy-pay-history", user?.id, limit],
    queryFn: async (): Promise<MotoboyPayServiceEntry[]> => {
      if (!user?.id) return [];

      const { data: accountData } = await supabase
        .from("financial_accounts")
        .select("id")
        .eq("owner_user_id", user.id)
        .eq("profile_type", "motoboy")
        .maybeSingle();

      const accountId = accountData?.id;

      if (!accountId) return [];

      const { data, error } = await supabase
        .from("ledger_entries")
        .select("id, amount_cents, created_at, entry_type, reference_type, reference_id, source_type")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) { console.error("Error fetching history:", error); return []; }

      return (data || []).map(e => ({
        ...e,
        service_label: getServiceLabel(e),
      }));
    },
    enabled: !!user?.id,
    staleTime: 0,
  });
}

// ============= Payout History =============
export function useMotoboyPayPayouts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["motoboy-pay-payouts", user?.id],
    queryFn: async (): Promise<MotoboyPayoutEntry[]> => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("payout_requests")
        .select("id, amount_cents, status, created_at")
        .eq("owner_id", user.id)
        .eq("owner_type", "motoboy")
        .order("created_at", { ascending: false })
        .limit(15);

      if (error) { console.error("Error fetching payouts:", error); return []; }
      return data || [];
    },
    enabled: !!user?.id,
  });
}

// ============= Commission =============
export function useMotoboyPayCommission() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["motoboy-pay-commission", user?.id],
    queryFn: async (): Promise<MotoboyPayCommission> => {
      if (!user?.id) return { commissionPercent: 15, activeGroups: 0 };

      const { data: profile } = await supabase
        .from("profiles")
        .select("quantidade_grupos_ativos")
        .eq("id", user.id)
        .single();

      const activeGroups = profile?.quantidade_grupos_ativos ?? 0;
      try {
        const { calculateCommissionRate } = await import("@/lib/api");
        return { commissionPercent: calculateCommissionRate(activeGroups), activeGroups };
      } catch {
        return { commissionPercent: 15, activeGroups };
      }
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}

// ============= Combined Hook =============
export function useMotoboyPayWallet() {
  const { data: balance, isLoading: isLoadingBalance } = useMotoboyPayBalance();
  const { data: earnings, isLoading: isLoadingEarnings } = useMotoboyPayEarnings();
  const { data: history, isLoading: isLoadingHistory } = useMotoboyPayHistory();
  const { data: payouts, isLoading: isLoadingPayouts } = useMotoboyPayPayouts();
  const { data: commission, isLoading: isLoadingCommission } = useMotoboyPayCommission();

  return {
    balance: balance ?? { availableCents: 0, pendingCents: 0, reservedCents: 0, totalCents: 0 },
    earnings: earnings ?? { todayCents: 0, weekCents: 0, todayCount: 0, weekCount: 0 },
    history: history ?? [],
    payouts: payouts ?? [],
    commission: commission ?? { commissionPercent: 15, activeGroups: 0 },
    isLoading: isLoadingBalance || isLoadingEarnings || isLoadingHistory,
    isLoadingPayouts,
    isLoadingCommission,
  };
}
