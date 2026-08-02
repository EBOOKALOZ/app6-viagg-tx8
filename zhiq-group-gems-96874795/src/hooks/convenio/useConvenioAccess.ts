import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { grantGestorRole, listGestores, revokeGestorRole } from "@/services/convenio/access";

const KEY = ["convenio", "gestores"];

export function useConvenioGestores() {
  return useQuery({ queryKey: KEY, queryFn: listGestores, staleTime: 15 * 1000 });
}

export function useGrantConvenioGestorRole() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (email: string) => grantGestorRole(email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast({ title: "Acesso concedido" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao conceder acesso", description: error.message });
    },
  });
}

export function useRevokeConvenioGestorRole() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (email: string) => revokeGestorRole(email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast({ title: "Acesso revogado" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao revogar acesso", description: error.message });
    },
  });
}
