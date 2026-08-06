/**
 * /convenio-admin/prestacao-de-contas — Comando Convênio Fase 1.
 * CRUD real de prestação de contas com upload de documento (Storage,
 * bucket privado convenio-documentos). Repasses permanecem desativados
 * (convenio_settings.repasses_ativos).
 */
import { useState } from "react";
import { FileSpreadsheet, Upload, Archive, ExternalLink } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorEntityTable, GestorStatusBadge } from "@/components/convenio/GestorEntityTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GestorQueryState } from "@/components/convenio/GestorQueryState";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  useArchiveConvenioAccountability,
  useConvenioAccountability,
  useCreateConvenioAccountability,
  usePublishConvenioAccountability,
  openAccountabilityDocument,
} from "@/hooks/convenio/useConvenioAccountability";

function CreateAccountabilityDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const createMutation = useCreateConvenioAccountability();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(
      { input: { title, summary: summary || null, status: "rascunho" }, file },
      {
        onSuccess: () => {
          setOpen(false);
          setTitle("");
          setSummary("");
          setFile(null);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl">
          <Upload className="h-4 w-4" /> Novo Relatório
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Relatório de Prestação de Contas</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="accountability-title">Título</Label>
            <Input id="accountability-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accountability-summary">Resumo</Label>
            <Textarea id="accountability-summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accountability-file">Documento (PDF/planilha)</Label>
            <Input
              id="accountability-file"
              type="file"
              accept=".pdf,.xls,.xlsx,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createMutation.isPending || !title}>
              {createMutation.isPending ? "Salvando..." : "Salvar como rascunho"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function GestorPrestacaoContasPage() {
  const accountabilityQuery = useConvenioAccountability();
  const publishMutation = usePublishConvenioAccountability();
  const archiveMutation = useArchiveConvenioAccountability();

  return (
    <div>
      <GestorPageHeader
        icon={FileSpreadsheet}
        title="Prestação de Contas"
        subtitle="Registros financeiros, fluxo e histórico de prestação de contas"
        action={<CreateAccountabilityDialog />}
      />

      <GestorQueryState
        isLoading={accountabilityQuery.isLoading}
        isError={accountabilityQuery.isError}
        error={accountabilityQuery.error}
        onRetry={() => accountabilityQuery.refetch()}
      >
        <GestorEntityTable
          getRowKey={(row) => row.id}
          rows={accountabilityQuery.data ?? []}
          emptyLabel="Nenhum relatório cadastrado ainda."
          columns={[
            { header: "Relatório", render: (r) => <span className="font-bold text-white">{r.title}</span> },
            { header: "Status", render: (r) => <GestorStatusBadge status={r.status} /> },
            {
              header: "Publicado em",
              render: (r) => (r.published_at ? new Date(r.published_at).toLocaleDateString("pt-BR") : "—"),
            },
            {
              header: "Ações",
              render: (r) => (
                <div className="flex gap-2">
                  {r.document_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-lg border-white/15 bg-transparent text-white/70 text-xs"
                      onClick={() => openAccountabilityDocument(r.document_url as string)}
                    >
                      <ExternalLink className="mr-1 h-3 w-3" /> Ver
                    </Button>
                  )}
                  {r.status === "rascunho" && (
                    <Button
                      size="sm"
                      className="h-7 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs"
                      disabled={publishMutation.isPending}
                      onClick={() => publishMutation.mutate(r.id)}
                    >
                      Publicar
                    </Button>
                  )}
                  {/* Máquina de estados: só relatório publicado pode ser arquivado
                      (rascunho → arquivada é transição inválida, bloqueada também no banco) */}
                  {r.status === "publicada" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-lg border-white/15 bg-transparent text-white/70 text-xs"
                      disabled={archiveMutation.isPending}
                      onClick={() => archiveMutation.mutate(r.id)}
                    >
                      <Archive className="mr-1 h-3 w-3" /> Arquivar
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </GestorQueryState>
    </div>
  );
}
