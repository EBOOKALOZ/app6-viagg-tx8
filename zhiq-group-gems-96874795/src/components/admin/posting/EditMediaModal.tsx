import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save } from "lucide-react";
import { MediaItem, updateMediaFields } from "@/lib/postingApi";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface EditMediaModalProps {
  media: MediaItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CAMPAIGN_TYPES = [
  { value: "institucional", label: "Institucional" },
  { value: "crescimento", label: "Crescimento" },
  { value: "dominacao", label: "Dominação" },
];

export function EditMediaModal({ media, open, onOpenChange }: EditMediaModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: 3,
    max_daily_usage: 10,
    min_days_between_same_group: 6,
    campaign_type: "institucional",
    is_active: true,
  });

  useEffect(() => {
    if (media) {
      setForm({
        title: media.title || "",
        description: media.description || "",
        priority: media.priority ?? 3,
        max_daily_usage: media.max_daily_usage ?? 10,
        min_days_between_same_group: media.min_days_between_same_group ?? 6,
        campaign_type: media.campaign_type || "institucional",
        is_active: media.is_active ?? true,
      });
    }
  }, [media]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!media) throw new Error("No media");
      return updateMediaFields(media.id, form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-library"] });
      toast.success("Mídia atualizada!");
      onOpenChange(false);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  if (!media) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Mídia</DialogTitle>
          <DialogDescription>Configurações avançadas da mídia</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
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
              <Label>Limite Diário</Label>
              <Input type="number" min={1} value={form.max_daily_usage} onChange={(e) => setForm(p => ({ ...p, max_daily_usage: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Intervalo mín. (dias)</Label>
              <Input type="number" min={1} value={form.min_days_between_same_group} onChange={(e) => setForm(p => ({ ...p, min_days_between_same_group: Number(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Campanha</Label>
              <Select value={form.campaign_type} onValueChange={(v) => setForm(p => ({ ...p, campaign_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
