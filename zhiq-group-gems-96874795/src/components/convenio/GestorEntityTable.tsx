import { cn } from "@/lib/utils";

export interface GestorEntityTableColumn<T> {
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface GestorEntityTableProps<T> {
  columns: GestorEntityTableColumn<T>[];
  rows: T[];
  emptyLabel?: string;
  getRowKey: (row: T) => string;
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  ativo: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  ativa: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  aprovada: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  publicada: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  confirmada: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  em_analise: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  em_aprovacao: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  pendente: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  planejada: "bg-cyan-500/10 text-cyan-300 ring-cyan-500/30",
  rascunho: "bg-white/10 text-white/60 ring-white/15",
  registrada: "bg-cyan-500/10 text-cyan-300 ring-cyan-500/30",
  pausada: "bg-white/10 text-white/60 ring-white/15",
  suspenso: "bg-red-500/10 text-red-300 ring-red-500/30",
  encerrado: "bg-white/10 text-white/40 ring-white/15",
  encerrada: "bg-white/10 text-white/40 ring-white/15",
  reprovado: "bg-red-500/10 text-red-300 ring-red-500/30",
  reprovada: "bg-red-500/10 text-red-300 ring-red-500/30",
  arquivada: "bg-white/10 text-white/40 ring-white/15",
  estornada: "bg-red-500/10 text-red-300 ring-red-500/30",
  novo: "bg-cyan-500/10 text-cyan-300 ring-cyan-500/30",
  contatado: "bg-violet-500/10 text-violet-300 ring-violet-500/30",
  documentacao_pendente: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  aprovado: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  recusado: "bg-red-500/10 text-red-300 ring-red-500/30",
  convertido_convenio: "bg-violet-500/10 text-violet-300 ring-violet-500/30",
};

export function GestorStatusBadge({ status, label }: { status: string; label?: string }) {
  const cls = STATUS_BADGE_CLASSES[status] ?? "bg-white/10 text-white/60 ring-white/15";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ring-1", cls)}>
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

export function GestorEntityTable<T>({ columns, rows, emptyLabel, getRowKey }: GestorEntityTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
        <p className="text-sm text-white/40">{emptyLabel ?? "Nenhum registro cadastrado ainda."}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            {columns.map((col) => (
              <th
                key={col.header}
                className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-white/40"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
              {columns.map((col) => (
                <td key={col.header} className={cn("px-4 py-3 text-white/80", col.className)}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
