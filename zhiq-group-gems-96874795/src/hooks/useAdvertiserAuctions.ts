/**
 * useAdvertiserAuctions — Hook de leilão/arremate para anunciantes
 *
 * Reutiliza:
 *   - Tabela: auction_listings (com owner_user_id em vez de store_id)
 *   - Type: AuctionListing, CreateListingInput (de useAuctions)
 *   - RPC: create_auction_listing, end_auction_listing
 *
 * Diferença do useAuctions: resolve ownership via auth.uid()
 * direto (sem merchant_stores), usando o campo owner_user_id.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { AuctionListing } from "./useAuctions";

export type { AuctionListing };

export interface AdvertiserCreateListingInput {
  title: string;
  description?: string;
  product_image_url?: string;
  starting_bid: number;
  minimum_increment?: number;
  buy_now_price?: number;
  duration_hours: number;
  starts_at?: string;
  ends_at?: string;
  listing_type: "auction" | "arremate";
  fulfillment_type?: string;
  product_id?: string | null;
}

// ─── Hook ───────────────────────────────────────────────────

export function useAdvertiserAuctions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: myListings = [],
    isLoading: loadingMyListings,
    refetch: refetchMyListings,
  } = useQuery({
    queryKey: ["advertiser-auction-listings", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Buscar a loja do usuário para cobrir leilões criados via RPC
      // (o RPC salva store_id mas não owner_user_id)
      const { data: storeData } = await supabase
        .from("merchant_stores")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      
      const storeId = storeData?.id || null;

      // Buscar por owner_user_id OU store_id para cobrir ambos os casos
      let query = supabase
        .from("auction_listings")
        .select("*")
        .order("created_at", { ascending: false });

      if (storeId) {
        // Ambos os campos possíveis
        query = query.or(`owner_user_id.eq.${user.id},store_id.eq.${storeId}`);
      } else {
        query = query.eq("owner_user_id", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Buscar imagens para listings que não têm product_image_url
      const needsImg = (data || []).filter((l: unknown) => !l.product_image_url && l.product_id);

      if (needsImg.length === 0) return (data || []) as AuctionListing[];

      // Batch: buscar de uma vez só
      const productIds = [...new Set(needsImg.map((l: unknown) => l.product_id))];

      const [plRes, alRes] = await Promise.all([
        supabase.from("product_listings" as unknown)
          .select("id, cover_image_url")
          .in("id", productIds),
        supabase.from("advertiser_listings" as unknown)
          .select("id, cover_image_url, advertiser_listing_media(media_url)")
          .in("id", productIds),
      ]);

      const imgMap = new Map<string, string>();

      for (const p of (plRes.data || []) as unknown[]) {
        if (!p.cover_image_url) continue;
        const url = p.cover_image_url.startsWith("http")
          ? p.cover_image_url
          : supabase.storage.from("marketing-materials").getPublicUrl(p.cover_image_url).data.publicUrl;
        imgMap.set(p.id, url);
      }
      for (const a of (alRes.data || []) as unknown[]) {
        const raw = a.cover_image_url || a.advertiser_listing_media?.[0]?.media_url;
        if (!raw) continue;
        const url = raw.startsWith("http")
          ? raw
          : supabase.storage.from("marketing-materials").getPublicUrl(raw).data.publicUrl;
        imgMap.set(a.id, url);
      }

      return (data || []).map((l: unknown) => ({
        ...l,
        product_image_url: l.product_image_url || (l.product_id ? imgMap.get(l.product_id) || null : null),
      })) as AuctionListing[];
    },
    enabled: !!user?.id,
  });

  // Separar por tipo
  const auctionListings = useMemo(
    () => myListings.filter((l) => (l as unknown).listing_type === "auction"),
    [myListings]
  );
  const arremateListings = useMemo(
    () => myListings.filter((l) => (l as unknown).listing_type === "arremate"),
    [myListings]
  );

  // ── Criar listing ──
  const createListing = useMutation({
    mutationFn: async (input: AdvertiserCreateListingInput) => {
      if (!user?.id) throw new Error("Não autenticado");

      // Buscar loja do anunciante
      const { data: store, error: storeErr } = await supabase
        .from("merchant_stores")
        .select("id, nome_loja, cidade, bairro")
        .eq("user_id", user.id)
        .maybeSingle();

      const storeId = store?.id || null;

      const { data, error } = await supabase.rpc(
        "create_auction_listing" as unknown,
        {
          p_store_id: storeId,
          p_title: input.title,
          p_description: input.description || null,
          p_product_image_url: input.product_image_url || null,
          p_starting_bid: input.starting_bid,
          p_buy_now_price: input.buy_now_price || null,
          p_reserve_price: null,
          p_minimum_increment: input.minimum_increment || 1,
          p_city: store?.cidade || null,
          p_neighborhood: store?.bairro || null,
          p_duration_hours: input.duration_hours || 24,
          p_listing_type: input.listing_type || "auction",
          p_starts_at: input.starts_at || null,
          p_ends_at: input.ends_at || null,
          p_product_id: input.product_id || null,
        }
      );

      if (error) throw error;
      const result = data as unknown;
      if (!result?.success) throw new Error(result?.message || result?.error || "Erro ao criar listing");
      return result as { success: true; listing_id: string; ends_at: string; publish_fee_charged?: number; wallet_balance_after?: number };
    },
    onSuccess: (result, variables) => {
      const isArremate = variables.listing_type === "arremate";
      const fee = (result as { publish_fee_charged?: number }).publish_fee_charged;
      const feeText = typeof fee === "number" ? ` Taxa de publicação (3%): R$ ${fee.toFixed(2)}.` : "";
      toast.success(
        (isArremate ? "Arremate criado com sucesso! 🎉" : "Leilão criado com sucesso! 🎉") + feeText
      );
      queryClient.invalidateQueries({ queryKey: ["advertiser-auction-listings"] });
    },
    onError: (err: unknown) => {
      toast.error(err.message || "Erro ao criar listing");
    },
  });

  // ── Encerrar listing ──
  const endListing = useMutation({
    mutationFn: async (listingId: string) => {
      const { data, error } = await supabase.rpc("end_auction_listing" as unknown, {
        p_listing_id: listingId,
      });
      if (error) throw error;
      const result = data as unknown;
      if (!result.success) throw new Error(result.message || result.error);
      return result;
    },
    onSuccess: (_result, listingId) => {
      const listing = myListings.find((l) => l.id === listingId);
      const isArremate = (listing as unknown)?.listing_type === "arremate";
      toast.success(isArremate ? "Arremate encerrado!" : "Leilão encerrado!");
      queryClient.invalidateQueries({ queryKey: ["advertiser-auction-listings"] });
    },
    onError: (err: unknown) => {
      toast.error(err.message || "Erro ao encerrar");
    },
  });

  // ── Pausar / Republicar (pausa REAL — reversível — via state machine) ──
  const pauseListing = useMutation({
    mutationFn: async (listingId: string) => {
      const { data, error } = await supabase.rpc("auction_set_status" as unknown, {
        p_listing_id: listingId, p_new_status: "paused",
      });
      if (error) throw error;
      const r = data as unknown;
      if (!r?.success) throw new Error(r?.message || r?.error || "Não foi possível pausar");
      return r;
    },
    onSuccess: () => {
      toast.success("Leilão pausado. Você pode republicar quando quiser.");
      queryClient.invalidateQueries({ queryKey: ["advertiser-auction-listings"] });
    },
    onError: (err: unknown) => toast.error(err.message || "Erro ao pausar"),
  });

  const republishListing = useMutation({
    mutationFn: async (listingId: string) => {
      const { data, error } = await supabase.rpc("auction_set_status" as unknown, {
        p_listing_id: listingId, p_new_status: "active",
      });
      if (error) throw error;
      const r = data as unknown;
      if (!r?.success) throw new Error(r?.message || r?.error || "Não foi possível republicar");
      return r;
    },
    onSuccess: () => {
      toast.success("Leilão republicado! 🔁");
      queryClient.invalidateQueries({ queryKey: ["advertiser-auction-listings"] });
    },
    onError: (err: unknown) => toast.error(err.message || "Erro ao republicar"),
  });

  // ── Atualizar listing ──
  const updateListing = useMutation({
    mutationFn: async (updates: { id: string; [key: string]: unknown }) => {
      const { id, ...rest } = updates;
      const { data, error } = await supabase.rpc("update_auction_listing" as unknown, {
        p_listing_id: id,
        p_updates: rest,
      });
      if (error) throw error;
      const result = data as unknown;
      if (!result?.success) throw new Error(result?.message || result?.error || "Erro ao atualizar listing");
    },
    onSuccess: () => {
      toast.success("Listing atualizado! ✅");
      queryClient.invalidateQueries({ queryKey: ["advertiser-auction-listings"] });
    },
    onError: (err: unknown) => {
      toast.error(err.message || "Erro ao atualizar");
    },
  });

  // ── Excluir listing ──
  const deleteListing = useMutation({
    mutationFn: async (listingId: string) => {
      const { data, error } = await supabase.rpc("delete_auction_listing" as unknown, {
        p_listing_id: listingId,
      });
      if (error) throw error;
      const result = data as unknown;
      if (!result?.success) throw new Error(result?.message || result?.error || "Erro ao excluir listing");
    },
    onSuccess: () => {
      toast.success("Listing excluído!");
      queryClient.invalidateQueries({ queryKey: ["advertiser-auction-listings"] });
    },
    onError: (err: unknown) => {
      toast.error(err.message || "Erro ao excluir");
    },
  });

  return {
    myListings,
    auctionListings,
    arremateListings,
    loadingMyListings,
    refetchMyListings,
    createListing,
    endListing,
    pauseListing,
    republishListing,
    updateListing,
    deleteListing,
  };
}
