import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Comando Convênio Fase 1 — verifica se o usuário logado tem o papel
 * "gestor_convenio" (RBAC user_role_assignments) OU é admin/ceo, via
 * a função is_gestor_convenio() (SECURITY DEFINER) criada na migration
 * 20260801_convenio_fase1_schema.sql.
 *
 * Segue o mesmo formato de useSupportRole — não duplica ProtectedRoute.
 */
export function useGestorConvenioRole() {
  const { user } = useAuth();

  const { data: isGestor, isLoading } = useQuery({
    queryKey: ["gestor-convenio-role", user?.id],
    queryFn: async (): Promise<boolean> => {
      if (!user?.id) return false;

      const { data, error } = await supabase.rpc("is_gestor_convenio" as never);
      if (error) return false;
      return data === true;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  return { isGestorConvenio: isGestor ?? false, isLoading };
}
