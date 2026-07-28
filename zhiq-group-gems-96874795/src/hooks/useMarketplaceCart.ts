/**
 * useMarketplaceCart — Unified cart across ALL stores
 *
 * Aggregates all per-store carts into a single view.
 * Items are grouped by store. At checkout, purchase intentions
 * are sent to each store separately.
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Types ──────────────────────────────
export interface MarketplaceCartItem {
  id: string;
  cart_id: string;
  store_id: string;
  product_id: string;
  product_title: string;
  product_image_url: string | null;
  product_price: number;
  quantity: number;
  customer_note: string | null;
}

export interface StoreGroup {
  store_id: string;
  store_name: string;
  store_logo: string | null;
  items: MarketplaceCartItem[];
  subtotal: number;
  totalItems: number;
}

// ─── Session Token ──────────────────────
function getSessionToken(): string {
  const KEY = "vtx8_cart_session";
  let token = sessionStorage.getItem(KEY);
  if (!token) {
    token = crypto.randomUUID();
    sessionStorage.setItem(KEY, token);
  }
  return token;
}

// ─── Hook ───────────────────────────────
export function useMarketplaceCart() {
  const queryClient = useQueryClient();
  const sessionToken = getSessionToken();
  const [addingProductId, setAddingProductId] = useState<string | null>(null);

  // ── Fetch ALL active cart items for current session/user ──
  const { data: rawItems = [], isLoading: loadingItems, refetch: refetchItems } = useQuery<MarketplaceCartItem[]>({
    queryKey: ["marketplace-cart-items", sessionToken],
    queryFn: async () => {
      // @ts-expect-error - Some schemas might not be fully typed yet
      const { data: carts, error: cartsErr } = await supabase.from("store_carts")
        .select("id, store_id")
        .eq("status", "active")
        .or(`session_token.eq.${sessionToken}`);

      if (cartsErr) {
        console.error("[useMarketplaceCart] carts error:", cartsErr);
        return [];
      }
      if (!carts || carts.length === 0) return [];

      // Get all items from all carts
      const cartIds = carts.map((c: Record<string, unknown>) => c.id as string);
      const cartStoreMap = new Map(carts.map((c: Record<string, unknown>) => [c.id as string, c.store_id as string]));

      // @ts-expect-error - Some schemas might not be fully typed yet
      const { data: items, error: itemsErr } = await supabase.from("store_cart_items")
        .select("*")
        .in("cart_id", cartIds)
        .gt("quantity", 0)
        .order("created_at", { ascending: true });

      if (itemsErr) {
        console.error("[useMarketplaceCart] items error:", itemsErr);
        return [];
      }

      return (items || []).map((item: Record<string, unknown>) => {
        return {
          id: item.id as string,
          cart_id: item.cart_id as string,
          store_id: (item.store_id as string) || cartStoreMap.get(item.cart_id as string) || "",
          product_id: item.product_id as string,
          product_title: (item.product_title as string) || "Produto",
          product_image_url: (item.product_image_url as string) || null,
          product_price: Number(item.product_price) || 0,
          quantity: item.quantity as number,
          customer_note: (item.customer_note as string) || null,
        };
      });
    },
    refetchInterval: 30_000,
  });

  // ── Fetch store info for all stores in cart ──
  const storeIds = useMemo(() => [...new Set(rawItems.map(i => i.store_id).filter(Boolean))], [rawItems]);

  const { data: storeInfoMap = new Map() } = useQuery({
    queryKey: ["marketplace-cart-stores", storeIds.join(",")],
    queryFn: async () => {
      if (storeIds.length === 0) return new Map();
      // @ts-expect-error - Some schemas might not be fully typed yet
      const { data, error } = await supabase.from("merchant_stores")
        .select("*")
        .in("id", storeIds);
      if (error) console.error("[useMarketplaceCart] stores error:", error);
      const map = new Map<string, { name: string; logo: string | null }>();
      (data || []).forEach((s: Record<string, unknown>) => {
        const name = (s.store_name as string) || (s.nome_loja as string) || (s.nome as string) || "Loja";
        map.set(s.id as string, { name, logo: (s.logo_url as string) || null });
      });
      return map;
    },
    enabled: storeIds.length > 0,
  });

  // ── Grouped by store ──
  const storeGroups: StoreGroup[] = useMemo(() => {
    const groups = new Map<string, MarketplaceCartItem[]>();
    rawItems.forEach(item => {
      const list = groups.get(item.store_id) || [];
      list.push(item);
      groups.set(item.store_id, list);
    });

    return Array.from(groups.entries()).map(([storeId, items]) => {
      const info = storeInfoMap.get(storeId);
      return {
        store_id: storeId,
        store_name: info?.name || "Loja",
        store_logo: info?.logo || null,
        items,
        subtotal: items.reduce((sum, i) => sum + i.product_price * i.quantity, 0),
        totalItems: items.reduce((sum, i) => sum + i.quantity, 0),
      };
    });
  }, [rawItems, storeInfoMap]);

  // ── Totals ──
  const totalItems = useMemo(() => rawItems.reduce((sum, i) => sum + i.quantity, 0), [rawItems]);
  const subtotal = useMemo(() => rawItems.reduce((sum, i) => sum + i.product_price * i.quantity, 0), [rawItems]);
  const storeCount = storeGroups.length;

  // ── Add item (uses existing per-store RPC) ──
  const addItemMutation = useMutation({
    mutationFn: async ({ storeId, productId, quantity = 1 }: { storeId: string; productId: string; quantity?: number }) => {
      setAddingProductId(productId);
      const { data, error } = await supabase.rpc("add_item_to_store_cart", {
        p_store_id: storeId,
        p_product_id: productId,
        p_quantity: quantity,
        p_customer_note: "",
        p_session_token: sessionToken,
      });
      if (error) throw new Error(error.message);
      const result = data as Record<string, unknown>;
      if (result && !result.success) throw new Error((result.error as string) || "Falha ao adicionar");
      return result;
    },
    onSuccess: () => {
      toast.success("Produto adicionado à cesta!", { duration: 2000 });
      refetchItems();
    },
    onError: (err: Error) => {
      toast.error(`Erro: ${err.message || "Falha ao adicionar produto"}`, { duration: 8000 });
      console.error("[useMarketplaceCart] addItem error:", err);
    },
    onSettled: () => {
      setAddingProductId(null);
    },
  });

  // ── Update item ──
  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, quantity, note }: { itemId: string; quantity: number; note?: string }) => {
      const { data, error } = await supabase.rpc("update_store_cart_item", {
        p_cart_item_id: itemId,
        p_quantity: quantity,
        ...(note !== undefined ? { p_customer_note: note } : {}),
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => refetchItems(),
    onError: (err: Error) => {
      toast.error(`Erro: ${err.message}`);
    },
  });

  // ── Remove item ──
  const removeItem = useCallback(async (itemId: string) => {
    await updateItemMutation.mutateAsync({ itemId, quantity: 0 });
  }, [updateItemMutation]);

  // ── Public API ──
  return {
    items: rawItems,
    storeGroups,
    totalItems,
    subtotal,
    storeCount,
    loadingItems,
    addingProductId,
    isUpdating: updateItemMutation.isPending,
    addItem: (storeId: string, productId: string) => addItemMutation.mutateAsync({ storeId, productId }),
    updateItem: (itemId: string, quantity: number, note?: string) => updateItemMutation.mutateAsync({ itemId, quantity, note }),
    removeItem,
    refetch: refetchItems,
  };
}
