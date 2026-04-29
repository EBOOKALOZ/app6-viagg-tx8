import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ═══════════════════════════════════════
// Tables to watch for realtime changes
// ═══════════════════════════════════════
const WATCHED_TABLES = [
    "merchant_stores",
    "profiles",
    "merchant_marketing_products",
    "merchant_credit_ledger",
    "merchant_credit_balances",
    "purchase_intentions",
    "store_purchase_intentions",
    "delivery_orders",
    "service_orders",
    "auction_listings",
    "arremate_listings",
    "m1_billing_events",
    "campaign_batches",
] as const;

const QUERY_KEY = "admin-stores-full";
const DEBOUNCE_MS = 500;
const FALLBACK_POLL_MS = 60_000; // Silent revalidation every 60s

/**
 * Realtime subscription hook for the /admin/lojas page.
 * 
 * Subscribes to Supabase Realtime on key tables and invalidates
 * the React Query cache with debounce. Falls back to periodic
 * polling if realtime fails.
 */
export function useAdminStoresRealtime() {
    const queryClient = useQueryClient();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());
    const [isConnected, setIsConnected] = useState(true);

    // Debounced invalidation — coalesces rapid events
    const invalidateStores = useCallback(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
            setLastSyncedAt(new Date());
        }, DEBOUNCE_MS);
    }, [queryClient]);

    useEffect(() => {
        // 1. Build realtime channel with all table subscriptions
        let channel = supabase.channel("admin-stores-live", {
            config: { broadcast: { self: true } },
        });

        WATCHED_TABLES.forEach((table) => {
            channel = channel.on(
                "postgres_changes" as any,
                { event: "*", schema: "public", table },
                () => invalidateStores()
            );
        });

        // Track connection status
        channel.subscribe((status) => {
            if (status === "SUBSCRIBED") {
                setIsConnected(true);
            } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
                setIsConnected(false);
            }
        });

        // 2. Fallback: silent periodic revalidation
        const pollInterval = setInterval(() => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
            setLastSyncedAt(new Date());
        }, FALLBACK_POLL_MS);

        // 3. Cleanup
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            clearInterval(pollInterval);
            supabase.removeChannel(channel);
        };
    }, [invalidateStores, queryClient]);

    return {
        lastSyncedAt,
        isConnected,
    };
}
