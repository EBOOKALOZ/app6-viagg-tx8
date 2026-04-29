/**
 * usePayments - Centralized hook for merchant payment operations
 * 
 * Handles merchant recharges, delivery payments, and refunds.
 * Prepared for future gateway integration without breaking changes.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  type MerchantRechargeData,
  type MerchantRechargeResult,
  type DeliveryPaymentData,
  type DeliveryPaymentResult,
  type FinancialStatus,
  emitFinancialEvent,
  createFinancialEvent,
  createReceiptEvent,
  FINANCIAL_EVENTS,
} from "@/lib/finance";

export function usePayments() {
  const { user, displayName } = useAuth();
  const queryClient = useQueryClient();

  /**
   * Process a merchant recharge/deposit
   * Creates transaction, receipt, and emits financial events
   */
  const processRechargeMutation = useMutation({
    mutationFn: async (data: MerchantRechargeData): Promise<MerchantRechargeResult> => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      // Emit recharge initiated event
      await emitFinancialEvent(
        createFinancialEvent({
          event_type: FINANCIAL_EVENTS.MERCHANT_RECHARGE_INITIATED,
          actor: "admin",
          actor_id: user.id,
          reference_type: "recharge",
          reference_id: null,
          amount: data.amount,
          status: "pending" as FinancialStatus,
          metadata: {
            merchant_id: data.merchant_id,
            store_name: data.store_name,
          },
        })
      );

      try {
        // Insert recharge transaction
        const { data: txData, error: txError } = await supabase
          .from("merchant_wallet_transactions")
          .insert({
            user_id: data.merchant_id,
            tipo: "recarga",
            valor: data.amount,
            descricao: data.observation || "Recarga via pagamento externo",
            referencia_id: null,
          })
          .select()
          .single();

        if (txError) throw txError;

        // Get updated balance
        const { data: balanceData } = await supabase.rpc("get_merchant_wallet_balance", {
          _user_id: data.merchant_id,
        });
        const newBalance = balanceData?.[0]?.saldo_disponivel || 0;

        // Create payment receipt
        const { data: receiptData, error: receiptError } = await supabase
          .from("payment_receipts")
          .insert({
            receipt_type: "merchant_recharge",
            user_id: data.merchant_id,
            amount: data.amount,
            payment_method: data.payment_method,
            payment_date: new Date().toISOString(),
            paid_by: user.id,
            details: {
              store_name: data.store_name,
              store_email: data.store_email,
              observation: data.observation,
              new_balance: newBalance,
              paid_by_name: displayName || "Administrador",
              transaction_id: txData.id,
            },
          })
          .select()
          .single();

        if (receiptError) {
          console.error("[usePayments] Receipt creation failed:", receiptError);
        }

        // Emit recharge completed event
        await emitFinancialEvent(
          createFinancialEvent({
            event_type: FINANCIAL_EVENTS.MERCHANT_RECHARGE_COMPLETED,
            actor: "admin",
            actor_id: user.id,
            reference_type: "recharge",
            reference_id: txData.id,
            amount: data.amount,
            status: "paid" as FinancialStatus,
            metadata: {
              merchant_id: data.merchant_id,
              new_balance: newBalance,
              receipt_id: receiptData?.id,
              receipt_hash: receiptData?.receipt_hash,
            },
          })
        );

        // Emit receipt generated event
        if (receiptData) {
          await emitFinancialEvent(
            createReceiptEvent({
              receipt_type: "merchant_recharge",
              receipt_id: receiptData.id,
              receipt_hash: receiptData.receipt_hash,
              user_id: data.merchant_id,
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
          new_balance: newBalance,
        };
      } catch (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-merchant-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["merchant-wallet-balance"] });
      queryClient.invalidateQueries({ queryKey: ["merchant-wallet-transactions"] });
      toast.success("Recarga registrada com sucesso!");
    },
    onError: (error) => {
      console.error("[usePayments] Error:", error);
      toast.error("Erro ao registrar recarga");
    },
  });

  /**
   * Reserve payment for a pending delivery
   * Locks merchant funds until delivery completion
   */
  const reserveDeliveryPayment = async (
    merchantId: string,
    deliveryId: string,
    amount: number
  ): Promise<boolean> => {
    // Emit reservation event
    await emitFinancialEvent(
      createFinancialEvent({
        event_type: FINANCIAL_EVENTS.MERCHANT_PAYMENT_RESERVED,
        actor: "system",
        actor_id: null,
        reference_type: "delivery",
        reference_id: deliveryId,
        amount: amount,
        status: "pending" as FinancialStatus,
        metadata: { merchant_id: merchantId },
      })
    );

    const { data, error } = await supabase.rpc("reserve_delivery_payment", {
      _user_id: merchantId,
      _delivery_id: deliveryId,
      _amount: amount,
    });

    if (error) {
      console.error("[usePayments] Reserve failed:", error);
      return false;
    }

    return data === true;
  };

  /**
   * Confirm delivery payment - transfer from merchant to motoboy
   */
  const confirmDeliveryPayment = async (deliveryId: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc("confirm_delivery_payment", {
      _delivery_id: deliveryId,
    });

    if (error) {
      console.error("[usePayments] Confirm failed:", error);
      return false;
    }

    // Emit confirmation event
    await emitFinancialEvent(
      createFinancialEvent({
        event_type: FINANCIAL_EVENTS.MERCHANT_PAYMENT_CONFIRMED,
        actor: "system",
        actor_id: null,
        reference_type: "delivery",
        reference_id: deliveryId,
        amount: 0, // Amount is in the database
        status: "paid" as FinancialStatus,
        metadata: {},
      })
    );

    return data === true;
  };

  /**
   * Cancel delivery reservation - refund merchant
   */
  const cancelDeliveryReservation = async (deliveryId: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc("cancel_delivery_reservation", {
      _delivery_id: deliveryId,
    });

    if (error) {
      console.error("[usePayments] Cancel failed:", error);
      return false;
    }

    // Emit cancellation event
    await emitFinancialEvent(
      createFinancialEvent({
        event_type: FINANCIAL_EVENTS.MERCHANT_PAYMENT_CANCELLED,
        actor: "system",
        actor_id: null,
        reference_type: "delivery",
        reference_id: deliveryId,
        amount: 0,
        status: "refunded" as FinancialStatus,
        metadata: {},
      })
    );

    return data === true;
  };

  return {
    processRecharge: processRechargeMutation.mutateAsync,
    isProcessingRecharge: processRechargeMutation.isPending,
    reserveDeliveryPayment,
    confirmDeliveryPayment,
    cancelDeliveryReservation,
  };
}
