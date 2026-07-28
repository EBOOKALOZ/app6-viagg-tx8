import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PlatformBankAccount } from "@/skills/pay/payTypes";
import { REFETCH_INTERVAL_SLOW_MS } from "@/skills/pay/payConstants";

// ═══════════════════════════════════════════════════════
// Platform Bank Accounts — List
// ═══════════════════════════════════════════════════════
export function usePayPlatformBankAccounts() {
  return useQuery({
    queryKey: ["pay-platform-bank-accounts"],
    queryFn: async (): Promise<PlatformBankAccount[]> => {
      const { data, error } = await (supabase.from("external_bank_accounts") as unknown)
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching bank accounts:", error);
        return [];
      }

      return (data || []).map((a: unknown) => ({
        id: a.id,
        user_id: a.user_id || "",
        owner_type: a.owner_type || "platform",
        account_type: a.account_type === "business" ? "business" : "personal",
        account_label: a.account_label || a.bank_name || "Sem nome",
        bank_code: a.bank_code || null,
        bank_name: a.bank_name || null,
        branch: a.branch || a.branch_number || null,
        account_number: a.account_number || null,
        account_digit: a.account_digit || null,
        pix_key: a.pix_key || a.pix_key_value || null,
        pix_key_type: a.pix_key_type || null,
        holder_name: a.holder_name || a.legal_holder_name || null,
        holder_document: a.holder_document || a.legal_holder_document || null,
        is_default: a.is_default ?? false,
        is_active: a.is_active ?? true,
        metadata: a.metadata || null,
        created_at: a.created_at,
        updated_at: a.updated_at || null,
      }));
    },
    refetchInterval: REFETCH_INTERVAL_SLOW_MS,
  });
}

// ═══════════════════════════════════════════════════════
// Create Bank Account
// ═══════════════════════════════════════════════════════
export function useCreateBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (account: Partial<PlatformBankAccount>) => {
      const { data, error } = await (supabase.from("external_bank_accounts") as unknown)
        .insert({
          account_label: account.account_label,
          account_type: account.account_type || "personal",
          bank_name: account.bank_name,
          bank_code: account.bank_code,
          branch: account.branch,
          account_number: account.account_number,
          account_digit: account.account_digit,
          pix_key: account.pix_key,
          pix_key_type: account.pix_key_type,
          holder_name: account.holder_name,
          holder_document: account.holder_document,
          is_default: account.is_default ?? false,
          is_active: true,
          owner_type: "platform",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pay-platform-bank-accounts"] }),
  });
}

// ═══════════════════════════════════════════════════════
// Update Bank Account
// ═══════════════════════════════════════════════════════
export function useUpdateBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<PlatformBankAccount>) => {
      const { error } = await (supabase.from("external_bank_accounts") as unknown)
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pay-platform-bank-accounts"] }),
  });
}

// ═══════════════════════════════════════════════════════
// Toggle Default Account
// ═══════════════════════════════════════════════════════
export function useSetDefaultBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string) => {
      // Unset all defaults first
      await (supabase.from("external_bank_accounts") as unknown)
        .update({ is_default: false })
        .eq("is_default", true);
      // Set the new default
      const { error } = await (supabase.from("external_bank_accounts") as unknown)
        .update({ is_default: true })
        .eq("id", accountId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pay-platform-bank-accounts"] }),
  });
}

// ═══════════════════════════════════════════════════════
// Toggle Active/Inactive
// ═══════════════════════════════════════════════════════
export function useToggleBankAccountActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase.from("external_bank_accounts") as unknown)
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pay-platform-bank-accounts"] }),
  });
}
