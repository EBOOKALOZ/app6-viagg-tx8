import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { listMessages, markMessageRead, sendMessage } from "@/services/convenio/messages";
import type { ConvenioMessageInsert } from "@/services/convenio/types";

const KEY = ["convenio", "messages"];

export function useConvenioMessages() {
  return useQuery({ queryKey: KEY, queryFn: listMessages, staleTime: 15 * 1000 });
}

export function useSendConvenioMessage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: ConvenioMessageInsert) => sendMessage(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast({ title: "Mensagem enviada" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao enviar mensagem", description: error.message });
    },
  });
}

export function useMarkConvenioMessageRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markMessageRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
