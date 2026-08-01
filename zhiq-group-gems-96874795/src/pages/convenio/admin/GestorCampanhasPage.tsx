/**
 * /convenio-admin/campanhas — Comando Convênio Fase 1.
 * Estrutura para campanhas, metas, histórico e indicadores.
 * Sem processamento financeiro nesta fase.
 */
import { Megaphone, Plus } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorPlaceholderNotice } from "@/components/convenio/GestorPlaceholderNotice";
import { GestorEntityTable, GestorStatusBadge } from "@/components/convenio/GestorEntityTable";
import { Button } from "@/components/ui/button";
import { SIMULATED_CAMPAIGNS } from "@/lib/convenio/simulatedData";

export default function GestorCampanhasPage() {
  return (
    <div>
      <GestorPageHeader
        icon={Megaphone}
        title="Campanhas"
        subtitle="Metas, histórico e indicadores das campanhas de doação"
        action={
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl" disabled>
            <Plus className="h-4 w-4" /> Nova Campanha
          </Button>
        }
      />
      <GestorPlaceholderNotice text="Estrutura da Fase 1 — sem processamento financeiro. Metas e valores arrecadados abaixo são simulados." />

      <GestorEntityTable
        getRowKey={(row) => row.id}
        rows={SIMULATED_CAMPAIGNS}
        columns={[
          { header: "Campanha", render: (r) => <span className="font-bold text-white">{r.title}</span> },
          { header: "Status", render: (r) => <GestorStatusBadge status={r.status} /> },
          { header: "Meta", render: (r) => `R$ ${r.goal.toLocaleString("pt-BR")}` },
          { header: "Arrecadado", render: (r) => `R$ ${r.raised.toLocaleString("pt-BR")}` },
          {
            header: "Progresso",
            render: (r) => {
              const pct = r.goal > 0 ? Math.min(100, Math.round((r.raised / r.goal) * 100)) : 0;
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
    </div>
  );
}
