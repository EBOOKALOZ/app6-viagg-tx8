/**
 * useMerchantNotificationBadges
 *
 * Provides per-module unread counts for the merchant bottom nav,
 * plus recent notifications grouped by module for "Eventos recentes" blocks.
 *
 * Counts come from TWO sources:
 * 1. user_notifications table (general notification system)
 * 2. Direct queries on arremate_offers (pending) and purchase_intentions (new)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { UserNotification } from '@/hooks/useNotifications';

// ── Module mapping ─────────────────────────────
const MODULE_KEYS = [
  'store', 'delivery', 'orders', 'credits',
  'auction', 'arremate', 'm1', 'campaigns', 'wallet', 'profile',
] as const;

export type MerchantModule = (typeof MODULE_KEYS)[number];

export function useMerchantNotificationBadges() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [directCounts, setDirectCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  // ── Get merchant store ID ──
  const [storeId, setStoreId] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await (supabase.from("merchant_stores") as any)
        .select("id").eq("user_id", user.id).limit(1).maybeSingle();
      if (data) setStoreId(data.id);
    })();
  }, [user?.id]);

  // ── Fetch all merchant notifications ──────────
  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('user_id', user.id)
        .in('profile_type', ['lojista', 'all'])
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('[useMerchantNotificationBadges] Fetch error:', error);
        return;
      }
      setNotifications((data || []) as UserNotification[]);
    } catch (err) {
      console.error('[useMerchantNotificationBadges] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // ── Fetch direct pending counts from real tables ──
  const fetchDirectCounts = useCallback(async () => {
    if (!storeId) return;
    try {
      // Get all merchant listings with their types
      const { data: listings } = await (supabase.from("auction_listings") as any)
        .select("id, listing_type")
        .eq("store_id", storeId);

      let auctionPending = 0;
      let arrematePending = 0;

      if (listings?.length) {
        const auctionListingIds = listings.filter((l: any) => l.listing_type !== "arremate").map((l: any) => l.id);
        const arremateListingIds = listings.filter((l: any) => l.listing_type === "arremate").map((l: any) => l.id);

        // Count pending offers for auction listings
        if (auctionListingIds.length) {
          const { count } = await (supabase.from("arremate_offers") as any)
            .select("id", { count: "exact", head: true })
            .in("arremate_listing_id", auctionListingIds)
            .eq("status", "pending");
          auctionPending = count || 0;
        }

        // Count pending offers for arremate listings
        if (arremateListingIds.length) {
          const { count } = await (supabase.from("arremate_offers") as any)
            .select("id", { count: "exact", head: true })
            .in("arremate_listing_id", arremateListingIds)
            .eq("status", "pending");
          arrematePending = count || 0;
        }

        // Also count total arremate offers (including accepted/recent) to ensure badge shows activity
        if (arremateListingIds.length && arrematePending === 0) {
          // Count offers from the last 24h that are not rejected/cancelled
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { count: recentCount } = await (supabase.from("arremate_offers") as any)
            .select("id", { count: "exact", head: true })
            .in("arremate_listing_id", arremateListingIds)
            .not("status", "in", "(rejected,cancelled)")
            .gte("updated_at", since);
          arrematePending = recentCount || 0;
        }
      }

      // New purchase intentions
      const { count: ordersPending } = await (supabase.from("purchase_intentions") as any)
        .select("id", { count: "exact", head: true })
        .eq("store_id", storeId)
        .in("status", ["new"]);

      setDirectCounts({
        auction: auctionPending,
        arremate: arrematePending,
        orders: ordersPending || 0,
      });
    } catch (err) {
      console.error('[useMerchantNotificationBadges] Direct counts error:', err);
    }
  }, [storeId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { fetchDirectCounts(); }, [fetchDirectCounts]);

  // ── Realtime subscription for notifications ───
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`merchant-badges:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const n = payload.new as UserNotification;
            if (n.profile_type === 'lojista' || n.profile_type === 'all') {
              setNotifications(prev => [n, ...prev]);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as UserNotification;
            setNotifications(prev =>
              prev.map(n => (n.id === updated.id ? updated : n))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            setNotifications(prev => prev.filter(n => n.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // ── Realtime for arremate_offers + purchase_intentions ──
  useEffect(() => {
    if (!storeId) return;

    const channel = supabase
      .channel(`merchant-offer-badges:${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'arremate_offers' },
        () => { fetchDirectCounts(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_intentions', filter: `store_id=eq.${storeId}` },
        () => { fetchDirectCounts(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [storeId, fetchDirectCounts]);

  // ── Badge counts per module (merge notification + direct) ──
  const badgeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    // From notification system
    for (const n of notifications) {
      if (!n.is_read && n.source_module) {
        counts[n.source_module] = (counts[n.source_module] || 0) + 1;
      }
    }
    // Merge direct counts (use the higher of the two)
    for (const [mod, directCount] of Object.entries(directCounts)) {
      counts[mod] = Math.max(counts[mod] || 0, directCount);
    }
    return counts;
  }, [notifications, directCounts]);

  // ── Recent notifications for a module ─────────
  const recentByModule = useCallback(
    (module: string, limit = 5): UserNotification[] => {
      return notifications
        .filter(n => n.source_module === module)
        .slice(0, limit);
    },
    [notifications]
  );

  // ── Mark section as read ──────────────────────
  const markSectionAsRead = useCallback(
    async (module: string) => {
      if (!user?.id) return;

      const unreadIds = notifications
        .filter(n => n.source_module === module && !n.is_read)
        .map(n => n.id);

      if (unreadIds.length === 0 && !directCounts[module]) return;

      // Mark notifications as read
      if (unreadIds.length > 0) {
        const { error } = await supabase
          .from('user_notifications')
          .update({ is_read: true, read_at: new Date().toISOString() } as any)
          .eq('user_id', user.id)
          .eq('source_module', module)
          .eq('is_read', false);

        if (error) {
          console.error('[useMerchantNotificationBadges] markSectionAsRead error:', error);
          return;
        }
      }

      // Optimistic update for notifications
      setNotifications(prev =>
        prev.map(n =>
          n.source_module === module && !n.is_read
            ? { ...n, is_read: true, read_at: new Date().toISOString() }
            : n
        )
      );

      // Refetch direct counts after marking as read
      fetchDirectCounts();
    },
    [user?.id, notifications, directCounts, fetchDirectCounts]
  );

  return {
    badgeCounts,
    recentByModule,
    markSectionAsRead,
    isLoading,
    refetch: () => { fetchAll(); fetchDirectCounts(); },
  };
}
