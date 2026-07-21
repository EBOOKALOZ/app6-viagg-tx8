/**
 * useAdvertiserCredits â€” CrÃ©ditos para anunciantes
 *
 * Fonte de verdade compartilhada com o painel admin/lojista:
 *   - merchant_credit_products    â†’ pacotes de planos (admin configura)
 *   - merchant_credit_usage_rules â†’ custo por evento (admin configura)
 *   - credit_packages             â†’ pacotes extras (admin configura)
 *
 * Tabelas exclusivas do anunciante:
 *   - advertiser_credit_balances  â†’ saldo do anunciante
 *   - advertiser_credit_ledger    â†’ histÃ³rico de dÃ©bitos/crÃ©ditos
 *
 * MudanÃ§as no admin (preÃ§o, nome, benefÃ­cios de pacotes)
 * refletem automaticamente aqui â€” sem config manual.
 */
import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { CreditProduct, UsageRule, CreditPackage } from "./useMerchantCredits";

export type { CreditProduct, UsageRule, CreditPackage };

export interface AdvertiserCreditBalance {
  available_credits: number;
  consumed_credits: number;
}

// â”€â”€â”€ Hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function useAdvertiserCredits() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [advertiserAccountId, setAdvertiserAccountId] = useState<string | null>(null);

  // Resolve advertiser_account_id from advertiser_accounts
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const { data } = await (supabase.from("advertiser_accounts") as any)
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data) setAdvertiserAccountId(data.id);
      } catch { /* no account */ }
    })();
  }, [user?.id]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["advertiser-credits", advertiserAccountId],
    enabled: !!advertiserAccountId,
    refetchInterval: 30_000,
    queryFn: async () => {
      // 1. Planos â€” mesma fonte do painel admin (merchant_credit_products)
      const { data: productsData } = await (supabase.from("merchant_credit_products") as any)
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      const products: CreditProduct[] = (productsData || []).map((p: any) => {
        const creditsTotal = p.credits_total ?? p.credits_amount ?? ((p.credits_base || 0) + (p.credits_bonus || 0));
        const priceCents = p.price_cents ?? (p.price_brl ? Math.round(p.price_brl * 100) : 0);
        return {
          id: p.id,
          slug: p.slug,
          name: p.name,
          type: p.product_type || p.type,
          credits_base: p.credits_base || 0,
          credits_bonus: p.credits_bonus || 0,
          credits_total: creditsTotal,
          price_cents: priceCents,
          price_brl: p.price_brl,
          credits_amount: p.credits_amount,
          cost_per_credit_cents: p.cost_per_credit_cents ?? (creditsTotal > 0 ? Math.round(priceCents / creditsTotal) : 0),
          rollover_enabled: p.rollover_enabled ?? false,
          rollover_percent: p.rollover_percent ?? 0,
          is_recommended: p.is_recommended ?? false,
          is_active: p.is_active ?? true,
          sort_order: p.sort_order ?? 0,
          description: p.description,
          badge_text: p.badge_text,
          action_label: p.action_label ?? null,
          action_enabled: p.action_enabled ?? true,
          features_json: (() => {
            if (Array.isArray(p.features_json)) return p.features_json;
            if (typeof p.features_json === "string") {
              try { return JSON.parse(p.features_json); } catch { return []; }
            }
            return [];
          })(),
        };
      });

      // 2. Pacotes extras â€” mesma fonte do painel admin (credit_packages)
      let creditPackages: CreditPackage[] = [];
      try {
        const { data: pkgData } = await (supabase.from("credit_packages") as any)
          .select("*")
          .eq("is_active", true);
        if (pkgData) {
          creditPackages = pkgData.map((p: any) => ({
            id: p.id, slug: p.slug, name: p.name,
            package_type: p.package_type,
            credits_amount: p.credits_amount,
            price_brl: p.price_brl,
            reference_credit_value_brl: p.reference_credit_value_brl,
            active: p.is_active,
          }));
        }
      } catch { /* optional */ }

      // 3. Regras de uso â€” mesma fonte do painel admin (merchant_credit_usage_rules)
      const { data: rulesData } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("*")
        .eq("is_active", true);

      const usageRules: UsageRule[] = (rulesData || []).map((r: any) => ({
        feature_code: r.feature_code || "",
        module: r.module_name || r.module,
        event_type: r.event_type,
        credits_cost: Number(r.credits_cost) || 0,
        description: r.feature_name || r.description,
      }));

      // 4. Saldo da CARTEIRA ÚNICA (wallets) — fonte financeira única (1 crédito = R$ 1).
      //    available_credits vem em REAIS (balance_cents / 100); a antiga
      //    advertiser_credit_balances foi aposentada (FASE 2 Carteira de Créditos).
      let balance: AdvertiserCreditBalance = { available_credits: 0, consumed_credits: 0 };
      if (user?.id) {
        const { data: w } = await (supabase.from("wallets") as any)
          .select("balance_cents, reserved_cents")
          .eq("owner_uid", user.id)
          .maybeSingle();
        if (w) {
          balance = {
            available_credits: Number(w.balance_cents ?? 0) / 100,
            consumed_credits: Number(w.reserved_cents ?? 0) / 100,
          };
        }
      }

      // 5. Ledger (Ãºltimas 20 entradas)
      const { data: ledgerData } = await (supabase.from("advertiser_credit_ledger") as any)
        .select("*")
        .eq("advertiser_account_id", advertiserAccountId)
        .order("created_at", { ascending: false })
        .limit(50);

      return { products, creditPackages, usageRules, balance, ledger: ledgerData || [] };
    },
  });

  // Realtime: atualiza quando admin muda os pacotes
  useEffect(() => {
    const channel = supabase
      .channel("advertiser-credit-products-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "merchant_credit_products" }, () => {
        queryClient.invalidateQueries({ queryKey: ["advertiser-credits"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // â”€â”€ Aceitar oferta de arremate com dÃ©bito de crÃ©ditos â”€â”€
  const acceptArremateOfferWithCredits = useCallback(async (offerId: string): Promise<boolean> => {
    if (!advertiserAccountId) {
      const { toast } = await import("sonner");
      toast.error("Conta de anunciante nÃ£o encontrada.");
      return false;
    }

    const { data: rpcResult, error } = await supabase.rpc(
      "accept_arremate_offer_advertiser" as any,
      { p_offer_id: offerId, p_advertiser_account_id: advertiserAccountId }
    );

    const result = rpcResult as any;
    if (error || !result?.success) {
      const { toast } = await import("sonner");
      if (result?.error === "insufficient_credits") {
        toast.error(
          `CrÃ©ditos insuficientes! NecessÃ¡rio: ${result.required}. Saldo: ${result.available}.`,
          { action: { label: "Comprar crÃ©ditos", onClick: () => {} } }
        );
      } else {
        toast.error(`Erro: ${result?.error || error?.message || "desconhecido"}`);
      }
      return false;
    }

    const { toast } = await import("sonner");
    if (result.already_accepted) {
      toast.info("Oferta jÃ¡ aceita anteriormente.");
    } else {
      toast.success(`Oferta aceita! ${result.credits_charged} crÃ©ditos debitados.`);
    }
    refetch();
    return true;
  }, [advertiserAccountId, refetch]);

  /**
   * @deprecated BLINDADO â€” NÃƒO USE para desbloqueio de contatos.
   *
   * Esta funÃ§Ã£o escreve diretamente no banco via frontend, bypassando o
   * modelo de seguranÃ§a backend-driven. Para dÃ©bito de crÃ©ditos, sempre use:
   *   - unlock_advertiser_contact_intention (RPC SECURITY DEFINER) â†’ desbloqueio de lead
   *   - confirm_advertiser_credit_purchase (backend_admin/webhook) â†’ crÃ©dito de compra
   *
   * CrÃ©ditos de desbloqueio de contato NÃƒO passam por aqui.
   *
   * Esta funÃ§Ã£o Ã© mantida apenas para operaÃ§Ãµes legadas nÃ£o relacionadas a leads.
   * Para qualquer nova feature, implemente via RPC SECURITY DEFINER.
   */
  const debitCredits = useCallback(async (params: {
    amount: number;
    reasonCode: string;
    description: string;
  }): Promise<boolean> => {
    console.warn(
      "[useAdvertiserCredits] debitCredits estÃ¡ DEPRECATED e nÃ£o deve ser usado.\n" +
      "Use unlock_advertiser_contact_intention (RPC) para desbloqueio de leads.\n" +
      "Chamada bloqueada para seguranÃ§a."
    );
    // Bloqueio: retorna false sem executar nada
    return false;
  }, []);


  return {
    balance: data?.balance ?? { available_credits: 0, consumed_credits: 0 },
    products: data?.products ?? [],
    creditPackages: data?.creditPackages ?? [],
    usageRules: data?.usageRules ?? [],
    ledger: data?.ledger ?? [],
    isLoading,
    advertiserAccountId,
    refetch,
    acceptArremateOfferWithCredits,
    debitCredits,
  };
}

