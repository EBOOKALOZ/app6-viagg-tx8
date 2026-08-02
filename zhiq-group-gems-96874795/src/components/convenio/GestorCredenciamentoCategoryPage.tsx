/**
 * Comando Convênio Fase 1 — template compartilhado para as 7 categorias de
 * credenciamento (Clínicas, Laboratórios, Farmácias, Hospitais, Instituições,
 * Parceiros, Prestadores). CRUD real contra convenio_entities, filtrado por
 * categoria. Cada categoria só precisa fornecer ícone/título/chave.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
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
import { useConvenioEntities, useCreateConvenioEntity, useUpdateConvenioEntity } from "@/hooks/convenio/useConvenioEntities";
import type { ConvenioEntity, ConvenioEntityCategory, ConvenioEntityStatus } from "@/services/convenio/types";

const STATUS_OPTIONS: ConvenioEntityStatus[] = ["em_analise", "ativo", "suspenso", "encerrado", "reprovado"];
const DOC_STATUS_OPTIONS = ["pendente", "em_analise", "aprovada", "reprovada"] as const;

interface GestorCredenciamentoCategoryPageProps {
  icon: React.ElementType;
  title: string;
  categoryKey: ConvenioEntityCategory;
  singularLabel: string;
}

interface EntityFormState {
  name: string;
  document_number: string;
  responsible_name: string;
  email: string;
  phone: string;
  address_city: string;
  address_state: string;
  notes: string;
}

const EMPTY_FORM: EntityFormState = {
  name: "",
  document_number: "",
  responsible_name: "",
  email: "",
  phone: "",
  address_city: "",
  address_state: "",
  notes: "",
};

function EntityFormDialog({
  categoryKey,
  singularLabel,
  entity,
  trigger,
}: {
  categoryKey: ConvenioEntityCategory;
  singularLabel: string;
  entity?: ConvenioEntity;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EntityFormState>(
    entity
      ? {
          name: entity.name,
          document_number: entity.document_number ?? "",
          responsible_name: entity.responsible_name ?? "",
          email: entity.email ?? "",
          phone: entity.phone ?? "",
          address_city: entity.address_city ?? "",
          address_state: entity.address_state ?? "",
          notes: entity.notes ?? "",
        }
      : EMPTY_FORM
  );
  const createMutation = useCreateConvenioEntity(categoryKey);
  const updateMutation = useUpdateConvenioEntity(categoryKey);
  const isPending = createMutation.isPending || updateMutation.isPending;

  const field = (key: keyof EntityFormState) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      category: categoryKey,
      name: form.name,
      document_number: form.document_number || null,
      responsible_name: form.responsible_name || null,
      email: form.email || null,
      phone: form.phone || null,
      address_city: form.address_city || null,
      address_state: form.address_state || null,
      notes: form.notes || null,
    };

    if (entity) {
      updateMutation.mutate({ id: entity.id, patch: payload }, { onSuccess: () => setOpen(false) });
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          setOpen(false);
          setForm(EMPTY_FORM);
        },
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entity ? `Editar ${singularLabel}` : `Cadastrar ${singularLabel}`}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="entity-name">Nome</Label>
            <Input id="entity-name" required {...field("name")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="entity-document">CNPJ/CPF</Label>
              <Input id="entity-document" {...field("document_number")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entity-responsible">Responsável</Label>
              <Input id="entity-responsible" {...field("responsible_name")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="entity-email">E-mail</Label>
              <Input id="entity-email" type="email" {...field("email")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entity-phone">Telefone</Label>
              <Input id="entity-phone" {...field("phone")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="entity-city">Cidade</Label>
              <Input id="entity-city" {...field("address_city")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entity-state">UF</Label>
              <Input id="entity-state" maxLength={2} {...field("address_state")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entity-notes">Observações</Label>
            <Textarea id="entity-notes" {...field("notes")} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending || !form.name}>
              {isPending ? "Salvando..." : entity ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GestorCredenciamentoCategoryPage({
  icon, title, categoryKey, singularLabel,
}: GestorCredenciamentoCategoryPageProps) {
  const entitiesQuery = useConvenioEntities(categoryKey);
  const updateMutation = useUpdateConvenioEntity(categoryKey);

  return (
    <div>
      <GestorPageHeader
        icon={icon}
        title={title}
        subtitle="Dados principais · Endereço · Responsável · Status · Categoria · Documentação · Situação"
        action={
          <EntityFormDialog
            categoryKey={categoryKey}
            singularLabel={singularLabel}
            trigger={
              <Button className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl">
                <Plus className="h-4 w-4" /> Cadastrar {singularLabel}
              </Button>
            }
          />
        }
      />

      {entitiesQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <GestorEntityTable
          getRowKey={(row) => row.id}
          rows={entitiesQuery.data ?? []}
          emptyLabel={`Nenhuma ${singularLabel.toLowerCase()} cadastrada ainda.`}
          columns={[
            { header: "Nome", render: (r) => <span className="font-bold text-white">{r.name}</span> },
            { header: "Cidade", render: (r) => r.address_city ?? "—" },
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
                        {s.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ),
            },
            {
              header: "Documentação",
              render: (r) => (
                <Select
                  value={r.documentation_status}
                  onValueChange={(documentation_status) => updateMutation.mutate({ id: r.id, patch: { documentation_status } })}
                >
                  <SelectTrigger className="h-7 w-32 border-none bg-transparent p-0">
                    <GestorStatusBadge status={r.documentation_status} />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ),
            },
            {
              header: "Ações",
              render: (r) => (
                <EntityFormDialog
                  categoryKey={categoryKey}
                  singularLabel={singularLabel}
                  entity={r}
                  trigger={
                    <Button size="sm" variant="outline" className="h-7 rounded-lg border-white/15 bg-transparent text-white/70 text-xs">
                      Editar
                    </Button>
                  }
                />
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
