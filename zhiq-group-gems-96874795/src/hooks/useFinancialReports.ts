/**
 * useFinancialReports - Centralized hook for financial reporting
 * 
 * Provides aggregated financial data for admin reports.
 * Uses existing data without recalculation.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FinancialSummary } from "@/lib/finance";

interface DateRange {
  start: Date;
  end: Date;
}

export function useFinancialReports(dateRange: DateRange) {
  const { start, end } = dateRange;

  /**
   * Financial Summary - Aggregate totals for the period
   */
  const summaryQuery = useQuery({
    queryKey: ["financial-summary", start.toISOString(), end.toISOString()],
    queryFn: async (): Promise<FinancialSummary> => {
      // Total received from merchants (recharges)
      const { data: merchantTransactions } = await supabase
        .from("merchant_wallet_transactions")
        .select("valor, tipo")
        .eq("tipo", "recarga")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      const totalReceivedMerchants = merchantTransactions?.reduce(
        (acc, t) => acc + Number(t.valor),
        0
      ) || 0;

      // Total paid to motoboys (withdrawals)
      const { data: motoboyPayments } = await supabase
        .from("motoboy_wallet_transactions")
        .select("valor, tipo")
        .eq("tipo", "saque")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      const totalPaidMotoboys = Math.abs(
        motoboyPayments?.reduce((acc, t) => acc + Number(t.valor), 0) || 0
      );

      // Platform fees from delivery history
      const { data: deliveryHistory } = await supabase
        .from("delivery_history")
        .select("taxa_plataforma, valor_bruto")
        .gte("finalizada_em", start.toISOString())
        .lte("finalizada_em", end.toISOString());

      const totalPlatformFees = deliveryHistory?.reduce(
        (acc, d) => acc + Number(d.taxa_plataforma || 0),
        0
      ) || 0;

      return {
        total_received_merchants: totalReceivedMerchants,
        total_paid_motoboys: totalPaidMotoboys,
        total_platform_fees: totalPlatformFees,
        net_profit: totalPlatformFees,
        delivery_count: deliveryHistory?.length || 0,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
      };
    },
  });

  /**
   * Motoboy Report - Per-motoboy earnings and payouts
   */
  const motoboyReportQuery = useQuery({
    queryKey: ["motoboy-report", start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from("motoboy_profiles")
        .select("user_id");

      if (!profiles) return [];

      const userIds = profiles.map((p) => p.user_id);

      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", userIds);

      const { data: deliveries } = await supabase
        .from("delivery_history")
        .select("motoboy_id, valor_bruto, valor_liquido, taxa_plataforma")
        .in("motoboy_id", userIds)
        .gte("finalizada_em", start.toISOString())
        .lte("finalizada_em", end.toISOString());

      const { data: payments } = await supabase
        .from("motoboy_wallet_transactions")
        .select("user_id, valor, tipo")
        .in("user_id", userIds)
        .eq("tipo", "saque")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      return userIds.map((userId) => {
        const profile = profilesData?.find((p) => p.id === userId);
        const userDeliveries = deliveries?.filter((d) => d.motoboy_id === userId) || [];
        const userPayments = payments?.filter((p) => p.user_id === userId) || [];

        const totalEarned = userDeliveries.reduce((acc, d) => acc + Number(d.valor_liquido || 0), 0);
        const totalPaid = Math.abs(userPayments.reduce((acc, p) => acc + Number(p.valor), 0));

        return {
          user_id: userId,
          name: profile?.name || "Sem nome",
          email: profile?.email || "",
          delivery_count: userDeliveries.length,
          total_earned: totalEarned,
          total_paid: totalPaid,
          pending_balance: totalEarned - totalPaid,
        };
      }).filter(m => m.delivery_count > 0 || m.total_paid > 0);
    },
  });

  /**
   * Merchant Report - Per-merchant transactions
   */
  const merchantReportQuery = useQuery({
    queryKey: ["merchant-report", start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const { data: stores } = await supabase
        .from("merchant_stores")
        .select("user_id, nome_loja");

      if (!stores) return [];

      const userIds = stores.map((s) => s.user_id);

      const { data: transactions } = await supabase
        .from("merchant_wallet_transactions")
        .select("*")
        .in("user_id", userIds)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      const { data: deliveries } = await supabase
        .from("delivery_history")
        .select("*")
        .in("loja_nome", stores.map(s => s.nome_loja))
        .gte("finalizada_em", start.toISOString())
        .lte("finalizada_em", end.toISOString());

      return stores.map((store) => {
        const userTx = transactions?.filter((t) => t.user_id === store.user_id) || [];
        const storeDeliveries = deliveries?.filter((d) => d.loja_nome === store.nome_loja) || [];

        const totalRecharges = userTx
          .filter((t) => t.tipo === "recarga")
          .reduce((acc, t) => acc + Number(t.valor), 0);

        const totalPayments = userTx
          .filter((t) => t.tipo === "pagamento_entrega")
          .reduce((acc, t) => acc + Math.abs(Number(t.valor)), 0);

        const platformFees = storeDeliveries.reduce(
          (acc, d) => acc + Number(d.taxa_plataforma || 0),
          0
        );

        return {
          user_id: store.user_id,
          store_name: store.nome_loja,
          total_recharges: totalRecharges,
          total_payments: totalPayments,
          platform_fees: platformFees,
          delivery_count: storeDeliveries.length,
        };
      }).filter(m => m.total_recharges > 0 || m.delivery_count > 0);
    },
  });

  /**
   * Delivery Audit Report - Individual delivery transactions
   */
  const deliveryAuditQuery = useQuery({
    queryKey: ["delivery-audit", start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const { data } = await supabase
        .from("delivery_history")
        .select("*")
        .gte("finalizada_em", start.toISOString())
        .lte("finalizada_em", end.toISOString())
        .order("finalizada_em", { ascending: false })
        .limit(100);

      return data || [];
    },
  });

  return {
    summary: summaryQuery.data,
    isLoadingSummary: summaryQuery.isLoading,
    
    motoboyReport: motoboyReportQuery.data || [],
    isLoadingMotoboyReport: motoboyReportQuery.isLoading,
    
    merchantReport: merchantReportQuery.data || [],
    isLoadingMerchantReport: merchantReportQuery.isLoading,
    
    deliveryAudit: deliveryAuditQuery.data || [],
    isLoadingDeliveryAudit: deliveryAuditQuery.isLoading,
    
    refetchAll: () => {
      summaryQuery.refetch();
      motoboyReportQuery.refetch();
      merchantReportQuery.refetch();
      deliveryAuditQuery.refetch();
    },
  };
}
