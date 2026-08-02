import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getSettings, updateSettings } from "@/services/convenio/settings";
import type { ConvenioSettingsUpdate } from "@/services/convenio/types";

const KEY = ["convenio", "settings"];

export function useConvenioSettings() {
  return useQuery({ queryKey: KEY, queryFn: getSettings, staleTime: 60 * 1000 });
}

export function useUpdateConvenioSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (patch: ConvenioSettingsUpdate) => updateSettings(patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast({ title: "Configurações salvas" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao salvar configurações", description: error.message });
    },
  });
}
