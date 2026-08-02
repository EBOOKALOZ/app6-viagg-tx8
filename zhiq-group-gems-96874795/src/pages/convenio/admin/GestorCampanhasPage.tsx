/**
 * /convenio-admin/campanhas — Comando Convênio Fase 1.
 * CRUD real de campanhas de doação. Sem processamento financeiro nesta fase
 * (raised_amount é atualizado manualmente pelo Gestor até haver gateway ativo).
 */
import { useState } from "react";
import { Megaphone, Plus } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorEntityTable, GestorStatusBadge } from "@/components/convenio/GestorEntityTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useConvenioCampaigns, useCreateConvenioCampaign, useUpdateConvenioCampaign } from "@/hooks/convenio/useConvenioCampaigns";
import type { ConvenioCampaignStatus } from "@/services/convenio/types";

const STATUS_OPTIONS: ConvenioCampaignStatus[] = ["planejada", "ativa", "pausada", "encerrada"];

function CreateCampaignDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const createMutation = useCreateConvenioCampaign();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(
      { title, description: description || null, goal_amount: goalAmount ? Number(goalAmount) : 0 },
      {
        onSuccess: () => {
          setOpen(false);
          setTitle("");
          setDescription("");
          setGoalAmount("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl">
          <Plus className="h-4 w-4" /> Nova Campanha
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Campanha</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="campaign-title">Título</Label>
            <Input id="campaign-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-goal">Meta (R$)</Label>
            <Input id="campaign-goal" type="number" min="0" step="0.01" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-description">Descrição</Label>
            <Textarea id="campaign-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createMutation.isPending || !title}>
              {createMutation.isPending ? "Criando..." : "Criar Campanha"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function GestorCampanhasPage() {
  const campaignsQuery = useConvenioCampaigns();
  const updateMutation = useUpdateConvenioCampaign();

  return (
    <div>
      <GestorPageHeader
        icon={Megaphone}
        title="Campanhas"
        subtitle="Metas, histórico e indicadores das campanhas de doação"
        action={<CreateCampaignDialog />}
      />

      {campaignsQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <GestorEntityTable
          getRowKey={(row) => row.id}
          rows={campaignsQuery.data ?? []}
          emptyLabel="Nenhuma campanha cadastrada ainda."
          columns={[
            { header: "Campanha", render: (r) => <span className="font-bold text-white">{r.title}</span> },
            {
              header: "Status",
              render: (r) => (
                <Select
                  value={r.status}
                  onValueChange={(status) => updateMutation.mutate({ id: r.id, patch: { status } })}
                >
                  <SelectTrigger className="h-7 w-32 border-none bg-transparent p-0">
                    <GestorStatusBadge status={r.status} />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ),
            },
            { header: "Meta", render: (r) => `R$ ${Number(r.goal_amount ?? 0).toLocaleString("pt-BR")}` },
            { header: "Arrecadado", render: (r) => `R$ ${Number(r.raised_amount).toLocaleString("pt-BR")}` },
            {
              header: "Progresso",
              render: (r) => {
                const goal = Number(r.goal_amount ?? 0);
                const raised = Number(r.raised_amount);
                const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
                return (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-white/50">{pct}%</span>
                  </div>
                );
              },
            },
          ]}
        />
      )}
    </div>
  );
}
