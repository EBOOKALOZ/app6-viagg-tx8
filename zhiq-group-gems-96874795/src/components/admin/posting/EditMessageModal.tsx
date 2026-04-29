import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save } from "lucide-react";
import { MessageLibraryItem, updateMessageLibraryItem } from "@/lib/postingApi";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface EditMessageModalProps {
  message: MessageLibraryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditMessageModal({ message, open, onOpenChange }: EditMessageModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    body: "",
    priority: 3,
    allow_link: false,
    min_days_between_same_group: 6,
    is_active: true,
    category: "",
  });

  useEffect(() => {
    if (message) {
      setForm({
        title: message.title || "",
        body: message.body || "",
        priority: message.priority ?? 3,
        allow_link: message.allow_link ?? false,
        min_days_between_same_group: message.min_days_between_same_group ?? 6,
        is_active: message.is_active ?? true,
        category: message.category || "",
      });
    }
  }, [message]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!message) throw new Error("No message");
      return updateMessageLibraryItem(message.id, form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-library"] });
      toast.success("Mensagem atualizada!");
      onOpenChange(false);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  if (!message) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Mensagem</DialogTitle>
          <DialogDescription>Configurações avançadas da mensagem</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Conteúdo</Label>
            <Textarea value={form.body} onChange={(e) => setForm(p => ({ ...p, body: e.target.value }))} rows={4} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Prioridade (1–5)</Label>
              <Select value={String(form.priority)} onValueChange={(v) => setForm(p => ({ ...p, priority: Number(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map(n => (
                    <SelectItem key={n} value={String(n)}>P{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Intervalo mín. (dias)</Label>
              <Input type="number" min={1} value={form.min_days_between_same_group} onChange={(e) => setForm(p => ({ ...p, min_days_between_same_group: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Input value={form.category} onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))} placeholder="Ex: institucional, promoção..." />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label>Permitir Link</Label>
            <Switch checked={form.allow_link} onCheckedChange={(v) => setForm(p => ({ ...p, allow_link: v }))} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label>Ativo</Label>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm(p => ({ ...p, is_active: v }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
