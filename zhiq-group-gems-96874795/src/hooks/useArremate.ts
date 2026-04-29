/**
 * useArremate — Hook for arremate (buy-now / offer) flow
 *
 * Tables: auction_listings (type=arremate), arremate_offers
 * RPCs: submit_arremate_offer, respond_arremate_offer
 *
 * REAL DB columns (arremate_offers):
 *   arremate_listing_id, customer_user_id, offer_amount, note, status, quantity
 */
import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ─── Types (aligned with REAL DB schema) ──

export interface ArremateOffer {
  id: string;
  arremate_listing_id: string;
  customer_user_id: string;
  customer_name: string | null;
  customer_whatsapp: string | null;
  offer_amount: number;       // em reais (não centavos)
  quantity: number;
  note: string | null;
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
  created_at: string;
  updated_at: string | null;

  // Aliases for backward compatibility with OfferCard
  listing_id?: string;
  amount_cents?: number;
  message?: string | null;
}

// Helper to normalize offer to support both old/new field names
function normalizeOffer(raw: any): ArremateOffer {
  return {
    ...raw,
    // Aliases for components that use old field names
    listing_id: raw.arremate_listing_id,
    amount_cents: Math.round((raw.offer_amount || 0) * 100),
    message: raw.note,
  };
}

// ─── Hook ───────────────────────────────

export function useArremate() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Offers received for merchant's listings ──
  const {
    data: receivedOffers = [],
    isLoading: loadingOffers,
    refetch: refetchOffers,
  } = useQuery({
    queryKey: ["arremate-received-offers", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get merchant's store
      const { data: store } = await supabase
        .from("merchant_stores")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!store) return [];

      // Get merchant's arremate + auction listing IDs
      const { data: listings } = await supabase
        .from("auction_listings")
        .select("id")
        .eq("store_id", store.id)
        .eq("listing_type", "arremate");

      if (!listings?.length) return [];
      const listingIds = listings.map((l) => l.id);

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

  // ── My sent offers ──
  const {
    data: myOffers = [],
    isLoading: loadingMyOffers,
    refetch: refetchMyOffers,
  } = useQuery({
    queryKey: ["arremate-my-offers", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("arremate_offers")
        .select("*")
        .eq("customer_user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(normalizeOffer);
    },
    enabled: !!user?.id,
  });

  // ── Fetch offers for a specific listing ──
  const fetchListingOffers = useCallback(async (listingId: string) => {
    const { data, error } = await supabase
      .from("arremate_offers")
      .select("*")
      .eq("arremate_listing_id", listingId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeOffer);
  }, []);

  // ── Submit offer ──
  const submitOffer = useMutation({
    mutationFn: async ({
      listingId,
      amountCents,
      message,
    }: {
      listingId: string;
      amountCents: number;
      message?: string;
    }) => {
      const { data, error } = await supabase.rpc("submit_arremate_offer", {
        p_listing_id: listingId,
        p_amount_cents: amountCents,
        p_message: message || null,
      });
      if (error) throw error;
      const result = data as any;
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success("Oferta enviada com sucesso! 📨");
      queryClient.invalidateQueries({ queryKey: ["arremate-my-offers"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao enviar oferta");
    },
  });

  // ── Respond to offer (merchant) ──
  const respondOffer = useMutation({
    mutationFn: async ({
      offerId,
      accept,
      message,
    }: {
      offerId: string;
      accept: boolean;
      message?: string;
    }) => {
      const { data, error } = await supabase.rpc("respond_arremate_offer", {
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
      queryClient.invalidateQueries({ queryKey: ["arremate-received-offers"] });
      queryClient.invalidateQueries({ queryKey: ["auction-my-listings"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao responder oferta");
    },
  });

  return {
    receivedOffers,
    loadingOffers,
    refetchOffers,
    myOffers,
    loadingMyOffers,
    refetchMyOffers,
    fetchListingOffers,
    submitOffer,
    respondOffer,
  };
}
