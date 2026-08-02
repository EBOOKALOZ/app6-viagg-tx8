import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  archiveAccountability,
  createAccountability,
  getAccountabilityDocumentUrl,
  listAccountability,
  publishAccountability,
  uploadAccountabilityDocument,
} from "@/services/convenio/accountability";
import type { ConvenioAccountabilityInsert } from "@/services/convenio/types";

const KEY = ["convenio", "accountability"];

export function useConvenioAccountability() {
  return useQuery({ queryKey: KEY, queryFn: listAccountability, staleTime: 30 * 1000 });
}

export function useCreateConvenioAccountability() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ input, file }: { input: ConvenioAccountabilityInsert; file: File | null }) => {
      const document_url = file ? await uploadAccountabilityDocument(file) : input.document_url ?? null;
      return createAccountability({ ...input, document_url });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["convenio", "dashboard-stats"] });
      toast({ title: "Relatório de prestação de contas criado" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao criar relatório", description: error.message });
    },
  });
}

export function usePublishConvenioAccountability() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => publishAccountability(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["convenio", "dashboard-stats"] });
      toast({ title: "Relatório publicado" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao publicar", description: error.message });
    },
  });
}

export function useArchiveConvenioAccountability() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => archiveAccountability(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast({ title: "Relatório arquivado" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao arquivar", description: error.message });
    },
  });
}

export async function openAccountabilityDocument(path: string) {
  const url = await getAccountabilityDocumentUrl(path);
  window.open(url, "_blank", "noopener,noreferrer");
}
