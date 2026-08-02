import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  changeAgreementStatus,
  createAgreement,
  listAgreementHistory,
  listAgreements,
  updateAgreement,
} from "@/services/convenio/agreements";
import type { ConvenioAgreementInsert, ConvenioAgreementStatus, ConvenioAgreementUpdate } from "@/services/convenio/types";

const KEY = ["convenio", "agreements"];

export function useConvenioAgreements() {
  return useQuery({ queryKey: KEY, queryFn: listAgreements, staleTime: 30 * 1000 });
}

export function useConvenioAgreementHistory(agreementId: string | null) {
  return useQuery({
    queryKey: ["convenio", "agreement-history", agreementId],
    queryFn: () => listAgreementHistory(agreementId as string),
    enabled: !!agreementId,
  });
}

export function useCreateConvenioAgreement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: ConvenioAgreementInsert) => createAgreement(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["convenio", "dashboard-stats"] });
      toast({ title: "Convênio criado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao criar convênio", description: error.message });
    },
  });
}

export function useUpdateConvenioAgreement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConvenioAgreementUpdate }) => updateAgreement(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast({ title: "Convênio atualizado" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao atualizar convênio", description: error.message });
    },
  });
}

export function useChangeConvenioAgreementStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ConvenioAgreementStatus }) => changeAgreementStatus(id, status),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["convenio", "agreement-history", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["convenio", "dashboard-stats"] });
      toast({ title: "Status do convênio atualizado" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao mudar status", description: error.message });
    },
  });
}
