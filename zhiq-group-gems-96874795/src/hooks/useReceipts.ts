/**
 * useReceipts - Centralized hook for receipt operations
 * 
 * Handles receipt fetching, generation, and validation.
 * All receipts are generated from financial events.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { ReceiptType, ReceiptResult } from "@/lib/finance";

interface Receipt {
  id: string;
  receipt_type: string;
  user_id: string;
  amount: number;
  payment_method: string | null;
  payment_date: string;
  paid_by: string | null;
  period_start: string | null;
  period_end: string | null;
  details: Record<string, unknown>;
  receipt_hash: string;
  created_at: string;
}

export function useReceipts(options?: { type?: ReceiptType; limit?: number }) {
  const { user } = useAuth();
  const { type, limit = 50 } = options || {};

  /**
   * Fetch user's receipts
   */
  const receiptsQuery = useQuery({
    queryKey: ["receipts", user?.id, type, limit],
    queryFn: async (): Promise<Receipt[]> => {
      if (!user?.id) return [];

      let query = supabase
        .from("payment_receipts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (type) {
        query = query.eq("receipt_type", type);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[useReceipts] Error fetching receipts:", error);
        return [];
      }

      return data as Receipt[];
    },
    enabled: !!user?.id,
  });

  /**
   * Fetch a single receipt by ID
   */
  const fetchReceiptById = async (receiptId: string): Promise<Receipt | null> => {
    const { data, error } = await supabase
      .from("payment_receipts")
      .select("*")
      .eq("id", receiptId)
      .single();

    if (error) {
      console.error("[useReceipts] Error fetching receipt:", error);
      return null;
    }

    return data as Receipt;
  };

  /**
   * Fetch a receipt by hash (for validation)
   */
  const fetchReceiptByHash = async (hash: string): Promise<Receipt | null> => {
    const { data, error } = await supabase
      .from("payment_receipts")
      .select("*")
      .eq("receipt_hash", hash)
      .single();

    if (error) {
      console.error("[useReceipts] Error fetching receipt by hash:", error);
      return null;
    }

    return data as Receipt;
  };

  /**
   * Validate receipt authenticity by hash
   */
  const validateReceipt = async (hash: string): Promise<boolean> => {
    const receipt = await fetchReceiptByHash(hash);
    return receipt !== null;
  };

  return {
    receipts: receiptsQuery.data || [],
    isLoading: receiptsQuery.isLoading,
    refetch: receiptsQuery.refetch,
    fetchReceiptById,
    fetchReceiptByHash,
    validateReceipt,
  };
}

/**
 * Admin hook for fetching all receipts
 */
export function useAdminReceipts(options?: { 
  type?: ReceiptType; 
  limit?: number;
  startDate?: Date;
  endDate?: Date;
}) {
  const { type, limit = 100, startDate, endDate } = options || {};

  const receiptsQuery = useQuery({
    queryKey: ["admin-receipts", type, limit, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async (): Promise<Receipt[]> => {
      let query = supabase
        .from("payment_receipts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (type) {
        query = query.eq("receipt_type", type);
      }

      if (startDate) {
        query = query.gte("created_at", startDate.toISOString());
      }

      if (endDate) {
        query = query.lte("created_at", endDate.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        console.error("[useAdminReceipts] Error fetching receipts:", error);
        return [];
      }

      return data as Receipt[];
    },
  });

  return {
    receipts: receiptsQuery.data || [],
    isLoading: receiptsQuery.isLoading,
    refetch: receiptsQuery.refetch,
  };
}
