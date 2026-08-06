/**
 * /convenio-admin/convenios — Comando Convênio Fase 1.
 * CRUD real de convênios: criar, editar, mudar status, ver histórico.
 */
import { useState } from "react";
import { Handshake, Plus } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorEntityTable, GestorStatusBadge } from "@/components/convenio/GestorEntityTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { GestorQueryState } from "@/components/convenio/GestorQueryState";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useChangeConvenioAgreementStatus,
  useConvenioAgreementHistory,
  useConvenioAgreements,
  useCreateConvenioAgreement,
} from "@/hooks/convenio/useConvenioAgreements";
import { useConvenioEntitiesForPicker } from "@/hooks/convenio/useConvenioEntities";
import { allowedNextStatuses } from "@/lib/convenio/statusTransitions";
import type { ConvenioAgreementStatus } from "@/services/convenio/types";

function CreateAgreementDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [entityId, setEntityId] = useState<string>("");
  const entitiesQuery = useConvenioEntitiesForPicker();
  const createMutation = useCreateConvenioAgreement();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(
      { title, description: description || null, entity_id: entityId || null },
      {
        onSuccess: () => {
          setOpen(false);
          setTitle("");
          setDescription("");
          setEntityId("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl">
          <Plus className="h-4 w-4" /> Novo Convênio
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Convênio</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="agreement-title">Título</Label>
            <Input id="agreement-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agreement-entity">Entidade vinculada</Label>
            <Select value={entityId} onValueChange={setEntityId}>
              <SelectTrigger id="agreement-entity">
                <SelectValue placeholder="Selecione uma entidade (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {(entitiesQuery.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agreement-description">Descrição</Label>
            <Textarea id="agreement-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createMutation.isPending || !title}>
              {createMutation.isPending ? "Criando..." : "Criar Convênio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ agreementId, title }: { agreementId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const historyQuery = useConvenioAgreementHistory(open ? agreementId : null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 rounded-lg border-white/15 bg-transparent text-white/70 text-xs">
          Ver histórico
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Histórico — {title}</DialogTitle>
        </DialogHeader>
        {historyQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : historyQuery.isError ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center">
            <p className="text-xs text-red-400">Não foi possível carregar o histórico.</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7 rounded-lg text-xs"
              onClick={() => historyQuery.refetch()}
            >
              Tentar novamente
            </Button>
          </div>
        ) : (historyQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma mudança de status registrada ainda.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {(historyQuery.data ?? []).map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs">
                <span>
                  {h.from_status ? `${h.from_status} → ${h.to_status}` : `criado como ${h.to_status}`}
                </span>
                <span className="text-muted-foreground">{new Date(h.changed_at).toLocaleString("pt-BR")}</span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function GestorConveniosPage() {
  const agreementsQuery = useConvenioAgreements();
  const changeStatusMutation = useChangeConvenioAgreementStatus();

  return (
    <div>
      <GestorPageHeader
        icon={Handshake}
        title="Convênios"
        subtitle="Criar, editar, aprovar, suspender e encerrar convênios"
        action={<CreateAgreementDialog />}
      />

      <GestorQueryState
        isLoading={agreementsQuery.isLoading}
        isError={agreementsQuery.isError}
        error={agreementsQuery.error}
        onRetry={() => agreementsQuery.refetch()}
      >
        <GestorEntityTable
          getRowKey={(row) => row.id}
          rows={agreementsQuery.data ?? []}
          emptyLabel="Nenhum convênio cadastrado ainda."
          columns={[
            { header: "Convênio", render: (r) => <span className="font-bold text-white">{r.title}</span> },
            { header: "Entidade", render: (r) => r.entity_name ?? "—" },
            {
              header: "Status",
              render: (r) => {
                const next = allowedNextStatuses("agreement", r.status) as ConvenioAgreementStatus[];
                if (next.length === 0) return <GestorStatusBadge status={r.status} />;
                return (
                  <Select
                    value={r.status}
                    onValueChange={(status) =>
                      changeStatusMutation.mutate({
                        id: r.id,
                        from: r.status as ConvenioAgreementStatus,
                        to: status as ConvenioAgreementStatus,
                      })
                    }
                  >
                    <SelectTrigger className="h-7 w-36 border-none bg-transparent p-0">
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
            {
              header: "Ações",
              render: (r) => (
                <div className="flex gap-2">
                  <HistoryDialog agreementId={r.id} title={r.title} />
                </div>
              ),
            },
          ]}
        />
      </GestorQueryState>
    </div>
  );
}
