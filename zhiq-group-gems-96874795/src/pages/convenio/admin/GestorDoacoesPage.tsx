/**
 * /convenio-admin/doacoes — Comando Convênio Fase 1.
 * Histórico real de doações (convenio_donations), paginado no servidor.
 * Sem gateway de pagamento ativo — cadastro manual (source='manual').
 * Workflow completo: registrada → confirmada → estornada (máquina de estados
 * validada no cliente e imposta por trigger no banco); estorno exige
 * confirmação e ajusta raised_amount da campanha automaticamente.
 */
import { useState } from "react";
import { ChevronLeft, ChevronRight, HeartHandshake, Plus } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorEntityTable, GestorStatusBadge } from "@/components/convenio/GestorEntityTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { GestorQueryState } from "@/components/convenio/GestorQueryState";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useConvenioCampaignsForPicker } from "@/hooks/convenio/useConvenioCampaigns";
import {
  useConvenioDonations,
  useCreateConvenioDonation,
  useUpdateConvenioDonationStatus,
} from "@/hooks/convenio/useConvenioDonations";
import { allowedNextStatuses } from "@/lib/convenio/statusTransitions";
import type { ConvenioDonationStatus } from "@/services/convenio/types";

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

interface PendingStatusChange {
  id: string;
  from: ConvenioDonationStatus;
  to: ConvenioDonationStatus;
  label: string;
}

export default function GestorDoacoesPage() {
  const [page, setPage] = useState(0);
  const [pendingEstorno, setPendingEstorno] = useState<PendingStatusChange | null>(null);
  const donationsQuery = useConvenioDonations(page);
  const statusMutation = useUpdateConvenioDonationStatus();

  const requestStatusChange = (change: PendingStatusChange) => {
    if (change.to === "estornada") {
      setPendingEstorno(change); // estorno é irreversível — exige confirmação
      return;
    }
    statusMutation.mutate(change);
  };

  const rows = donationsQuery.data?.rows ?? [];

  return (
    <div>
      <GestorPageHeader
        icon={HeartHandshake}
        title="Doações"
        subtitle="Histórico de doações por campanha"
        action={<RegisterDonationDialog />}
      />

      <GestorQueryState
        isLoading={donationsQuery.isLoading}
        isError={donationsQuery.isError}
        error={donationsQuery.error}
        onRetry={() => donationsQuery.refetch()}
      >
        <GestorEntityTable
          getRowKey={(row) => row.id}
          rows={rows}
          emptyLabel="Nenhuma doação registrada ainda."
          columns={[
            { header: "Doador", render: (r) => (r.is_anonymous ? "Anônimo" : r.donor_name ?? "—") },
            { header: "Valor", render: (r) => <span className="font-bold text-white">R$ {Number(r.amount).toLocaleString("pt-BR")}</span> },
            { header: "Campanha", render: (r) => r.campaign_title ?? "—" },
            {
              header: "Status",
              render: (r) => {
                const next = allowedNextStatuses("donation", r.status) as ConvenioDonationStatus[];
                if (next.length === 0) return <GestorStatusBadge status={r.status} />;
                return (
                  <Select
                    value={r.status}
                    onValueChange={(to) =>
                      requestStatusChange({
                        id: r.id,
                        from: r.status as ConvenioDonationStatus,
                        to: to as ConvenioDonationStatus,
                        label: r.is_anonymous ? "doação anônima" : `doação de ${r.donor_name ?? "doador não informado"}`,
                      })
                    }
                  >
                    <SelectTrigger className="h-7 w-32 border-none bg-transparent p-0">
                      <GestorStatusBadge status={r.status} />
                    </SelectTrigger>
                    <SelectContent>
                      {next.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              },
            },
            { header: "Data", render: (r) => new Date(r.created_at).toLocaleDateString("pt-BR") },
          ]}
        />

        {(page > 0 || donationsQuery.data?.hasMore) && (
          <div className="mt-4 flex items-center justify-between">
            <Button
              size="sm"
              variant="outline"
              className="gap-1 border-white/15 bg-transparent text-white/70"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <span className="text-xs text-white/40">Página {page + 1}</span>
            <Button
              size="sm"
              variant="outline"
              className="gap-1 border-white/15 bg-transparent text-white/70"
              disabled={!donationsQuery.data?.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </GestorQueryState>

      <AlertDialog open={!!pendingEstorno} onOpenChange={(open) => !open && setPendingEstorno(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar doação?</AlertDialogTitle>
            <AlertDialogDescription>
              O estorno da {pendingEstorno?.label} é definitivo: a doação sai dos totais públicos e o
              arrecadado da campanha é recalculado. Esta ação fica registrada na auditoria e não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500"
              onClick={() => {
                if (pendingEstorno) statusMutation.mutate(pendingEstorno);
                setPendingEstorno(null);
              }}
            >
              Confirmar estorno
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
