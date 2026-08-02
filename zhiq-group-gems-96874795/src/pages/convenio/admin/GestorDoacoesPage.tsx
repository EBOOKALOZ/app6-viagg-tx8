/**
 * /convenio-admin/doacoes — Comando Convênio Fase 1.
 * Histórico real de doações (convenio_donations). Sem gateway de pagamento
 * ativo — cadastro manual (source='manual'), preparado para integração futura.
 */
import { useState } from "react";
import { HeartHandshake, Plus } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorEntityTable, GestorStatusBadge } from "@/components/convenio/GestorEntityTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useConvenioCampaignsForPicker } from "@/hooks/convenio/useConvenioCampaigns";
import { useConvenioDonations, useCreateConvenioDonation } from "@/hooks/convenio/useConvenioDonations";

function RegisterDonationDialog() {
  const [open, setOpen] = useState(false);
  const [donorName, setDonorName] = useState("");
  const [amount, setAmount] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const campaignsQuery = useConvenioCampaignsForPicker();
  const createMutation = useCreateConvenioDonation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(
      {
        donor_name: isAnonymous ? null : donorName || null,
        is_anonymous: isAnonymous,
        amount: Number(amount),
        campaign_id: campaignId || null,
        status: "confirmada",
      },
      {
        onSuccess: () => {
          setOpen(false);
          setDonorName("");
          setAmount("");
          setCampaignId("");
          setIsAnonymous(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl">
          <Plus className="h-4 w-4" /> Registrar Doação
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Doação</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox id="donation-anonymous" checked={isAnonymous} onCheckedChange={(v) => setIsAnonymous(v === true)} />
            <Label htmlFor="donation-anonymous">Doação anônima</Label>
          </div>
          {!isAnonymous && (
            <div className="space-y-1.5">
              <Label htmlFor="donation-donor">Nome do doador</Label>
              <Input id="donation-donor" value={donorName} onChange={(e) => setDonorName(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="donation-amount">Valor (R$)</Label>
            <Input id="donation-amount" type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="donation-campaign">Campanha</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger id="donation-campaign">
                <SelectValue placeholder="Selecione a campanha (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {(campaignsQuery.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createMutation.isPending || !amount}>
              {createMutation.isPending ? "Registrando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function GestorDoacoesPage() {
  const donationsQuery = useConvenioDonations();

  return (
    <div>
      <GestorPageHeader
        icon={HeartHandshake}
        title="Doações"
        subtitle="Histórico de doações por campanha"
        action={<RegisterDonationDialog />}
      />

      {donationsQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <GestorEntityTable
          getRowKey={(row) => row.id}
          rows={donationsQuery.data ?? []}
          emptyLabel="Nenhuma doação registrada ainda."
          columns={[
            { header: "Doador", render: (r) => (r.is_anonymous ? "Anônimo" : r.donor_name ?? "—") },
            { header: "Valor", render: (r) => <span className="font-bold text-white">R$ {Number(r.amount).toLocaleString("pt-BR")}</span> },
            { header: "Campanha", render: (r) => r.campaign_title ?? "—" },
            { header: "Status", render: (r) => <GestorStatusBadge status={r.status} /> },
            { header: "Data", render: (r) => new Date(r.created_at).toLocaleDateString("pt-BR") },
          ]}
        />
      )}
    </div>
  );
}
