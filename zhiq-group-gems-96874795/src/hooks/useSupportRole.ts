import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type SupportRole = "supervisor" | "agent" | null;

export function useSupportRole() {
    const { user } = useAuth();

    const { data: role, isLoading } = useQuery({
        queryKey: ["support-role", user?.id],
        queryFn: async (): Promise<SupportRole> => {
            if (!user?.id) return null;

            const { data, error } = await supabase
                .from("support_agents" as any)
                .select("role")
                .eq("auth_user_id", user.id)
                .eq("is_active", true)
                .maybeSingle();

            if (error || !data) return null;
            return (data as any).role as SupportRole;
        },
        enabled: !!user?.id,
        staleTime: 5 * 60 * 1000,
    });

    return { supportRole: role ?? null, isLoading };
}
