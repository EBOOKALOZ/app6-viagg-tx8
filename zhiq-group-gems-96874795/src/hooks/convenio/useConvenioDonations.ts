import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { createDonation, listDonations } from "@/services/convenio/donations";
import type { ConvenioDonationInsert } from "@/services/convenio/types";

const KEY = ["convenio", "donations"];

export function useConvenioDonations() {
  return useQuery({ queryKey: KEY, queryFn: listDonations, staleTime: 30 * 1000 });
}

export function useCreateConvenioDonation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: ConvenioDonationInsert) => createDonation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["convenio", "dashboard-stats"] });
      toast({ title: "Doação registrada" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao registrar doação", description: error.message });
    },
  });
}
