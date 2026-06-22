/**
 * useGlobalCart — Hybrid Local + Remote Cart
 *
 * PRIMARY source of truth: localStorage (always works)
 * SECONDARY: Supabase RPCs for persistence (write-through)
 *
 * When user adds an item:
 *   1. Call add_item_to_store_cart RPC (DB persistence)
 *   2. Save item details to localStorage immediately
 *   3. UI reads from localStorage → always shows products
 *
 * On page load:
 *   1. Read from localStorage (instant)
 *   2. Try RPC sync in background (merge if data found)
 */
import { useState, useCallback, useMemo, useEffect, useSyncExternalStore } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Constants ─────────────────────────────
const CART_KEY = "vtx8_cart_items";
const SESSION_KEY = "vtx8_cart_session";

// ─── Session Token ─────────────────────────
function getSessionToken(): string {
  let token = localStorage.getItem(SESSION_KEY);
  if (!token) {
    token = sessionStorage.getItem(SESSION_KEY) || crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, token);
  }
  sessionStorage.setItem(SESSION_KEY, token);
  return token;
}

// ─── Types ──────────────────────────────────
export interface GlobalCartItem {
  item_id: string;
  product_id: string;
  product_title: string;
  product_image_url: string | null;
  product_price: number;
  quantity: number;
  customer_note: string | null;
  item_subtotal: number;
}

export interface StoreGroup {
  store_id: string;
  cart_id: string;
  store_name: string;
  store_logo: string | null;
  store_address: string;
  items: GlobalCartItem[];
  total_items: number;
  subtotal: number;
}

export interface MultiSubmitResult {
  success: boolean;
  total_stores?: number;
  total_items?: number;
  grand_total?: number;
  purchase_intentions?: Array<{
    store_id: string;
    intention_id: string;
    subtotal: number;
    total_items: number;
    already_submitted?: boolean;
  }>;
  error?: string;
}

// ─── Local Cart Item (stored in localStorage) ──
interface LocalCartEntry {
  item_id: string;        // from RPC or generated
  cart_id: string;        // from RPC
  store_id: string;
  product_id: string;
  product_title: string;
  product_image_url: string | null;
  product_price: number;
  quantity: number;
  customer_note: string | null;
  store_name: string;
  store_logo: string | null;
  added_at: number;
}

// ─── localStorage helpers ──────────────────
let _listeners: Array<() => void> = [];

function getLocalCart(): LocalCartEntry[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalCartEntry[];
  } catch {
    return [];
  }
}

const CART_EVENT = "vtx8-cart-updated";
let _cachedSnapshot: LocalCartEntry[] = getLocalCart();

function setLocalCart(entries: LocalCartEntry[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(entries));
  _cachedSnapshot = entries;
  _listeners.forEach(fn => fn());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CART_EVENT));
  }
}

function subscribeToLocalCart(listener: () => void) {
  _listeners.push(listener);
  return () => {
    _listeners = _listeners.filter(fn => fn !== listener);
  };
}

function getLocalCartSnapshot(): LocalCartEntry[] {
  return _cachedSnapshot;
}

function refreshSnapshotFromStorage() {
  _cachedSnapshot = getLocalCart();
  _listeners.forEach(fn => fn());
}

// ─── Group local entries into StoreGroups ──
function groupByStore(entries: LocalCartEntry[]): StoreGroup[] {
  const map = new Map<string, { cartId: string; storeName: string; storeLogo: string | null; items: GlobalCartItem[] }>();

  for (const e of entries) {
    if (e.quantity <= 0) continue;
    let group = map.get(e.store_id);
    if (!group) {
      group = { cartId: e.cart_id, storeName: e.store_name || "Loja", storeLogo: e.store_logo, items: [] };
      map.set(e.store_id, group);
    }
    group.items.push({
      item_id: e.item_id,
      product_id: e.product_id,
      product_title: e.product_title,
      product_image_url: e.product_image_url,
      product_price: e.product_price,
      quantity: e.quantity,
      customer_note: e.customer_note,
      item_subtotal: e.product_price * e.quantity,
    });
  }

  return Array.from(map.entries()).map(([storeId, g]) => ({
    store_id: storeId,
    cart_id: g.cartId,
    store_name: g.storeName,
    store_logo: g.storeLogo,
    store_address: "",
    items: g.items,
    total_items: g.items.reduce((s, i) => s + i.quantity, 0),
    subtotal: g.items.reduce((s, i) => s + i.item_subtotal, 0),
  }));
}

// ─── Hook ──────────────────────────────────
export function useGlobalCart() {
  const queryClient = useQueryClient();
  const sessionToken = getSessionToken();
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const localEntries = useSyncExternalStore(subscribeToLocalCart, getLocalCartSnapshot, getLocalCartSnapshot);

  // Cross-tab and window-level listeners — trigger internal snapshot refresh
  useEffect(() => {
    const onCartEvent = () => refreshSnapshotFromStorage();
    const onStorage = (e: StorageEvent) => {
      if (e.key === CART_KEY) refreshSnapshotFromStorage();
    };
    window.addEventListener(CART_EVENT, onCartEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CART_EVENT, onCartEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const storeGroups = useMemo(() => groupByStore(localEntries), [localEntries]);
  const totalItems = useMemo(() => storeGroups.reduce((s, g) => s + g.total_items, 0), [storeGroups]);
  const totalSubtotal = useMemo(() => storeGroups.reduce((s, g) => s + g.subtotal, 0), [storeGroups]);
  const totalStores = storeGroups.length;
  const isLoading = false; // localStorage is synchronous

  // ── Add item ──────────────────────────────
  const addItemMutation = useMutation({
    mutationFn: async ({
      storeId, productId, quantity = 1,
      productTitle, productImageUrl, productPrice, storeName, storeLogo,
    }: {
      storeId: string;
      productId: string;
      quantity?: number;
      productTitle?: string;
      productImageUrl?: string | null;
      productPrice?: number;
      storeName?: string;
      storeLogo?: string | null;
    }) => {
      if (!storeId || !productId) {
        throw new Error("Dados do produto incompletos (loja ou produto ausente).");
      }
      setAddingProductId(productId);
      console.log("[GlobalCart] ➕ Adding:", productId.slice(0, 8), "to store:", storeId.slice(0, 8));

      // 1. Call RPC for DB persistence
      let cartId = crypto.randomUUID();
      let itemId = crypto.randomUUID();
      try {
        const { data, error } = await supabase.rpc("add_item_to_store_cart", {
          p_store_id: storeId,
          p_product_id: productId,
          p_quantity: quantity,
          p_customer_note: "",
          p_session_token: sessionToken,
        });
        if (!error && data) {
          const result = data as any;
          if (result?.success) {
            cartId = result.cart_id || cartId;
            itemId = result.item_id || itemId;
            console.log("[GlobalCart] ✅ RPC success:", result);
          }
        } else {
          console.warn("[GlobalCart] RPC error (item saved locally):", error?.message);
        }
      } catch (e) {
        console.warn("[GlobalCart] RPC failed (item saved locally):", e);
      }

      // 2. Save to localStorage immediately
      const entries = getLocalCart();

      // Check if product already in cart for this store
      const existingIdx = entries.findIndex(e => e.store_id === storeId && e.product_id === productId && e.quantity > 0);
      if (existingIdx >= 0) {
        entries[existingIdx].quantity += quantity;
        entries[existingIdx].item_id = itemId;
        entries[existingIdx].cart_id = cartId;
      } else {
        // Cobra o lojista só na PRIMEIRA vez que o produto entra na cesta (não
        // a cada incremento de quantidade) — fire-and-forget, nunca bloqueia o carrinho.
        supabase.rpc("consume_cart_add_credit" as any, {
          p_store_id: storeId,
          p_product_id: productId,
        }).then(({ data }: any) => console.log("[GlobalCart] cart_add credit:", data))
          .catch(() => { /* noop */ });
        entries.push({
          item_id: itemId,
          cart_id: cartId,
          store_id: storeId,
          product_id: productId,
          product_title: productTitle || "Produto",
          product_image_url: productImageUrl || null,
          product_price: productPrice || 0,
          quantity,
          customer_note: null,
          store_name: storeName || "Loja",
          store_logo: storeLogo || null,
          added_at: Date.now(),
        });
      }

      setLocalCart(entries);
      console.log("[GlobalCart] 💾 Saved to localStorage:", entries.length, "items");
      return { success: true, cart_id: cartId, item_id: itemId };
    },
    onSuccess: () => {
      toast.success("Produto adicionado à cesta!", { duration: 2000 });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("vtx8-cart-add-action"));
      }
    },
    onError: (err: Error) => {
      toast.error(`Erro: ${err.message}`, { duration: 5000 });
    },
    onSettled: () => setAddingProductId(null),
  });

  // ── Update item quantity ──────────────────
  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, quantity, note }: { itemId: string; quantity: number; note?: string }) => {
      // Update localStorage
      const entries = getLocalCart();
      const idx = entries.findIndex(e => e.item_id === itemId);
      if (idx >= 0) {
        if (quantity <= 0) {
          entries.splice(idx, 1);
        } else {
          entries[idx].quantity = quantity;
          if (note !== undefined) entries[idx].customer_note = note;
        }
        setLocalCart(entries);
      }

      // Also update in DB (best effort)
      try {
        await supabase.rpc("update_store_cart_item", {
          p_cart_item_id: itemId,
          p_quantity: quantity,
          p_customer_note: note ?? null,
        });
      } catch { /* non-critical */ }

      return { success: true };
    },
    onError: () => toast.error("Erro ao atualizar item."),
  });

  // ── Submit multi-store intention ──────────
    const submitMutation = useMutation({
      mutationFn: async (params: {
        name: string;
        whatsapp: string;
        email?: string;
        note?: string;
        checkoutMode: 'in_store' | 'online_payment';
        bairro?: string;
        city?: string;
      }) => {
        // Build groups from localStorage (fallback to in-memory snapshot if needed)
        let localGroups = groupByStore(getLocalCart());
        if (localGroups.length === 0 && storeGroups.length > 0) {
          localGroups = storeGroups;
        }
        if (localGroups.length === 0) {
          throw new Error("Nenhum item na cesta para enviar");
        }

        const purchaseIntentions: NonNullable<MultiSubmitResult["purchase_intentions"]> = [];
        let grandTotal = 0;
        let grandItems = 0;

        for (const group of localGroups) {
          const subtotal = group.subtotal;
          const totalItems = group.total_items;
          const feeAmount = Math.round(subtotal * 0.03 * 100) / 100;
          const creditsCost = Math.max(Math.ceil(feeAmount), 1);
          const paymentStatus =
            params.checkoutMode === "online_payment" ? "pending" : "not_applicable";

          const { data: intention, error: piErr } = await (
            supabase.from("purchase_intentions") as any
          )
            .insert({
              cart_id: group.cart_id,
              store_id: group.store_id,
              customer_name: params.name,
              customer_whatsapp: params.whatsapp,
              customer_email: params.email ?? null,
              customer_note: params.note ?? null,
              customer_bairro: params.bairro || "",
              customer_city: params.city || "",
              subtotal,
              total_items: totalItems,
              status: "new",
              checkout_mode: params.checkoutMode,
              payment_status: paymentStatus,
              source: "marketplace",
              credits_charged: creditsCost,
              platform_fee_percent: 3,
              platform_fee_amount: feeAmount,
            })
            .select("id")
            .single();

          if (piErr || !intention?.id) {
            console.error("[GlobalCart] insert intention error:", piErr);
            throw new Error(piErr?.message || "Erro ao registrar intenção para a loja");
          }

          const itemsPayload = group.items.map((it) => ({
            intention_id: intention.id,
            product_id: it.product_id,
            product_title: it.product_title || "Produto",
            product_image_url: it.product_image_url,
            unit_price: it.product_price || 0,
            quantity: it.quantity,
            subtotal: (it.product_price || 0) * it.quantity,
            customer_note: it.customer_note,
          }));

          const { error: itErr } = await (
            supabase.from("purchase_intention_items") as any
          ).insert(itemsPayload);
          if (itErr) console.warn("[GlobalCart] insert items error:", itErr);

          purchaseIntentions.push({
            store_id: group.store_id,
            intention_id: intention.id,
            subtotal,
            total_items: totalItems,
          });
          grandTotal += subtotal;
          grandItems += totalItems;
        }

        const result: MultiSubmitResult = {
          success: true,
          total_stores: purchaseIntentions.length,
          total_items: grandItems,
          grand_total: grandTotal,
          purchase_intentions: purchaseIntentions,
        };

        // Post-submit fixes: bairro/city, product data, and credit debit for each intention
        for (const pi of result.purchase_intentions || []) {
          try {
            // Fix intention header with bairro/city
            await (supabase.from("purchase_intentions") as any)
              .update({
                customer_bairro: params.bairro || "",
                customer_city: params.city || "",
              })
              .eq("id", pi.intention_id);

            // Fix product data via intention items (find items for this intention)
            const { data: itemsData } = await (supabase.from("purchase_intention_items") as any)
              .select("*")
              .eq("intention_id", pi.intention_id);
            for (const item of itemsData || []) {
              const localItem = storeGroups
                .find(g => g.store_id === pi.store_id)
                ?.items.find(i => i.product_id === item.product_id);
              if (localItem && (localItem.product_image_url || localItem.product_title || localItem.product_price)) {
                await (supabase.from("purchase_intention_items") as any)
                  .update({
                    product_title: localItem.product_title || "Produto",
                    product_image_url: localItem.product_image_url || null,
                    unit_price: localItem.product_price || 0,
                    subtotal: (localItem.product_price || 0) * (localItem.quantity || 1),
                  })
                  .eq("id", item.id);
              }
            }

            // Cobrança ao lojista por receber a intenção de compra (5cr,
            // CREDIT_COSTS.visitor_checkout) — feita via RPC segura no banco,
            // que lê o valor real da regra e debita com trava (sem race condition).
            await (supabase.rpc as any)("consume_purchase_intention_credit", {
              p_store_id: pi.store_id,
              p_intention_id: pi.intention_id,
            });
          } catch (e) {
            console.warn(`[GlobalCart] Post-submit fixes failed for intention ${pi.intention_id}:`, e);
          }
        }

        return result;
      },
      onSuccess: () => {
        setLocalCart([]);
      },
      onError: (err: Error) => toast.error(`Erro: ${err.message}`, { duration: 5000 }),
    });
  // ── Convenience methods ───────────────────
  // Aceita tanto a forma posicional (storeId, productId, ...) quanto um único objeto
  // de parâmetros { storeId, productId, ... }. Evita o bug de passar o objeto inteiro
  // como storeId (que deixava productId undefined → crash em productId.slice).
  type AddItemParams = {
    storeId: string; productId: string; quantity?: number;
    productTitle?: string; productImageUrl?: string | null; productPrice?: number;
    storeName?: string; storeLogo?: string | null;
  };
  const addItem = useCallback((
    storeIdOrParams: string | AddItemParams, productId?: string, quantity?: number,
    productTitle?: string, productImageUrl?: string | null, productPrice?: number,
    storeName?: string, storeLogo?: string | null,
  ) => {
    const params: AddItemParams = typeof storeIdOrParams === "object" && storeIdOrParams !== null
      ? storeIdOrParams
      : {
          storeId: storeIdOrParams, productId: productId!, quantity,
          productTitle, productImageUrl, productPrice, storeName, storeLogo,
        };
    return addItemMutation.mutateAsync(params);
  }, [addItemMutation]);

  const refetchAll = useCallback(() => {
    // Try to sync from DB in background
    (async () => {
      try {
        const { data } = await supabase.rpc("get_global_cart_data", { p_session_token: sessionToken });
        if (data && Array.isArray(data) && data.length > 0) {
          console.log("[GlobalCart] DB sync: found", data.length, "store groups");
          // Merge DB data into localStorage if localStorage is empty
          const local = getLocalCart();
          if (local.length === 0) {
            const entries: LocalCartEntry[] = [];
            for (const group of data as any[]) {
              if (!group.items) continue;
              for (const item of group.items) {
                entries.push({
                  item_id: item.item_id,
                  cart_id: group.cart_id,
                  store_id: group.store_id,
                  product_id: item.product_id,
                  product_title: item.product_title || "Produto",
                  product_image_url: item.product_image_url,
                  product_price: item.product_price || 0,
                  quantity: item.quantity,
                  customer_note: item.customer_note,
                  store_name: group.store_name || "Loja",
                  store_logo: group.store_logo,
                  added_at: Date.now(),
                });
              }
            }
            if (entries.length > 0) setLocalCart(entries);
          }
        }
      } catch { /* non-critical */ }
    })();
    return Promise.resolve();
  }, [sessionToken]);

  return {
    storeGroups,
    totalItems,
    totalSubtotal,
    totalStores,
    isLoading,
    addingProductId,
    isAdding: addItemMutation.isPending,
    addItem,
    updateItem: (itemId: string, quantity: number, note?: string) =>
      updateItemMutation.mutateAsync({ itemId, quantity, note }),
    removeItem: (itemId: string) =>
      updateItemMutation.mutateAsync({ itemId, quantity: 0 }),
    submitIntention: submitMutation.mutateAsync,
    isSubmitting: submitMutation.isPending,
    submitResult: submitMutation.data as MultiSubmitResult | undefined,
    refetchAll,
    sessionToken,
  };
}
