/**
 * usePayouts - Centralized hook for motoboy payout operations
 * 
 * Handles all motoboy payout logic with event-based receipt generation.
 * Prepared for future gateway integration without breaking changes.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  type MotoboyPayoutData,
  type MotoboyPayoutResult,
  type FinancialStatus,
  emitFinancialEvent,
  createFinancialEvent,
  createReceiptEvent,
  FINANCIAL_EVENTS,
} from "@/lib/finance";

export function usePayouts() {
  const { user, displayName } = useAuth();
  const queryClient = useQueryClient();

  /**
   * Process a manual payout to a motoboy
   * Creates transaction, receipt, and emits financial events
   */
  const processPayoutMutation = useMutation({
    mutationFn: async (data: MotoboyPayoutData): Promise<MotoboyPayoutResult> => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      // Emit payout initiated event
      await emitFinancialEvent(
        createFinancialEvent({
          event_type: FINANCIAL_EVENTS.MOTOBOY_PAYOUT_INITIATED,
          actor: "admin",
          actor_id: user.id,
          reference_type: "payout",
          reference_id: null,
          amount: data.amount,
          status: "pending" as FinancialStatus,
          metadata: {
            motoboy_id: data.motoboy_id,
            motoboy_name: data.motoboy_name,
            payment_method: data.payment_method,
          },
        })
      );

      try {
        // Insert payout transaction (negative value to reduce balance)
        const { data: txData, error: txError } = await supabase
          .from("motoboy_wallet_transactions")
          .insert({
            user_id: data.motoboy_id,
            tipo: "saque",
            valor: -data.amount,
            descricao: `Pagamento ${data.payment_method === 'pix' ? 'PIX' : 'Transferência'} - Admin`,
            referencia_id: null,
          })
          .select()
          .single();

        if (txError) throw txError;

        // Create payment receipt with full audit trail
        const { data: receiptData, error: receiptError } = await supabase
          .from("payment_receipts")
          .insert({
            receipt_type: "motoboy_payment",
            user_id: data.motoboy_id,
            amount: data.amount,
            payment_method: data.payment_method === 'pix' ? 'PIX' : 'Transferência Bancária',
            payment_date: new Date().toISOString(),
            paid_by: user.id,
            period_start: data.period_start || null,
            period_end: data.period_end || null,
            details: {
              motoboy_name: data.motoboy_name,
              motoboy_email: data.motoboy_email,
              paid_by_name: displayName || "Administrador",
              transaction_id: txData.id,
              ...data.bank_details,
            },
          })
          .select()
          .single();

        if (receiptError) {
          console.error("[usePayouts] Receipt creation failed:", receiptError);
        }

        // Emit payout completed event
        await emitFinancialEvent(
          createFinancialEvent({
            event_type: FINANCIAL_EVENTS.MOTOBOY_PAYOUT_COMPLETED,
            actor: "admin",
            actor_id: user.id,
            reference_type: "payout",
            reference_id: txData.id,
            amount: data.amount,
            status: "paid" as FinancialStatus,
            metadata: {
              motoboy_id: data.motoboy_id,
              receipt_id: receiptData?.id,
              receipt_hash: receiptData?.receipt_hash,
            },
          })
        );

        // Emit receipt generated event
        if (receiptData) {
          await emitFinancialEvent(
            createReceiptEvent({
              receipt_type: "motoboy_payment",
              receipt_id: receiptData.id,
              receipt_hash: receiptData.receipt_hash,
              user_id: data.motoboy_id,
              amount: data.amount,
              actor_id: user.id,
            })
          );
        }

        return {
          success: true,
          transaction_id: txData.id,
          receipt_id: receiptData?.id,
          receipt_hash: receiptData?.receipt_hash,
        };
      } catch (error) {
        // Emit payout failed event
        await emitFinancialEvent(
          createFinancialEvent({
            event_type: FINANCIAL_EVENTS.MOTOBOY_PAYOUT_FAILED,
            actor: "admin",
            actor_id: user.id,
            reference_type: "payout",
            reference_id: null,
            amount: data.amount,
            status: "pending" as FinancialStatus,
            metadata: {
              motoboy_id: data.motoboy_id,
              error: error instanceof Error ? error.message : "Unknown error",
            },
          })
        );

        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-motoboy-payments"] });
      queryClient.invalidateQueries({ queryKey: ["motoboy-wallet-balance"] });
      queryClient.invalidateQueries({ queryKey: ["motoboy-wallet-transactions"] });
      toast.success("Pagamento registrado com sucesso!");
    },
    onError: (error) => {
      console.error("[usePayouts] Error:", error);
      toast.error("Erro ao registrar pagamento");
    },
  });

  return {
    processPayout: processPayoutMutation.mutateAsync,
    isProcessing: processPayoutMutation.isPending,
  };
}
