import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { installAudioUnlocker, playNotificationSound } from "@/lib/notificationSound";

/**
 * Assina mudanças em tabelas-chave do Supabase e invalida queries do React Query
 * em qualquer lugar do app — sem necessidade de F5.
 *
 * Mount uma vez no App (dentro do AuthProvider).
 */
export function GlobalRealtime() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Destrava áudio na 1ª interação do usuário (necessário pra autoplay policy)
  useEffect(() => {
    installAudioUnlocker();
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const invalidateAll = () => {
      queryClient.invalidateQueries();
    };

    const tables = [
      "discount_requests",
      "advertiser_listings",
      "advertiser_listing_media",
      "merchant_marketing_products",
      "merchant_products",
      "purchase_intentions",
      "purchase_intention_items",
      "contact_intentions",
      "advertiser_contact_intentions",
      "real_estate_listings",
      "vehicle_listings",
      "auction_listings",
      "store_credit_wallet",
      "credit_transactions",
      "product_interest_events",
      "m1_billing_events",
    ];

    const channel = supabase.channel(`global-realtime-${user.id}`);
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          invalidateAll();
          if (table === "discount_requests" && payload.eventType === "INSERT") {
            playNotificationSound();
            toast.success("🔔 Nova oferta recebida!", { duration: 4000 });
          }
          if (table === "purchase_intentions" && payload.eventType === "INSERT") {
            playNotificationSound();
            toast.success("🛒 Novo pedido recebido!", { duration: 4000 });
          }
        }
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  return null;
}
