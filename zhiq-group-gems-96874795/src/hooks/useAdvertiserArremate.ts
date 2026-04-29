/**
 * useAdvertiserArremate — Ofertas de arremate recebidas pelo anunciante
 *
 * Diferença do useArremate: resolve listings via owner_user_id
 * em vez de merchant_stores.store_id
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { ArremateOffer } from "./useArremate";

export type { ArremateOffer };

function normalizeOffer(raw: any): ArremateOffer {
  return {
    ...raw,
    listing_id: raw.arremate_listing_id,
    amount_cents: Math.round((raw.offer_amount || 0) * 100),
    message: raw.note,
  };
}

export function useAdvertiserArremate() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Ofertas recebidas nos listings do anunciante ──
  const {
    data: receivedOffers = [],
    isLoading: loadingOffers,
    refetch: refetchOffers,
  } = useQuery({
    queryKey: ["advertiser-arremate-offers", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Listings owned by this advertiser (arremate type)
      const { data: listings } = await (supabase.from("auction_listings") as any)
        .select("id")
        .eq("owner_user_id", user.id)
        .eq("listing_type", "arremate");

      if (!listings?.length) return [];
      const listingIds = listings.map((l: any) => l.id);

      const { data, error } = await supabase
        .from("arremate_offers")
        .select("*")
        .in("arremate_listing_id", listingIds)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []).map(normalizeOffer);
    },
    enabled: !!user?.id,
  });

  // ── Responder oferta (sem débito de créditos — use acceptArremateOfferWithCredits) ──
  const respondOffer = useMutation({
    mutationFn: async ({ offerId, accept, message }: {
      offerId: string; accept: boolean; message?: string;
    }) => {
      const { data, error } = await supabase.rpc("respond_arremate_offer" as any, {
        p_offer_id: offerId,
        p_accept: accept,
        p_response_message: message || null,
      });
      if (error) throw error;
      const result = data as any;
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.accept ? "Oferta aceita! 🎉" : "Oferta recusada");
      queryClient.invalidateQueries({ queryKey: ["advertiser-arremate-offers"] });
      queryClient.invalidateQueries({ queryKey: ["advertiser-auction-listings"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao responder oferta");
    },
  });

  return { receivedOffers, loadingOffers, refetchOffers, respondOffer };
}
