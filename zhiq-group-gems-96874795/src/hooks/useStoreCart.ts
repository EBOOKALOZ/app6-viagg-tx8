/**
 * useStoreCart — Per-store cart management hook
 *
 * Manages cart state per store using Supabase RPCs.
 * Anonymous users get a session_token; logged-in users use their auth.uid().
 */
import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Session Token ─────────────────────────
function getSessionToken(): string {
  const KEY = "vtx8_cart_session";
  let token = localStorage.getItem(KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(KEY, token);
  }
  return token;
}

// ─── Types ──────────────────────────────────
export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  product_title: string;
  product_image_url: string | null;
  product_price: number;
  quantity: number;
  customer_note: string | null;
}

export interface StoreCart {
  id: string;
  store_id: string;
  items: CartItem[];
  totalItems: number;
  subtotal: number;
}

interface AddItemResult {
  success: boolean;
  cart_id?: string;
  item_id?: string;
  error?: string;
}

interface SubmitResult {
  success: boolean;
  intention_id?: string;
  checkout_mode?: string;
  subtotal?: number;
  total_items?: number;
  credits_charged?: number;
  error?: string;
}

// ─── Hook ──────────────────────────────────
export function useStoreCart(storeId: string | undefined) {
  const queryClient = useQueryClient();
  const sessionToken = getSessionToken();
  const [addingProductId, setAddingProductId] = useState<string | null>(null);

  // ── Get cart ID ──
  const { data: cartId, refetch: refetchCartId } = useQuery<string | null>({
    queryKey: ["store-cart-id", storeId, sessionToken],
    queryFn: async () => {
      if (!storeId) return null;
      try {
        const { data, error } = await supabase.rpc("get_or_create_store_cart", {
          p_store_id: storeId,
          p_session_token: sessionToken,
        });
        if (error) throw error;
        return data as string;
      } catch {
        return null;
      }
    },
    enabled: !!storeId,
    staleTime: 5_000,
    refetchOnMount: "always",
  });

  // ── Get cart items (enriched with real product data) ──
  const { data: items = [], isLoading: loadingItems, refetch: refetchItems } = useQuery<CartItem[]>({
    queryKey: ["store-cart-items", cartId],
    queryFn: async () => {
      if (!cartId) return [];
      // @ts-expect-error - Type definitions may be missing
      const { data, error } = await supabase.from("store_cart_items")
        .select("*")
        .eq("cart_id", cartId)
        .gt("quantity", 0)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Collect product IDs that need enrichment (missing title or price=0)
      const needsEnrich = (data as Record<string, unknown>[]).filter(
        (item: Record<string, unknown>) => !item.product_title || item.product_title === "Produto" || !Number(item.product_price)
      );

      // Fetch real product data for items with missing snapshots
      const productMap: Record<string, Record<string, unknown>> = {};
      if (needsEnrich.length > 0) {
        const ids = needsEnrich.map((i: Record<string, unknown>) => i.product_id).filter(Boolean);
        if (ids.length > 0) {
          // @ts-expect-error - Type definitions may be missing
          const { data: products } = await supabase.from("merchant_marketing_products")
            .select("id, title, image_url, price_label")
            .in("id", ids);
          if (products) {
            for (const p of products) {
              const priceClean = (p.price_label || "0").replace(/[^\d.,]/g, "").replace(",", ".");
              productMap[p.id] = {
                title: p.title,
                image_url: p.image_url,
                price: parseFloat(priceClean) || 0,
              };
            }
          }
        }
      }

      return (data as Record<string, unknown>[]).map((item: Record<string, unknown>) => {
        const enriched = productMap[String(item.product_id)];
        const title = (item.product_title && item.product_title !== "Produto")
          ? item.product_title
          : (enriched?.title || "Produto sem nome");
        const imageUrl = item.product_image_url || enriched?.image_url || null;
        const price = Number(item.product_price) || enriched?.price || 0;

        return {
          id: item.id,
          cart_id: item.cart_id,
          product_id: item.product_id,
          product_title: title,
          product_image_url: imageUrl,
          product_price: price,
          quantity: item.quantity,
          customer_note: item.customer_note,
        };
      });
    },
    enabled: !!cartId,
    refetchInterval: 30_000,
  });

  // ── Computed ──
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.product_price * i.quantity, 0);

  // ── Add item ──
  const addItemMutation = useMutation({
    mutationFn: async ({ productId, quantity = 1 }: { productId: string; quantity?: number }) => {
      if (!storeId) throw new Error("No store ID");
      setAddingProductId(productId);
      const { data, error } = await supabase.rpc("add_item_to_store_cart", {
        p_store_id: storeId,
        p_product_id: productId,
        p_quantity: quantity,
        p_customer_note: "",
        p_session_token: sessionToken,
      });
      if (error) throw error;
      const result = data as unknown as AddItemResult;
      if (!result?.success) throw new Error(result?.error || "Failed to add item");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-cart-items"] });
      queryClient.invalidateQueries({ queryKey: ["store-cart-id", storeId] });
      toast.success("Produto adicionado à cesta!", { duration: 2000 });
    },
    onError: (err: Error) => {
      const msg = err.message || "";
      // Erros conhecidos de constraint que indicam que o produto não tem store_id real
      // (ex: vem de advertiser_listings, não de merchant_stores). O useGlobalCart já cuida do fallback.
      const isStoreIdNull = msg.includes('null value in column "store_id"') || msg.includes("store_cart_items") || msg.includes("store_carts_store_id_fkey") || msg.includes("foreign key constraint");
      if (isStoreIdNull) {
        console.warn("[useStoreCart] suprimido (item já tratado por useGlobalCart):", msg);
        return;
      }
      toast.error(`Erro: ${msg || "Falha ao adicionar produto"}`, { duration: 8000 });
      console.error("[useStoreCart] addItem error:", err);
    },
    onSettled: () => {
      setAddingProductId(null);
    },
  });

  // ── Update item ──
  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, quantity, note }: { itemId: string; quantity: number; note?: string }) => {
      // 1. Optimistic: update local query cache immediately
      queryClient.setQueryData<CartItem[]>(["store-cart-items", cartId], (old) => {
        if (!old) return old;
        if (quantity <= 0) return old.filter(i => i.id !== itemId);
        return old.map(i => i.id === itemId ? { ...i, quantity, ...(note !== undefined ? { customer_note: note } : {}) } : i);
      });

      // 2. Sync to globalCart localStorage
      try {
        const CART_KEY = "vtx8_cart_items";
        const raw = localStorage.getItem(CART_KEY);
        if (raw) {
          const entries = JSON.parse(raw) as Record<string, unknown>[];
          if (quantity <= 0) {
            const filtered = entries.filter((e: Record<string, unknown>) => e.item_id !== itemId);
            localStorage.setItem(CART_KEY, JSON.stringify(filtered));
          } else {
            const updated = entries.map((e: Record<string, unknown>) => e.item_id === itemId ? { ...e, quantity } : e);
            localStorage.setItem(CART_KEY, JSON.stringify(updated));
          }
          window.dispatchEvent(new Event("vtx8_cart_change"));
        }
      } catch { /* non-critical */ }

      // 3. Best-effort DB update (may fail if cart is submitted)
      try {
        await supabase.rpc("update_store_cart_item", {
          p_cart_item_id: itemId,
          p_quantity: quantity,
          p_customer_note: note ?? null,
        });
      } catch { /* non-critical — localStorage is source of truth */ }

      return { success: true };
    },
    onError: () => {
      // Even on error, the optimistic update already happened
      queryClient.invalidateQueries({ queryKey: ["store-cart-items"] });
    },
  });

  // ── Submit intention ──
  const submitMutation = useMutation({
    mutationFn: async (params: {
      checkoutMode: "online_payment" | "in_store";
      name: string;
      whatsapp: string;
      email?: string;
      note?: string;
      visitor_id?: string;
    }) => {
      if (!cartId) throw new Error("Nenhuma cesta encontrada. Adicione produtos e tente novamente.");

      const { data, error } = await supabase.rpc("submit_purchase_intention", {
        p_cart_id: cartId,
        p_checkout_mode: params.checkoutMode,
        p_customer_name: params.name,
        p_customer_whatsapp: params.whatsapp,
        p_customer_email: params.email ?? null,
        p_customer_note: params.note ?? null,
        p_visitor_id: params.visitor_id ?? null,
      });
      if (error) throw error;
      const result = data as unknown as SubmitResult;
      if (!result?.success) throw new Error(result?.error || "Failed to submit");
      return result;
    },
    onSuccess: () => {
      // Force fresh cart for next purchase
      queryClient.removeQueries({ queryKey: ["store-cart-id", storeId] });
      queryClient.removeQueries({ queryKey: ["store-cart-items"] });
    },
    onError: (err: Error) => {
      const msg = err?.message || "Falha desconhecida";
      if (msg.includes("already submitted") || msg.includes("not found")) {
        // Cart was already submitted — force refresh to get a new cart
        queryClient.removeQueries({ queryKey: ["store-cart-id", storeId] });
        queryClient.removeQueries({ queryKey: ["store-cart-items"] });
        toast.error("Esta cesta já foi enviada. Adicione os produtos novamente.", { duration: 6000 });
      } else {
        toast.error(`Erro ao enviar intenção: ${msg}`, { duration: 8000 });
      }
      console.error("[useStoreCart] submit error:", err);
    },
  });

  return {
    cartId,
    items,
    totalItems,
    subtotal,
    loadingItems,
    addingProductId,
    isAdding: addItemMutation.isPending,
    isUpdating: updateItemMutation.isPending,
    isSubmitting: submitMutation.isPending,
    isSubmitted: submitMutation.isSuccess,
    submitResult: submitMutation.data as SubmitResult | undefined,
    // Aceita forma posicional (productId, quantity) ou objeto { productId, quantity }.
    addItem: (productIdOrParams: string | { productId: string; quantity?: number }, quantity?: number) => {
      const params = typeof productIdOrParams === "object" && productIdOrParams !== null
        ? productIdOrParams
        : { productId: productIdOrParams, quantity };
      return addItemMutation.mutateAsync(params);
    },
    updateItem: (itemId: string, quantity: number, note?: string) =>
      updateItemMutation.mutateAsync({ itemId, quantity, note }),
    removeItem: (itemId: string) =>
      updateItemMutation.mutateAsync({ itemId, quantity: 0 }),
    submitIntention: (
      mode: "online_payment" | "in_store",
      data: { name: string; whatsapp: string; email?: string; note?: string; visitor_id?: string }
    ) => submitMutation.mutateAsync({ checkoutMode: mode, ...data }),
    resetSubmit: submitMutation.reset,
    refetchItems,
  };
}
