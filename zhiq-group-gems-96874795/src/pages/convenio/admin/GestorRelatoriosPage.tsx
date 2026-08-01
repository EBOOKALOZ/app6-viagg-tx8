/**
 * /convenio-admin/relatorios — Comando Convênio Fase 1.
 * Estrutura para PDF, Excel, indicadores, estatísticas e prestação de contas.
 */
import { BarChart3, FileText, FileSpreadsheet, TrendingUp, PieChart } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorPlaceholderNotice } from "@/components/convenio/GestorPlaceholderNotice";
import { Button } from "@/components/ui/button";

const REPORT_TYPES = [
  { icon: FileText, label: "Relatório em PDF", desc: "Exportação consolidada do módulo em PDF." },
  { icon: FileSpreadsheet, label: "Planilha Excel", desc: "Exportação tabular de convênios, doações e campanhas." },
  { icon: TrendingUp, label: "Indicadores", desc: "KPIs de arrecadação, destinação e credenciamento." },
  { icon: PieChart, label: "Estatísticas", desc: "Distribuição por categoria, região e status." },
];

export default function GestorRelatoriosPage() {
  return (
    <div>
      <GestorPageHeader icon={BarChart3} title="Relatórios" subtitle="Exportações e estatísticas do módulo" />
      <GestorPlaceholderNotice text="Estrutura da Fase 1 — geração de arquivos será habilitada em fase futura." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {REPORT_TYPES.map(({ icon: Icon, label, desc }) => (
          <div key={label} className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                <Icon className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="font-black text-white">{label}</p>
                <p className="text-xs text-white/40">{desc}</p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="flex-shrink-0 rounded-lg border-white/15 bg-transparent text-white/70" disabled>
              Gerar
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
