/**
 * useAdvertiserCreditPurchase
 *
 * Gerencia o fluxo de COMPRA REAL de créditos do anunciante.
 *
 * REGRAS:
 *  - Nenhum crédito entra no saldo sem confirm_advertiser_credit_purchase (backend/webhook)
 *  - O frontend apenas INICIA o pedido via create_advertiser_credit_purchase
 *  - Polling de status da compra → painel atualiza badge quando pago
 *
 * Exporta:
 *  - useAdvertiserCreditPackages → lista pacotes disponíveis
 *  - useAdvertiserCreditPurchase → hook completo (início + tracking)
 *  - useAdvertiserPurchaseHistory → histórico de compras do anunciante
 */

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AdvertiserCreditPackage {
  id: string;
  name: string;
  slug: string;
  package_type: "avulso" | "mensal" | "semestral" | "anual";
  credits_base: number;
  credits_bonus: number;
  credits_total: number;
  price_brl: number;
  description: string | null;
  badge_text: string | null;
  features: string[];
  is_featured: boolean;
  is_active: boolean;
  sort_order: number;
}

export type PurchaseStatus =
  | "pending"
  | "awaiting_payment"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired";

export interface AdvertiserCreditPurchase {
  id: string;
  package_id: string;
  credits_total: number;
  amount_brl: number;
  payment_status: PurchaseStatus;
  provider_name: string | null;
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
}

// ─── Hook: Pacotes disponíveis ────────────────────────────────────────────────

export function useAdvertiserCreditPackages() {
  return useQuery({
    queryKey: ["advertiser-credit-packages"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await (supabase.from("advertiser_credit_packages") as any)
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;

      return (data || []).map((p: any): AdvertiserCreditPackage => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        package_type: p.package_type,
        credits_base: p.credits_base,
        credits_bonus: p.credits_bonus,
        credits_total: p.credits_total,
        price_brl: Number(p.price_brl),
        description: p.description,
        badge_text: p.badge_text,
        features: Array.isArray(p.features) ? p.features : [],
        is_featured: p.is_featured,
        is_active: p.is_active,
        sort_order: p.sort_order,
      }));
    },
  });
}

// ─── Hook: Histórico de compras do anunciante ─────────────────────────────────

export function useAdvertiserPurchaseHistory() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["advertiser-purchase-history", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      // Resolve account first
      const { data: account } = await (supabase.from("advertiser_accounts") as any)
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (!account) return [];

      const { data, error } = await (supabase.from("advertiser_credit_purchases") as any)
        .select("id, package_id, credits_total, amount_brl, payment_status, provider_name, created_at, paid_at, expires_at")
        .eq("advertiser_account_id", account.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as AdvertiserCreditPurchase[];
    },
  });
}

// ─── Hook: Iniciar compra ─────────────────────────────────────────────────────

export function useAdvertiserCreditPurchase() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);

  /**
   * initiatePurchase
   * Chama create_advertiser_credit_purchase (RPC SECURITY DEFINER).
   * Retorna o purchase_id para redirecionar ao gateway de pagamento.
   * NUNCA lança créditos — apenas cria o pedido.
   */
  const initiatePurchase = useCallback(
    async (packageId: string): Promise<{
      success: boolean;
      purchaseId?: string;
      amountBrl?: number;
      creditsTotal?: number;
      pix_copia_cola?: string;
      pix_qr_code_base64?: string;
      checkout_url?: string;
      pix_expiration?: string;
      error?: string;
    }> => {
      if (!user?.id) return { success: false, error: "not_authenticated" };

      setIsCreating(true);
      try {
        const { data: rpcResult, error } = await supabase.rpc(
          "create_advertiser_credit_purchase" as any,
          { p_package_id: packageId }
        );

        const result = rpcResult as any;

        if (error || !result?.success) {
          return {
            success: false,
            error: result?.error || error?.message || "unknown",
          };
        }

        // Cobrança REAL no Mercado Pago. O webhook, ao confirmar, chama
        // pay_grant_legacy → credita o saldo do anunciante e marca paid.
        const { data: charge, error: chargeErr } = await supabase.functions.invoke(
          "payments-charge",
          {
            body: {
              payer_owner_type: "platform",
              payer_owner_id: null,
              account_type: "platform_main",
              amount_cents: Math.round(Number(result.amount_brl || 0) * 100),
              method: "pix",
              description: `Créditos anunciante: ${result.package_name ?? "pacote"}`,
              reference_type: "advertiser_credit_purchase",
              reference_id: result.purchase_id,
              product_type: "advertiser_credits",
              metadata: {
                grant_kind: "advertiser",
                advertiser_purchase_id: result.purchase_id,
              },
            },
          },
        );
        if (chargeErr || !charge?.ok) {
          return {
            success: false,
            error: charge?.error || chargeErr?.message || "falha no gateway",
          };
        }

        // Invalida histórico de compras para mostrar o pedido recente
        queryClient.invalidateQueries({ queryKey: ["advertiser-purchase-history"] });

        return {
          success: true,
          purchaseId: result.purchase_id,
          amountBrl: result.amount_brl,
          creditsTotal: result.credits_total,
          pix_copia_cola: charge.pix_copy_paste ?? undefined,
          pix_qr_code_base64: charge.pix_qr_base64 ?? undefined,
          checkout_url: charge.checkout_url ?? undefined,
          pix_expiration: charge.expires_at ?? undefined,
        };
      } finally {
        setIsCreating(false);
      }
    },
    [user?.id, queryClient]
  );

  /**
   * pollPurchaseStatus
   * Verifica o status de uma compra específica.
   * Útil após retorno de gateway de pagamento.
   */
  const pollPurchaseStatus = useCallback(
    async (purchaseId: string): Promise<PurchaseStatus | null> => {
      const { data, error } = await (supabase.from("advertiser_credit_purchases") as any)
        .select("payment_status")
        .eq("id", purchaseId)
        .maybeSingle();

      if (error || !data) return null;

      if (data.payment_status === "paid") {
        // Invalida saldo para atualizar painel
        queryClient.invalidateQueries({ queryKey: ["advertiser-credits"] });
        queryClient.invalidateQueries({ queryKey: ["advertiser-purchase-history"] });
      }

      return data.payment_status as PurchaseStatus;
    },
    [queryClient]
  );

  return {
    initiatePurchase,
    pollPurchaseStatus,
    isCreating,
  };
}

// ─── Helpers de exibição ──────────────────────────────────────────────────────

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  pending:          "Aguardando",
  awaiting_payment: "Pagamento Pendente",
  paid:             "Pago ✓",
  failed:           "Falhou",
  cancelled:        "Cancelado",
  expired:          "Expirado",
};

export const PURCHASE_STATUS_COLORS: Record<PurchaseStatus, string> = {
  pending:          "bg-zinc-100 text-zinc-600",
  awaiting_payment: "bg-amber-50 text-amber-700",
  paid:             "bg-emerald-50 text-emerald-700",
  failed:           "bg-red-50 text-red-600",
  cancelled:        "bg-zinc-100 text-zinc-500",
  expired:          "bg-zinc-100 text-zinc-500",
};
