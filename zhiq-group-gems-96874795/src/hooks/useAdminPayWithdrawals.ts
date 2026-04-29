import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { WithdrawalRequest, PayoutStatus } from "@/skills/pay/payTypes";
import { REFETCH_INTERVAL_MS } from "@/skills/pay/payConstants";
import { generateIdempotencyKey } from "@/skills/pay/payUtils";

// ═══════════════════════════════════════════════════════
// Withdrawal Queue
// ═══════════════════════════════════════════════════════
export function usePayWithdrawalQueue(filters?: {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
}) {
  return useQuery({
    queryKey: ["pay-withdrawal-queue", filters],
    queryFn: async (): Promise<WithdrawalRequest[]> => {
      let q = supabase
        .from("payout_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (filters?.status && filters.status !== "all") {
        q = q.eq("status", filters.status);
      }
      if (filters?.dateFrom) {
        q = q.gte("created_at", filters.dateFrom);
      }
      if (filters?.dateTo) {
        q = q.lte("created_at", filters.dateTo);
      }

      const { data, error } = await q;
      if (error) { console.error("Error fetching withdrawal queue:", error); return []; }

      return (data || []).map((p: any) => ({
        id: p.id,
        user_id: p.user_id || p.owner_id || "",
        owner_type: p.owner_type || "platform",
        owner_id: p.owner_id || p.user_id || "",
        amount_cents: Number(p.amount_cents || 0),
        fee_cents: Number(p.fee_cents || 0),
        net_amount_cents: Number(p.net_amount_cents || p.amount_cents || 0),
        status: p.status as PayoutStatus,
        destination_account_id: p.destination_account_id || p.bank_account_id || null,
        destination_bank_name: p.destination_bank_name || null,
        destination_pix_key: p.destination_pix_key || null,
        observation: p.observation || p.notes || null,
        idempotency_key: p.idempotency_key || null,
        approved_by: p.approved_by || null,
        approved_at: p.approved_at || null,
        paid_at: p.paid_at || p.completed_at || null,
        failed_at: p.failed_at || null,
        failure_reason: p.failure_reason || p.error_message || null,
        created_at: p.created_at,
        updated_at: p.updated_at || null,
      }));
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

// ═══════════════════════════════════════════════════════
// Request Withdrawal (via RPC)
// ═══════════════════════════════════════════════════════
export function useRequestWithdrawal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      amountCents: number;
      destinationAccountId: string;
      observation?: string;
    }) => {
      const idempotencyKey = generateIdempotencyKey("wd");

      // Try RPC first
      const { data, error } = await (supabase.rpc as any)("pay_request_withdrawal", {
        p_amount_cents: params.amountCents,
        p_destination_account_id: params.destinationAccountId,
        p_observation: params.observation || null,
        p_idempotency_key: idempotencyKey,
      });

      if (error) {
        // Fallback: direct insert with pending_approval status
        const { data: inserted, error: insertError } = await supabase
          .from("payout_requests")
          .insert({
            amount_cents: params.amountCents,
            status: "pending_approval",
            owner_type: "platform",
            idempotency_key: idempotencyKey,
          } as any)
          .select()
          .single();

        if (insertError) throw insertError;
        return inserted;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pay-withdrawal-queue"] });
      queryClient.invalidateQueries({ queryKey: ["pay-treasury-stats"] });
    },
  });
}

// ═══════════════════════════════════════════════════════
// Approve Withdrawal
// ═══════════════════════════════════════════════════════
export function useApproveWithdrawal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payoutId: string) => {
      const { data, error } = await (supabase.rpc as any)("pay_approve_withdrawal", {
        p_payout_id: payoutId,
      });

      if (error) {
        // Fallback: direct update
        const { error: updateError } = await supabase
          .from("payout_requests")
          .update({ status: "approved", approved_at: new Date().toISOString() } as any)
          .eq("id", payoutId);

        if (updateError) throw updateError;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pay-withdrawal-queue"] });
      queryClient.invalidateQueries({ queryKey: ["pay-treasury-stats"] });
    },
  });
}

// ═══════════════════════════════════════════════════════
// Cancel Withdrawal
// ═══════════════════════════════════════════════════════
export function useCancelWithdrawal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payoutId: string) => {
      const { data, error } = await (supabase.rpc as any)("pay_cancel_withdrawal", {
        p_payout_id: payoutId,
      });

      if (error) {
        const { error: updateError } = await supabase
          .from("payout_requests")
          .update({ status: "canceled" } as any)
          .eq("id", payoutId);

        if (updateError) throw updateError;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pay-withdrawal-queue"] });
      queryClient.invalidateQueries({ queryKey: ["pay-treasury-stats"] });
    },
  });
}

// ═══════════════════════════════════════════════════════
// Reprocess Failed Withdrawal
// ═══════════════════════════════════════════════════════
export function useReprocessWithdrawal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payoutId: string) => {
      const { data, error } = await (supabase.rpc as any)("pay_reprocess_withdrawal", {
        p_payout_id: payoutId,
      });

      if (error) {
        const { error: updateError } = await supabase
          .from("payout_requests")
          .update({ status: "queued" } as any)
          .eq("id", payoutId)
          .eq("status", "failed");

        if (updateError) throw updateError;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pay-withdrawal-queue"] });
    },
  });
}
