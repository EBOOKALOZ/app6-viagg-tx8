import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  countEntitiesByCategory,
  createEntity,
  listAllEntitiesForPicker,
  listEntities,
  updateEntity,
} from "@/services/convenio/entities";
import type { ConvenioEntityCategory, ConvenioEntityInsert, ConvenioEntityUpdate } from "@/services/convenio/types";

export function useConvenioEntityCounts() {
  return useQuery({
    queryKey: ["convenio", "entities", "counts"],
    queryFn: countEntitiesByCategory,
    staleTime: 30 * 1000,
  });
}

export function useConvenioEntities(category: ConvenioEntityCategory) {
  return useQuery({
    queryKey: ["convenio", "entities", category],
    queryFn: () => listEntities(category),
    staleTime: 30 * 1000,
  });
}

export function useConvenioEntitiesForPicker() {
  return useQuery({
    queryKey: ["convenio", "entities", "picker"],
    queryFn: listAllEntitiesForPicker,
    staleTime: 60 * 1000,
  });
}

export function useCreateConvenioEntity(category: ConvenioEntityCategory) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: ConvenioEntityInsert) => createEntity(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["convenio", "entities", category] });
      queryClient.invalidateQueries({ queryKey: ["convenio", "entities", "counts"] });
      queryClient.invalidateQueries({ queryKey: ["convenio", "dashboard-stats"] });
      toast({ title: "Cadastro criado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao cadastrar", description: error.message });
    },
  });
}

export function useUpdateConvenioEntity(category: ConvenioEntityCategory) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConvenioEntityUpdate }) => updateEntity(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["convenio", "entities", category] });
      toast({ title: "Cadastro atualizado" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao atualizar", description: error.message });
    },
  });
}
