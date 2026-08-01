/**
 * Comando Convênio Fase 1 — template compartilhado para as 6 categorias de
 * credenciamento (Clínicas, Laboratórios, Farmácias, Hospitais, Instituições,
 * Parceiros). Cada categoria só precisa fornecer ícone/título/chave.
 */
import { Plus } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorPlaceholderNotice } from "@/components/convenio/GestorPlaceholderNotice";
import { GestorEntityTable, GestorStatusBadge } from "@/components/convenio/GestorEntityTable";
import { Button } from "@/components/ui/button";
import { SIMULATED_ENTITIES_BY_CATEGORY } from "@/lib/convenio/simulatedData";

interface GestorCredenciamentoCategoryPageProps {
  icon: React.ElementType;
  title: string;
  categoryKey: keyof typeof SIMULATED_ENTITIES_BY_CATEGORY;
  singularLabel: string;
}

export function GestorCredenciamentoCategoryPage({
  icon, title, categoryKey, singularLabel,
}: GestorCredenciamentoCategoryPageProps) {
  const rows = SIMULATED_ENTITIES_BY_CATEGORY[categoryKey] ?? [];

  return (
    <div>
      <GestorPageHeader
        icon={icon}
        title={title}
        subtitle="Dados principais · Endereço · Responsável · Status · Categoria · Documentação · Situação"
        action={
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl" disabled>
            <Plus className="h-4 w-4" /> Cadastrar {singularLabel}
          </Button>
        }
      />
      <GestorPlaceholderNotice />

      <GestorEntityTable
        getRowKey={(row) => row.id}
        rows={rows}
        emptyLabel={`Nenhuma ${singularLabel.toLowerCase()} cadastrada ainda.`}
        columns={[
          { header: "Nome", render: (r) => <span className="font-bold text-white">{r.name}</span> },
          { header: "Cidade", render: (r) => r.city },
          { header: "Status", render: (r) => <GestorStatusBadge status={r.status} /> },
          {
            header: "Documentação",
            render: () => <GestorStatusBadge status="pendente" label="Em análise" />,
          },
        ]}
      />
    </div>
  );
}
