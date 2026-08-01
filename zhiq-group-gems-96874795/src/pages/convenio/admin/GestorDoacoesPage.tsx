/**
 * /convenio-admin/doacoes — Comando Convênio Fase 1.
 * Estrutura para histórico de doações e relatórios. Sem processamento
 * financeiro real nesta fase (nenhum gateway ativo).
 */
import { HeartHandshake } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorPlaceholderNotice } from "@/components/convenio/GestorPlaceholderNotice";
import { GestorEntityTable, GestorStatusBadge } from "@/components/convenio/GestorEntityTable";
import { SIMULATED_DONATIONS } from "@/lib/convenio/simulatedData";

export default function GestorDoacoesPage() {
  return (
    <div>
      <GestorPageHeader
        icon={HeartHandshake}
        title="Doações"
        subtitle="Histórico de doações por campanha"
      />
      <GestorPlaceholderNotice text="Estrutura da Fase 1 — sem gateway de pagamento ativo. Histórico abaixo é simulado." />

      <GestorEntityTable
        getRowKey={(row) => row.id}
        rows={SIMULATED_DONATIONS}
        columns={[
          { header: "Doador", render: (r) => r.donor },
          { header: "Valor", render: (r) => <span className="font-bold text-white">{r.amount}</span> },
          { header: "Campanha", render: (r) => r.campaign },
          { header: "Status", render: (r) => <GestorStatusBadge status={r.status} /> },
          { header: "Data", render: (r) => r.date },
        ]}
      />
    </div>
  );
}
