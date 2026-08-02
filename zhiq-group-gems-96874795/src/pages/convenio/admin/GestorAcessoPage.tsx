/**
 * /convenio-admin/acesso — Comando Convênio Fase 1.
 * Gestão do papel gestor_convenio: conceder/revogar acesso ao Super Painel
 * por e-mail, via as RPCs convenio_grant_role/convenio_revoke_role/
 * convenio_list_gestores (SECURITY DEFINER, gate is_gestor_convenio()).
 */
import { useState } from "react";
import { UserCog, Plus, X } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorEntityTable } from "@/components/convenio/GestorEntityTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useConvenioGestores, useGrantConvenioGestorRole, useRevokeConvenioGestorRole } from "@/hooks/convenio/useConvenioAccess";

function GrantAccessDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const grantMutation = useGrantConvenioGestorRole();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    grantMutation.mutate(email, {
      onSuccess: () => {
        setOpen(false);
        setEmail("");
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl">
          <Plus className="h-4 w-4" /> Conceder Acesso
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conceder Acesso ao Gestor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="grant-email">E-mail do usuário</Label>
            <Input
              id="grant-email"
              type="email"
              required
              placeholder="usuario@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              O usuário precisa já ter uma conta na plataforma. Ele passará a ter acesso completo
              ao Super Painel do Gestor de Convênios.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={grantMutation.isPending || !email}>
              {grantMutation.isPending ? "Concedendo..." : "Conceder Acesso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function GestorAcessoPage() {
  const gestoresQuery = useConvenioGestores();
  const revokeMutation = useRevokeConvenioGestorRole();

  return (
    <div>
      <GestorPageHeader
        icon={UserCog}
        title="Gestão de Acesso"
        subtitle="Conceder ou revogar o papel de Gestor de Convênios"
        action={<GrantAccessDialog />}
      />

      {gestoresQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <GestorEntityTable
          getRowKey={(row) => row.user_id}
          rows={gestoresQuery.data ?? []}
          emptyLabel="Nenhum usuário com o papel gestor_convenio ainda (além de admins, que sempre têm acesso)."
          columns={[
            { header: "E-mail", render: (r) => <span className="font-bold text-white">{r.email}</span> },
            { header: "Concedido em", render: (r) => new Date(r.assigned_at).toLocaleString("pt-BR") },
            {
              header: "Ações",
              render: (r) => (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 rounded-lg border-red-500/30 bg-transparent text-red-300 text-xs hover:bg-red-500/10"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(r.email)}
                >
                  <X className="h-3 w-3" /> Revogar
                </Button>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
