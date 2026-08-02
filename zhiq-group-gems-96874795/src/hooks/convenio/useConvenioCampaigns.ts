import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { createCampaign, listActiveCampaignsForPicker, listCampaigns, updateCampaign } from "@/services/convenio/campaigns";
import type { ConvenioCampaignInsert, ConvenioCampaignUpdate } from "@/services/convenio/types";

const KEY = ["convenio", "campaigns"];

export function useConvenioCampaigns() {
  return useQuery({ queryKey: KEY, queryFn: listCampaigns, staleTime: 30 * 1000 });
}

export function useConvenioCampaignsForPicker() {
  return useQuery({
    queryKey: ["convenio", "campaigns", "picker"],
    queryFn: listActiveCampaignsForPicker,
    staleTime: 60 * 1000,
  });
}

export function useCreateConvenioCampaign() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: ConvenioCampaignInsert) => createCampaign(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["convenio", "dashboard-stats"] });
      toast({ title: "Campanha criada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao criar campanha", description: error.message });
    },
  });
}

export function useUpdateConvenioCampaign() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConvenioCampaignUpdate }) => updateCampaign(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["convenio", "dashboard-stats"] });
      toast({ title: "Campanha atualizada" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao atualizar campanha", description: error.message });
    },
  });
}
