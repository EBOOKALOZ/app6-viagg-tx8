import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Loader2, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRequireAuth } from '@/hooks/useRequireAuth';

const REPORT_REASONS = [
  "Fraude ou golpe",
  "Produto falsificado",
  "Anúncio enganoso",
  "Conteúdo ofensivo ou ilegal",
  "Venda proibida",
  "Outro motivo"
];

export function AuctionReportModal({ listingId, triggerClass }: { listingId: string, triggerClass?: string }) {
  const requireAuth = useRequireAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");

  const reportMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { error } = await supabase
        .from('auction_reports')
        .insert({
          auction_listing_id: listingId,
          reporter_user_id: user.id,
          reason,
          details: details.trim() || null
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Denúncia registrada. Nossa equipe irá analisar em breve.");
      setOpen(false);
      setReason("");
      setDetails("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao enviar denúncia");
    }
  });

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      requireAuth(() => setOpen(true), { kind: 'auction_report', label: 'denunciar este anúncio' });
    } else {
      setOpen(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) {
      toast.error("Por favor, selecione um motivo.");
      return;
    }
    reportMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className={triggerClass || "flex items-center gap-2 text-[#8E98A3] hover:text-red-400 text-sm font-bold transition-colors"}>
          <Flag className="w-4 h-4" />
          Denunciar anúncio
        </button>
      </DialogTrigger>
      
      <DialogContent className="bg-[#1B1F24] border-[#323A45] text-white sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-500">
            <AlertTriangle className="w-5 h-5" />
            Denunciar Anúncio
          </DialogTitle>
          <DialogDescription className="text-[#8E98A3]">
            Sua denúncia é sigilosa. Selecione o motivo que melhor descreve o problema.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label className="text-sm font-bold text-white">Motivo Principal</label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="bg-[#1A1F24] border-[#323A45] focus:ring-red-500 text-white">
                <SelectValue placeholder="Selecione um motivo" />
              </SelectTrigger>
              <SelectContent className="bg-[#252B33] border-[#323A45] text-white">
                {REPORT_REASONS.map(r => (
                  <SelectItem key={r} value={r} className="focus:bg-[#323A45] focus:text-white cursor-pointer">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-white">Detalhes adicionais (opcional)</label>
            <Textarea
              placeholder="Descreva com mais detalhes o que está errado..."
              className="min-h-[100px] resize-none bg-[#1A1F24] border-[#323A45] text-white focus-visible:ring-red-500 placeholder:text-[#5C6670]"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="text-[#B8C2CC] hover:bg-[#323A45] hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!reason || reportMutation.isPending}
              className="bg-red-500 hover:bg-red-600 text-white font-bold px-6"
            >
              {reportMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enviar Denúncia
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
