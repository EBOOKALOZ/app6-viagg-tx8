/**
 * useAdvertiserLeadsDashboard
 *
 * Hook unificado para o painel de leads + créditos do anunciante.
 * Consome:
 *   - get_my_advertiser_credit_dashboard() → saldo, consumo, leads stats, últimas compras
 *   - get_advertiser_pending_contact_summary() → badge rápido
 *   - advertiser_contact_intentions → lista de leads com realtime
 *   - unlock_advertiser_contact_intention → débito seguro via RPC
 *
 * 100% backend-driven: nenhum cálculo de saldo no frontend.
 */

import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { revealContact } from "@/lib/credits/unlockContact";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CreditDashboard {
  available_credits: number;
  consumed_credits: number;
  leads_pending: number;
  leads_unlocked: number;
  leads_expired: number;
  recent_purchases: PurchaseHistoryItem[];
}

export interface PurchaseHistoryItem {
  id: string;
  package_id: string;
  package_name: string;
  credits_total: number;
  amount_brl: number;
  payment_status: PurchaseStatusType;
  provider_name: string | null;
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
  checkout_payload: CheckoutPayload;
}

export interface CheckoutPayload {
  pix_copia_cola?: string;
  pix_qr_code_base64?: string;
  pix_expiration?: string;
  checkout_url?: string;
  instructions?: string;
}

export type PurchaseStatusType =
  | "pending"
  | "awaiting_payment"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired";

export interface PendingSummary {
  pending_count: number;
  credits_needed: number;
  available_credits: number;
  has_enough_balance: boolean;
}

export interface LeadItem {
  id: string;
  created_at: string;
  listing_module: "real_estate" | "vehicles";
  listing_id: string;
  interest_type: string;
  status: "pending_unlock" | "unlocked" | "expired" | "cancelled";
  masked_preview: string | null;
  visitor_name: string | null;
  visitor_phone: string | null;
  visitor_message: string | null;
  city: string | null;
  region: string | null;
  credits_cost: number;
  unlock_paid_at: string | null;
}

// ─── Hook Principal ───────────────────────────────────────────────────────────

export function useAdvertiserLeadsDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Dashboard completo (saldo + stats + compras recentes) ──────────────────
  const dashboardQuery = useQuery({
    queryKey: ["advertiser-leads-dashboard", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30_000,
    queryFn: async (): Promise<CreditDashboard> => {
      const { data, error } = await supabase.rpc(
        "get_my_advertiser_credit_dashboard" as unknown
      );
      const result = data as unknown;
      if (error || !result?.success) {
        return {
          available_credits: 0,
          consumed_credits: 0,
          leads_pending: 0,
          leads_unlocked: 0,
          leads_expired: 0,
          recent_purchases: [],
        };
      }
      return {
        available_credits: result.available_credits ?? 0,
        consumed_credits: result.consumed_credits ?? 0,
        leads_pending: result.leads_pending ?? 0,
        leads_unlocked: result.leads_unlocked ?? 0,
        leads_expired: result.leads_expired ?? 0,
        recent_purchases: (result.recent_purchases ?? []) as PurchaseHistoryItem[],
      };
    },
  });

  // ── Resumo rápido (para badge no header da aba) ────────────────────────────
  const summaryQuery = useQuery({
    queryKey: ["advertiser-pending-summary", user?.id],
    enabled: !!user?.id,
    refetchInterval: 20_000,
    queryFn: async (): Promise<PendingSummary> => {
      const { data } = await supabase.rpc(
        "get_advertiser_pending_contact_summary" as unknown
      );
      const r = data as unknown;
      return {
        pending_count: r?.pending_count ?? 0,
        credits_needed: r?.credits_needed ?? 0,
        available_credits: r?.available_credits ?? 0,
        has_enough_balance: r?.has_enough_balance ?? false,
      };
    },
  });

  // ── Lista de leads ─────────────────────────────────────────────────────────
  const leadsQuery = useQuery({
    queryKey: ["advertiser-leads-list", user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async (): Promise<LeadItem[]> => {
      const { data, error } = await (supabase.from("advertiser_contact_intentions") as unknown)
        .select("*")
        .eq("advertiser_user_id", user!.id)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as LeadItem[];
    },
  });

  // ── Realtime: novo lead ou unlock → invalida todas as queries ──────────────
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`leads-dashboard-rt-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "advertiser_contact_intentions",
        filter: `advertiser_user_id=eq.${user.id}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["advertiser-leads-dashboard", user.id] });
        queryClient.invalidateQueries({ queryKey: ["advertiser-pending-summary", user.id] });
        queryClient.invalidateQueries({ queryKey: ["advertiser-leads-list", user.id] });
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "advertiser_credit_purchases",
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["advertiser-leads-dashboard", user.id] });
        queryClient.invalidateQueries({ queryKey: ["advertiser-credits"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  // ── Unlock via Carteira de Créditos (Wallet Core) ──────────────────────────
  //  Rota ÚNICA: wallet_unlock_contact (2% do valor anunciado, permanente).
  //  Resolve módulo/anúncio/comprador a partir da própria intenção.
  const unlockLead = useCallback(
    async (intentionId: string): Promise<{
      success: boolean;
      error?: string;
      credits_charged?: number;
      buy_credits_cta?: boolean;
      required?: number;
      available?: number;
    }> => {
      // P0/LGPD: porta única — buyer_key derivado no servidor; telefone só volta
      // da RPC wallet_reveal_contact após a autorização financeira.
      const r = await revealContact(intentionId);

      if (!r.success) {
        queryClient.invalidateQueries({ queryKey: ["advertiser-leads-dashboard", user?.id] });
        return {
          success: false,
          error: r.error,
          buy_credits_cta: r.buy_credits_cta ?? (r.error === "insufficient_credits"),
          required: r.required_cents != null ? r.required_cents / 100 : undefined,
          available: r.available_cents != null ? r.available_cents / 100 : undefined,
        };
      }

      // Marca a intenção como desbloqueada (best-effort) para refletir na UI
      try {
        await (supabase.from("advertiser_contact_intentions") as unknown)
          .update({ status: "unlocked", unlock_paid_at: new Date().toISOString() })
          .eq("id", intentionId);
      } catch { /* RLS/estado — não bloqueia o desbloqueio já pago */ }

      queryClient.invalidateQueries({ queryKey: ["advertiser-leads-dashboard", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["advertiser-pending-summary", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["advertiser-leads-list", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["advertiser-credits"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-balance", user?.id] });

      return { success: true, credits_charged: r.charged_cents != null ? r.charged_cents / 100 : 0 };
    },
    [user?.id, queryClient]
  );

  // ── Poll status de compra específica ──────────────────────────────────────
  const pollPurchaseStatus = useCallback(
    async (purchaseId: string): Promise<PurchaseStatusType | null> => {
      const { data, error } = await (supabase.from("advertiser_credit_purchases") as unknown)
        .select("payment_status, checkout_payload, paid_at")
        .eq("id", purchaseId)
        .maybeSingle();

      if (error || !data) return null;

      if (data.payment_status === "paid") {
        queryClient.invalidateQueries({ queryKey: ["advertiser-leads-dashboard", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["advertiser-credits"] });
      }

      return data.payment_status as PurchaseStatusType;
    },
    [user?.id, queryClient]
  );

  const dashboard = dashboardQuery.data ?? {
    available_credits: 0, consumed_credits: 0,
    leads_pending: 0, leads_unlocked: 0, leads_expired: 0,
    recent_purchases: [],
  };

  const summary = summaryQuery.data ?? {
    pending_count: 0, credits_needed: 0,
    available_credits: 0, has_enough_balance: false,
  };

  return {
    // Dashboard aggregado
    dashboard,
    dashboardLoading: dashboardQuery.isLoading,

    // Resumo rápido
    summary,
    summaryLoading: summaryQuery.isLoading,

    // Lista de leads
    leads: leadsQuery.data ?? [],
    leadsLoading: leadsQuery.isLoading,

    // Actions
    unlockLead,
    pollPurchaseStatus,

    // Invalidação manual (para após compra confirmada)
    refetchAll: () => {
      queryClient.invalidateQueries({ queryKey: ["advertiser-leads-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["advertiser-pending-summary"] });
      queryClient.invalidateQueries({ queryKey: ["advertiser-leads-list"] });
    },
  };
}

// ─── Status labels e cores ────────────────────────────────────────────────────

export const PURCHASE_STATUS_CONFIG: Record<PurchaseStatusType, {
  label: string;
  color: string;
  bgColor: string;
  dot: string;
}> = {
  pending:          { label: "Aguardando",           color: "text-zinc-500",    bgColor: "bg-zinc-100",     dot: "bg-zinc-400" },
  awaiting_payment: { label: "Aguardando Pagamento",  color: "text-amber-700",   bgColor: "bg-amber-50",     dot: "bg-amber-500" },
  paid:             { label: "Pago ✓",               color: "text-emerald-700", bgColor: "bg-emerald-50",   dot: "bg-emerald-500" },
  failed:           { label: "Falhou",                color: "text-red-600",     bgColor: "bg-red-50",       dot: "bg-red-500" },
  cancelled:        { label: "Cancelado",             color: "text-zinc-400",    bgColor: "bg-zinc-50",      dot: "bg-zinc-300" },
  expired:          { label: "Expirado",              color: "text-zinc-400",    bgColor: "bg-zinc-50",      dot: "bg-zinc-300" },
};

export const INTEREST_TYPE_CONFIG: Record<string, { label: string; icon: string }> = {
  whatsapp_click:  { label: "WhatsApp",    icon: "💬" },
  message_request: { label: "Mensagem",    icon: "✉️" },
  proposal:        { label: "Proposta",    icon: "📋" },
  view_contact:    { label: "Ver Contato", icon: "👁️" },
};
