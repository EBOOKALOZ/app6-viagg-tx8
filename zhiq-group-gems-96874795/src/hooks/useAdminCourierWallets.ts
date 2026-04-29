import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { REFETCH_INTERVAL_MS } from "@/skills/pay/payConstants";

const PAGE_SIZE = 30;

// ═══════════════════════════════════════════════════════
// Wallet Overview (per-motoboy summary rows)
// View: admin_pi2_motoboy_wallet_overview
// ═══════════════════════════════════════════════════════
export function usePI2WalletOverview(filters?: {
  userId?: string;
  page?: number;
}) {
  const page = filters?.page || 0;

  return useQuery({
    queryKey: ["pi2-wallet-overview", filters],
    queryFn: async () => {
      let q = (supabase.from("admin_pi2_motoboy_wallet_overview") as any)
        .select("*", { count: "exact" })
        .order("last_movement_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filters?.userId?.trim()) {
        q = q.eq("user_id", filters.userId.trim());
      }

      const { data, error, count } = await q;
      if (error) { console.error("PI2 wallet overview error:", error); return { rows: [], count: 0 }; }
      return { rows: data || [], count: count || 0 };
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

// ═══════════════════════════════════════════════════════
// Split Details (individual split transfers)
// View: admin_pi2_motoboy_split_details
// ═══════════════════════════════════════════════════════
export function usePI2SplitDetails(filters?: {
  status?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
}) {
  const page = filters?.page || 0;

  return useQuery({
    queryKey: ["pi2-split-details", filters],
    queryFn: async () => {
      let q = (supabase.from("admin_pi2_motoboy_split_details") as any)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filters?.status && filters.status !== "all") q = q.eq("status", filters.status);
      if (filters?.userId?.trim()) q = q.eq("user_id", filters.userId.trim());
      if (filters?.dateFrom) q = q.gte("created_at", filters.dateFrom);
      if (filters?.dateTo) q = q.lte("created_at", filters.dateTo);

      const { data, error, count } = await q;
      if (error) { console.error("PI2 split details error:", error); return { rows: [], count: 0 }; }
      return { rows: data || [], count: count || 0 };
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

// ═══════════════════════════════════════════════════════
// Withdrawal Details (courier payout_requests)
// View: admin_pi2_motoboy_withdrawal_details
// ═══════════════════════════════════════════════════════
export function usePI2WithdrawalDetails(filters?: {
  status?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
}) {
  const page = filters?.page || 0;

  return useQuery({
    queryKey: ["pi2-withdrawal-details", filters],
    queryFn: async () => {
      let q = (supabase.from("admin_pi2_motoboy_withdrawal_details") as any)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filters?.status && filters.status !== "all") q = q.eq("status", filters.status);
      if (filters?.userId?.trim()) q = q.eq("user_id", filters.userId.trim());
      if (filters?.dateFrom) q = q.gte("created_at", filters.dateFrom);
      if (filters?.dateTo) q = q.lte("created_at", filters.dateTo);

      const { data, error, count } = await q;
      if (error) { console.error("PI2 withdrawal details error:", error); return { rows: [], count: 0 }; }
      return { rows: data || [], count: count || 0 };
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

// ═══════════════════════════════════════════════════════
// Aggregated Summary (computed from overview view)
// ═══════════════════════════════════════════════════════
export function usePI2Summary() {
  return useQuery({
    queryKey: ["pi2-summary"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("admin_pi2_motoboy_wallet_overview") as any)
        .select("*");

      if (error) {
        console.error("PI2 summary error:", error);
        return {
          totalAvailable: 0, totalSplitPaid: 0, totalWithdrawalsPaid: 0,
          totalPendingWithdrawals: 0, openWithdrawalsCount: 0, motoboyCount: 0,
        };
      }

      const rows = data || [];
      return {
        totalAvailable: rows.reduce((s: number, r: any) => s + Number(r.available_balance || r.saldo_disponivel || 0), 0),
        totalSplitPaid: rows.reduce((s: number, r: any) => s + Number(r.total_split_completed || r.total_creditos || 0), 0),
        totalWithdrawalsPaid: rows.reduce((s: number, r: any) => s + Number(r.total_withdrawals_paid || r.total_debitos || 0), 0),
        totalPendingWithdrawals: rows.reduce((s: number, r: any) => s + Number(r.open_withdrawal_value || r.valor_em_aberto || 0), 0),
        openWithdrawalsCount: rows.reduce((s: number, r: any) => s + Number(r.open_withdrawals_count || r.saques_em_aberto || 0), 0),
        motoboyCount: rows.length,
      };
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}
