import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfDay, startOfWeek, startOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { TreasuryStats, CashflowDataPoint, CashflowPeriod, PeriodSummary } from "@/skills/pay/payTypes";
import { REFETCH_INTERVAL_MS } from "@/skills/pay/payConstants";

// ═══════════════════════════════════════════════════════
// Treasury KPI Stats — 7 key metrics
// ═══════════════════════════════════════════════════════
export function usePayTreasuryStats() {
  return useQuery({
    queryKey: ["pay-treasury-stats"],
    queryFn: async (): Promise<TreasuryStats> => {
      // Try RPC first
      const { data: rpc, error: rpcErr } = await (supabase.rpc as any)(
        "pay_treasury_stats", {}
      );
      if (!rpcErr && rpc) {
        return {
          grossBalanceCents: rpc.gross_balance_cents ?? 0,
          settledBalanceCents: rpc.settled_balance_cents ?? 0,
          availableForWithdrawalCents: rpc.available_for_withdrawal_cents ?? 0,
          reservedBalanceCents: rpc.reserved_balance_cents ?? 0,
          pendingWithdrawalsCount: rpc.pending_withdrawals_count ?? 0,
          completedWithdrawalsCount: rpc.completed_withdrawals_count ?? 0,
          recentFailuresCount: rpc.recent_failures_count ?? 0,
        };
      }

      // Fallback: compute from tables
      const { data: accounts } = await supabase
        .from("financial_accounts")
        .select("available_balance, pending_balance, reserved_balance, account_type");

      const allAccounts = accounts || [];
      const grossBalance = allAccounts.reduce((s, a) => 
        s + Math.round((Number(a.available_balance || 0) + Number(a.pending_balance || 0) + Number(a.reserved_balance || 0)) * 100), 0);
      const settledBalance = allAccounts.reduce((s, a) => s + Math.round(Number(a.available_balance || 0) * 100), 0);
      const reservedBalance = allAccounts.reduce((s, a) => s + Math.round(Number(a.reserved_balance || 0) * 100), 0);
      const availableForWithdrawal = settledBalance - reservedBalance;

      // Payout counts
      const { data: payouts } = await supabase
        .from("payout_requests")
        .select("status, amount_cents");

      const allPayouts = payouts || [];
      const pendingCount = allPayouts.filter(p => ["pending", "pending_approval", "approved", "queued", "processing"].includes(p.status)).length;
      const completedCount = allPayouts.filter(p => ["completed", "paid", "sent"].includes(p.status)).length;

      // Recent failures (last 7 days)
      const weekAgo = subDays(new Date(), 7).toISOString();
      const { count: failCount } = await supabase
        .from("payout_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", weekAgo);

      return {
        grossBalanceCents: grossBalance,
        settledBalanceCents: settledBalance,
        availableForWithdrawalCents: Math.max(0, availableForWithdrawal),
        reservedBalanceCents: reservedBalance,
        pendingWithdrawalsCount: pendingCount,
        completedWithdrawalsCount: completedCount,
        recentFailuresCount: failCount || 0,
      };
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

// ═══════════════════════════════════════════════════════
// Cashflow Chart Data
// ═══════════════════════════════════════════════════════
export function usePayCashflowChart(period: CashflowPeriod = "daily", days = 30) {
  return useQuery({
    queryKey: ["pay-cashflow-chart", period, days],
    queryFn: async (): Promise<CashflowDataPoint[]> => {
      const since = subDays(new Date(), days).toISOString();

      const { data: entries } = await supabase
        .from("ledger_entries")
        .select("amount_cents, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: true });

      if (!entries?.length) return [];

      // Group by period
      const groups = new Map<string, { entries: number; exits: number }>();
      for (const e of entries) {
        const date = new Date(e.created_at);
        let key: string;
        if (period === "daily") key = format(date, "dd/MM", { locale: ptBR });
        else if (period === "weekly") {
          const weekStart = startOfWeek(date, { locale: ptBR });
          key = format(weekStart, "dd/MM", { locale: ptBR });
        } else {
          const monthStart = startOfMonth(date);
          key = format(monthStart, "MMM/yy", { locale: ptBR });
        }

        const g = groups.get(key) || { entries: 0, exits: 0 };
        const amount = Number(e.amount_cents);
        if (amount > 0) g.entries += amount;
        else g.exits += Math.abs(amount);
        groups.set(key, g);
      }

      let runningBalance = 0;
      const result: CashflowDataPoint[] = [];
      for (const [label, g] of groups) {
        runningBalance += g.entries - g.exits;
        result.push({
          label,
          entriesCents: g.entries,
          exitsCents: g.exits,
          balanceCents: runningBalance,
        });
      }
      return result;
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

// ═══════════════════════════════════════════════════════
// Period Summary
// ═══════════════════════════════════════════════════════
export function usePayPeriodSummary(days = 30) {
  return useQuery({
    queryKey: ["pay-period-summary", days],
    queryFn: async (): Promise<PeriodSummary> => {
      const since = subDays(new Date(), days).toISOString();

      const { data: entries } = await supabase
        .from("ledger_entries")
        .select("amount_cents")
        .gte("created_at", since);

      if (!entries?.length) return { totalInCents: 0, totalOutCents: 0, netCents: 0, avgDailyCents: 0, transactionCount: 0 };

      let totalIn = 0, totalOut = 0;
      for (const e of entries) {
        const amt = Number(e.amount_cents);
        if (amt > 0) totalIn += amt;
        else totalOut += Math.abs(amt);
      }

      return {
        totalInCents: totalIn,
        totalOutCents: totalOut,
        netCents: totalIn - totalOut,
        avgDailyCents: Math.round((totalIn - totalOut) / days),
        transactionCount: entries.length,
      };
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}
