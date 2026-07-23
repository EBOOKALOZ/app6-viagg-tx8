/**
 * useAuctions — Hook for auction listings & bids
 *
 * Tables: auction_listings, auction_bids, auction_watchers, auction_events
 * RPCs: place_auction_bid, end_auction_listing
 */
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabaseAdmin } from "@/integrations/supabase/adminClient";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ─── Types (aligned with REAL DB schema) ──

export interface AuctionListing {
  id: string;
  store_id: string;
  product_id: string | null;
  title: string;
  description: string | null;
  product_image_url: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  listing_type: "auction" | "arremate";
  starting_bid: number;
  current_bid: number;
  minimum_increment: number;
  buy_now_price: number | null;
  reserve_price: number | null;
  status: "active" | "ended" | "cancelled" | "sold";
  fulfillment_type?: "pickup" | "delivery" | "both" | null;
  starts_at: string;
  ends_at: string;
  winner_user_id: string | null;
  total_bids: number;
  watchers_count: number;
  created_at: string;
  updated_at: string;
  // Image metadata
  image_storage_path: string | null;
  image_original_name: string | null;
  image_mime_type: string | null;
  image_size_bytes: number | null;
  image_uploaded_at: string | null;
  // Virtual / aliased
  views_count?: number;
  offer_count?: number;
  bid_count?: number;
  // Price aliases from auction_module schema
  current_price_cents?: number;
  original_price_cents?: number;
  buy_now_price_cents?: number;
}

export interface AuctionBid {
  id: string;
  listing_id: string;
  bidder_id: string;
  amount_cents: number;
  is_winning: boolean;
  created_at: string;
  bidder_name?: string;
}

export interface CreateListingInput {
  title: string;
  description?: string;
  product_image_url?: string;
  starting_bid: number;       // R$ (numeric, not cents)
  buy_now_price?: number;     // R$ (numeric)
  reserve_price?: number;     // R$ (numeric)
  minimum_increment?: number; // R$ (numeric, default 1)
  duration_hours: number;
  // Explicit timestamps (override duration_hours when provided)
  starts_at?: string;         // ISO timestamp
  ends_at?: string;           // ISO timestamp
  // Legacy fields kept for form compatibility
  listing_type?: "auction" | "arremate";
  fulfillment_type?: string;
  product_id?: string | null;
}

// ─── Hook ───────────────────────────────

export function useAuctions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Merchant's own listings ──
  const {
    data: myListings = [],
    isLoading: loadingMyListings,
    refetch: refetchMyListings,
  } = useQuery({
    queryKey: ["auction-my-listings", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      // Get merchant's store first
      const { data: store } = await supabase
        .from("merchant_stores")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!store) return [];
      const { data, error } = await supabase
        .from("auction_listings")
        .select("*")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as AuctionListing[];
    },
    enabled: !!user?.id,
  });

  // ── Public active listings ──
  const {
    data: activeListings = [],
    isLoading: loadingActive,
    refetch: refetchActive,
  } = useQuery({
    queryKey: ["auction-active-listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auction_listings")
        .select("*")
        .eq("status", "active")
        .gte("ends_at", new Date().toISOString())
        .order("ends_at", { ascending: true });
      if (error) throw error;
      return (data || []) as AuctionListing[];
    },
  });

  // ── Single listing by ID ──
  const fetchListing = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("auction_listings")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data as AuctionListing;
  }, []);

  // ── Bids for a listing ──
  const fetchBids = useCallback(async (listingId: string) => {
    const { data, error } = await supabase
      .from("auction_bids")
      .select("*")
      .eq("listing_id", listingId)
      .order("amount_cents", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data || []) as AuctionBid[];
  }, []);

  // ── Create listing ──
  const createListing = useMutation({
    mutationFn: async (input: CreateListingInput) => {
      if (!user?.id) throw new Error("Não autenticado");

      // Get store
      const { data: store, error: storeErr } = await supabase
        .from("merchant_stores")
        .select("id, nome_loja, cidade, bairro")
        .eq("user_id", user.id)
        .maybeSingle();
      if (storeErr || !store) throw new Error("Loja não encontrada. Configure sua loja primeiro.");

      const endsAt = new Date(Date.now() + input.duration_hours * 60 * 60 * 1000).toISOString();

      // Use RPC to bypass PostgREST schema cache
      const { data, error } = await supabase.rpc("create_auction_listing", {
        p_store_id: store.id,
        p_title: input.title,
        p_description: input.description || null,
        p_product_image_url: input.product_image_url || null,
        p_starting_bid: input.starting_bid,
        p_buy_now_price: input.buy_now_price || null,
        p_reserve_price: input.reserve_price || null,
        p_minimum_increment: input.minimum_increment || 1,
        p_city: store.cidade || null,
        p_neighborhood: store.bairro || null,
        p_duration_hours: input.duration_hours || 24,
        p_listing_type: input.listing_type || "auction",
        p_starts_at: input.starts_at || null,
        p_ends_at: input.ends_at || null,
        p_product_id: input.product_id || null,
        p_fulfillment_type: input.fulfillment_type || "pickup",
      });

      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || "Erro ao criar listing");
      return result;
    },
    onSuccess: (_result, variables) => {
      const isArremate = variables.listing_type === "arremate";
      toast.success(isArremate ? "Arremate criado com sucesso! 🎉" : "Leilão criado com sucesso! 🎉");
      queryClient.invalidateQueries({ queryKey: ["auction-my-listings"] });
      queryClient.invalidateQueries({ queryKey: ["auction-active-listings"] });
    },
    onError: (err: any, variables) => {
      const isArremate = variables?.listing_type === "arremate";
      toast.error(err.message || (isArremate ? "Erro ao criar arremate" : "Erro ao criar leilão"));
    },
  });

  // ── Place bid ──
  const placeBid = useMutation({
    mutationFn: async ({ listingId, amountCents }: { listingId: string; amountCents: number }) => {
      const { data, error } = await supabase.rpc("place_auction_bid", {
        p_listing_id: listingId,
        p_amount_cents: amountCents,
      });
      if (error) throw error;
      const result = data as any;
      if (!result.success) {
        // Mensagem clara com o próximo lance mínimo (o backend é a fonte de verdade).
        const nm = result.next_min_cents;
        const msg = nm != null
          ? `O próximo lance mínimo permitido é ${(nm / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`
          : (result.error || "Lance inválido");
        throw new Error(msg);
      }
      return result;
    },
    onSuccess: () => {
      toast.success("Lance registrado! 🔥");
      queryClient.invalidateQueries({ queryKey: ["auction-active-listings"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao dar lance");
    },
  });

  // ── End auction ──
  const endAuction = useMutation({
    mutationFn: async (listingId: string) => {
      const { data, error } = await supabase.rpc("end_auction_listing", {
        p_listing_id: listingId,
      });
      if (error) throw error;
      const result = data as any;
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: (_result, listingId) => {
      const listing = myListings.find(l => l.id === listingId);
      const isArremate = listing?.listing_type === "arremate";
      toast.success(isArremate ? "Arremate encerrado!" : "Leilão encerrado!");
      queryClient.invalidateQueries({ queryKey: ["auction-my-listings"] });
      queryClient.invalidateQueries({ queryKey: ["auction-active-listings"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao encerrar");
    },
  });

  // ── Watch listing ──
  const watchListing = useCallback(
    async (listingId: string) => {
      if (!user?.id) return;
      const { error } = await supabase
        .from("auction_watchers")
        .upsert({ listing_id: listingId, user_id: user.id }, { onConflict: "listing_id,user_id" });
      if (!error) {
        // Update watchers_count directly
        const { data: count } = await supabase
          .from("auction_watchers")
          .select("id", { count: "exact", head: true })
          .eq("listing_id", listingId);
      }
    },
    [user?.id]
  );

  // ── Update listing ──
  const adminDb = supabaseAdmin || supabase;
  const updateListing = useMutation({
    mutationFn: async (updates: { id: string; [key: string]: any }) => {
      const { id, ...rest } = updates;
      const { error } = await (adminDb.from("auction_listings") as any)
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_result, variables) => {
      const listing = myListings.find(l => l.id === variables.id);
      const isArremate = listing?.listing_type === "arremate" || variables.listing_type === "arremate";
      toast.success(isArremate ? "Arremate atualizado! ✅" : "Leilão atualizado! ✅");
      queryClient.invalidateQueries({ queryKey: ["auction-my-listings"] });
      queryClient.invalidateQueries({ queryKey: ["auction-active-listings"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao atualizar");
    },
  });

  // ── Delete listing ──
  const deleteListing = useMutation({
    mutationFn: async (listingId: string) => {
      // Delete related bids first
      await (adminDb.from("auction_bids") as any).delete().eq("listing_id", listingId);
      await (adminDb.from("auction_watchers") as any).delete().eq("listing_id", listingId);
      // Then delete the listing
      const { error } = await (adminDb.from("auction_listings") as any)
        .delete()
        .eq("id", listingId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item excluído! 🗑️");
      queryClient.invalidateQueries({ queryKey: ["auction-my-listings"] });
      queryClient.invalidateQueries({ queryKey: ["auction-active-listings"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao excluir");
    },
  });

  return {
    myListings,
    loadingMyListings,
    refetchMyListings,
    activeListings,
    loadingActive,
    refetchActive,
    fetchListing,
    fetchBids,
    createListing,
    placeBid,
    endAuction,
    watchListing,
    updateListing,
    deleteListing,
  };
}
