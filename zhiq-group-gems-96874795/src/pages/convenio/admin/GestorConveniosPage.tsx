/**
 * /convenio-admin/convenios — Comando Convênio Fase 1.
 * Tela preparada para criar / editar / aprovar / suspender / encerrar
 * convênios, com histórico. Fase 1: estrutura + dados simulados.
 */
import { Handshake, Plus } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorPlaceholderNotice } from "@/components/convenio/GestorPlaceholderNotice";
import { GestorEntityTable, GestorStatusBadge } from "@/components/convenio/GestorEntityTable";
import { Button } from "@/components/ui/button";
import { SIMULATED_AGREEMENTS } from "@/lib/convenio/simulatedData";

export default function GestorConveniosPage() {
  return (
    <div>
      <GestorPageHeader
        icon={Handshake}
        title="Convênios"
        subtitle="Criar, editar, aprovar, suspender e encerrar convênios"
        action={
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl" disabled>
            <Plus className="h-4 w-4" /> Novo Convênio
          </Button>
        }
      />
      <GestorPlaceholderNotice text="Estrutura da Fase 1 — criação/edição será habilitada em fase futura. Lista abaixo com dados de exemplo." />

      <GestorEntityTable
        getRowKey={(row) => row.id}
        rows={SIMULATED_AGREEMENTS}
        columns={[
          { header: "Convênio", render: (r) => <span className="font-bold text-white">{r.title}</span> },
          { header: "Entidade", render: (r) => r.entity },
          { header: "Status", render: (r) => <GestorStatusBadge status={r.status} /> },
          {
            header: "Ações",
            render: () => (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 rounded-lg border-white/15 bg-transparent text-white/70 text-xs" disabled>
                  Ver histórico
                </Button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
