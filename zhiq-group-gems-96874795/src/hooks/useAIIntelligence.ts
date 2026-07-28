/**
 * useAIIntelligence — Inteligência comercial: planos, assinaturas, campanhas, financeiro.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AIIntelligenceData {
  planos: unknown[];
  assinaturas: {
    ativas:     number;
    canceladas: number;
    expiradas:  number;
    mrr_brl:    number;
  };
  pacotes: unknown[];
  campanhas: {
    ativas:      number;
    finalizadas: number;
    agendadas:   number;
    pausadas:    number;
    detalhes: unknown[];
  };
  financeiro: {
    receita_total:         number;
    receita_por_plano:     Record<string, number>;
    receita_por_pacote:    Record<string, number>;
    receita_por_assinatura: number;
  };
  is_loading: boolean;
}

// Alias legado
export type GLMIntelligenceData = AIIntelligenceData;

export function useAIIntelligence() {
  const query = useQuery({
    queryKey: ["ai-intelligence-data"],
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async (): Promise<AIIntelligenceData> => {
      const { data: realEstatePackagesRaw } = await (supabase.from("real_estate_credit_packages") as unknown).select("*").order("sort_order", { ascending: true });
      const { data: creditPackagesRaw }     = await (supabase.from("credit_packages") as unknown).select("*").order("created_at", { ascending: true });

      const allPackages = [...(realEstatePackagesRaw || []), ...(creditPackagesRaw || [])];
      const planos  = allPackages.filter(p => p.interval === "mensal" || p.name?.toLowerCase().includes("plano") || p.title?.toLowerCase().includes("plano"));
      const pacotes = allPackages.filter(p => !planos.includes(p));

      const { data: subscriptionsRaw } = await (supabase.from("merchant_credit_subscriptions") as unknown).select("id, package_id, status, current_period_end, amount_brl").limit(5000);
      const subs = subscriptionsRaw || [];
      const assinaturasAtivas     = subs.filter((s: unknown) => s.status === "active");
      const assinaturasCanceladas = subs.filter((s: unknown) => s.status === "canceled");
      const assinaturasExpiradas  = subs.filter((s: unknown) => s.status === "expired" || (s.current_period_end && new Date(s.current_period_end) < new Date()));
      const mrr = assinaturasAtivas.reduce((acc: number, s: unknown) => acc + Number(s.amount_brl || 0), 0);

      const { data: campaignsRaw } = await (supabase.from("merchant_campaigns") as unknown).select("id, name, status, budget_brl, spent_brl, start_date, end_date").limit(5000);
      const camps = campaignsRaw || [];

      const { data: purchasesRaw } = await (supabase.from("real_estate_credit_purchases") as unknown).select("id, package_id, amount_brl, category").limit(10000);
      const purchases = purchasesRaw || [];
      let receitaTotal = 0;
      const receitaPorPlano: Record<string, number>  = {};
      const receitaPorPacote: Record<string, number> = {};
      purchases.forEach((p: unknown) => {
        const amount  = Number(p.amount_brl || 0);
        receitaTotal += amount;
        const isPlano = planos.some((pl: unknown) => pl.id === p.package_id);
        (isPlano ? receitaPorPlano : receitaPorPacote)[p.package_id] = ((isPlano ? receitaPorPlano : receitaPorPacote)[p.package_id] || 0) + amount;
      });

      return {
        planos,
        assinaturas: { ativas: assinaturasAtivas.length, canceladas: assinaturasCanceladas.length, expiradas: assinaturasExpiradas.length, mrr_brl: mrr },
        pacotes,
        campanhas: {
          ativas:      camps.filter((c: unknown) => c.status === "active").length,
          finalizadas: camps.filter((c: unknown) => ["completed","finished"].includes(c.status)).length,
          agendadas:   camps.filter((c: unknown) => ["scheduled","pending"].includes(c.status)).length,
          pausadas:    camps.filter((c: unknown) => ["paused","idle"].includes(c.status)).length,
          detalhes:    camps,
        },
        financeiro: { receita_total: receitaTotal, receita_por_plano: receitaPorPlano, receita_por_pacote: receitaPorPacote, receita_por_assinatura: mrr },
        is_loading: false,
      };
    },
  });

  return { data: query.data, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch };
}

/** Alias legado */
export const useGLMIntelligence = useAIIntelligence;
