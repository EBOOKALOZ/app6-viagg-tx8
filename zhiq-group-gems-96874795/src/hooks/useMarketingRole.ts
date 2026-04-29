import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useMarketingRole() {
  const { user } = useAuth();

  const { data: role, isLoading } = useQuery({
    queryKey: ["marketing-role", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("v_marketing_my_role" as any)
        .select("role")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (error || !data) return null;
      return (data as any).role as string;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  return { marketingRole: role ?? null, isLoading };
}
