import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface RealEstateUserStats {
  available_credits: number;
  total_listings: number;
  published_listings: number;
  pending_listings: number;
  classification: "Bronze" | "Prata" | "Ouro" | "Diamante";
  email?: string;
  email_verified?: boolean;
}

export function useRealEstateUserStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["real-estate-user-stats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;

      // 1. Fetch Credits
      const { data: balanceData } = await supabase
        .from("real_estate_credit_balances")
        .select("available_credits")
        .eq("owner_user_id", user.id)
        .single();

      // 2. Fetch Listings count
      const { data: listingsData, count } = await supabase
        .from("real_estate_listings")
        .select("id, visibility_status", { count: 'exact' })
        .eq("owner_user_id", user.id);

      const stats: RealEstateUserStats = {
        available_credits: balanceData?.available_credits || 0,
        total_listings: count || 0,
        published_listings: listingsData?.filter(l => l.visibility_status === 'published').length || 0,
        pending_listings: listingsData?.filter(l => l.visibility_status === 'pending_review' || l.visibility_status === 'draft').length || 0,
        classification: "Bronze",
        email: user.email,
        email_verified: !!user.email_confirmed_at
      };

      // Classification Logic (Mocked based on listings for now)
      if (stats.published_listings >= 10) stats.classification = "Diamante";
      else if (stats.published_listings >= 5) stats.classification = "Ouro";
      else if (stats.published_listings >= 2) stats.classification = "Prata";

      return stats;
    },
  });
}
