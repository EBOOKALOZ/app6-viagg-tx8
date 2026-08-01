/**
 * /convenio-admin/prestacao-de-contas — Comando Convênio Fase 1.
 * Estrutura visual para registros financeiros, prestação de contas e
 * histórico. Repasses permanecem desativados (convenio_settings.repasses_ativos).
 */
import { FileSpreadsheet, Upload } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorPlaceholderNotice } from "@/components/convenio/GestorPlaceholderNotice";
import { GestorEntityTable, GestorStatusBadge } from "@/components/convenio/GestorEntityTable";
import { Button } from "@/components/ui/button";
import { SIMULATED_ACCOUNTABILITY } from "@/lib/convenio/simulatedData";

export default function GestorPrestacaoContasPage() {
  return (
    <div>
      <GestorPageHeader
        icon={FileSpreadsheet}
        title="Prestação de Contas"
        subtitle="Registros financeiros, fluxo e histórico de prestação de contas"
        action={
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl" disabled>
            <Upload className="h-4 w-4" /> Publicar Relatório
          </Button>
        }
      />
      <GestorPlaceholderNotice text="Estrutura visual da Fase 1 — repasses permanecem DESATIVADOS. Nenhuma movimentação financeira real ocorre aqui." />

      <GestorEntityTable
        getRowKey={(row) => row.id}
        rows={SIMULATED_ACCOUNTABILITY}
        columns={[
          { header: "Relatório", render: (r) => <span className="font-bold text-white">{r.title}</span> },
          { header: "Status", render: (r) => <GestorStatusBadge status={r.status} /> },
          { header: "Publicado em", render: (r) => r.date },
        ]}
      />
    </div>
  );
}
