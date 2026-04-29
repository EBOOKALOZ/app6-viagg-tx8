import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export function useIsAdvertiser() {
  const { user, initialized } = useAuth();

  const { data: isAdvertiser, isLoading } = useQuery({
    queryKey: ["is-advertiser", user?.id],
    enabled: !!user?.id && initialized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advertiser_accounts")
        .select("id")
        .eq("id", user?.id)
        .maybeSingle();
      
      if (error) {
        console.error("[useIsAdvertiser] Error:", error);
        return false;
      }
      return !!data;
    }
  });

  return { isAdvertiser, isLoading };
}
