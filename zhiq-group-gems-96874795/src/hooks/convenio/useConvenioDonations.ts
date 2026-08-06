import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { createDonation, listDonations, updateDonationStatus } from "@/services/convenio/donations";
import type { ConvenioDonationInsert, ConvenioDonationStatus } from "@/services/convenio/types";

const KEY = ["convenio", "donations"];

// Doações mudam raised_amount (trigger no banco) e os agregados públicos —
// toda mutação invalida campanhas, dashboard e vitrine pública juntas.
function invalidateDonationDependents(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: KEY });
  queryClient.invalidateQueries({ queryKey: ["convenio", "campaigns"] });
  queryClient.invalidateQueries({ queryKey: ["convenio", "dashboard-stats"] });
  queryClient.invalidateQueries({ queryKey: ["convenio", "public"] });
}

export function useConvenioDonations(page = 0) {
  return useQuery({ queryKey: [...KEY, page], queryFn: () => listDonations(page), staleTime: 30 * 1000 });
}

export function useCreateConvenioDonation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: ConvenioDonationInsert) => createDonation(input),
    onSuccess: () => {
      invalidateDonationDependents(queryClient);
      toast({ title: "Doação registrada" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao registrar doação", description: error.message });
    },
  });
}

export function useUpdateConvenioDonationStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (params: { id: string; from: ConvenioDonationStatus; to: ConvenioDonationStatus }) =>
      updateDonationStatus(params),
    onSuccess: (_data, variables) => {
      invalidateDonationDependents(queryClient);
      toast({ title: variables.to === "estornada" ? "Doação estornada" : "Status da doação atualizado" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao mudar status da doação", description: error.message });
    },
  });
}
