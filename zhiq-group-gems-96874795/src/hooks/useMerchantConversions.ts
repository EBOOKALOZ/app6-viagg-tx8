import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ConversionEvent {
  id: string;
  store_id: string;
  product_id: string | null;
  product_title: string | null;
  event_type: 'wattsapp_purchase' | 'auction_won' | 'arremate_won';
  event_label: string;
  customer_name: string | null;
  customer_whatsapp: string | null;
  amount: number;
  source_table: string;
  source_id: string;
  status: string;
  created_at: string;
}

export function useMerchantConversions() {
  const { user } = useAuth();

  const {
    data: conversions = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["merchant-conversions", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get merchant's store
      const { data: store } = await supabase
        .from("merchant_stores")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!store) return [];

      const { data, error } = await supabase
        .from("merchant_conversion_events_view" as any)
        .select("*")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching conversions:", error);
        return [];
      }

      return data as ConversionEvent[];
    },
    enabled: !!user?.id,
    refetchInterval: 30000, // 30 seconds for semi-realtime
  });

  return {
    conversions,
    isLoading,
    refetch,
  };
}
