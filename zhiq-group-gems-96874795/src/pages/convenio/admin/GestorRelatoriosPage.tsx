/**
 * /convenio-admin/relatorios — Comando Convênio Fase 1.
 * Geração real de relatórios (PDF/Excel) a partir de dados reais das tabelas
 * convenio_agreements, convenio_donations, convenio_campaigns e
 * convenio_accountability.
 */
import { useState } from "react";
import { BarChart3, FileText, FileSpreadsheet, TrendingUp, PieChart } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { listAgreements } from "@/services/convenio/agreements";
import { listDonations } from "@/services/convenio/donations";
import { listCampaigns } from "@/services/convenio/campaigns";
import { getDashboardStats } from "@/services/convenio/dashboard";
import { exportReportToExcel, exportReportToPdf, type ReportColumn } from "@/lib/convenio/exportReport";

type ReportKey = "convenios-pdf" | "planilha-excel" | "indicadores" | "estatisticas";

const AGREEMENT_COLUMNS: ReportColumn[] = [
  { header: "Convênio", key: "title" },
  { header: "Entidade", key: "entity_name" },
  { header: "Status", key: "status" },
  { header: "Criado em", key: "created_at" },
];

const DONATION_COLUMNS: ReportColumn[] = [
  { header: "Doador", key: "donor_name" },
  { header: "Valor", key: "amount" },
  { header: "Campanha", key: "campaign_title" },
  { header: "Status", key: "status" },
  { header: "Data", key: "created_at" },
];

const CAMPAIGN_COLUMNS: ReportColumn[] = [
  { header: "Campanha", key: "title" },
  { header: "Status", key: "status" },
  { header: "Meta", key: "goal_amount" },
  { header: "Arrecadado", key: "raised_amount" },
];

async function buildIndicatorsRows() {
  const stats = await getDashboardStats();
  return Object.entries(stats).map(([key, value]) => ({ indicador: key, valor: value }));
}

export default function GestorRelatoriosPage() {
  const { toast } = useToast();
  const [loadingReport, setLoadingReport] = useState<ReportKey | null>(null);

  const runReport = async (key: ReportKey, format: "pdf" | "excel") => {
    setLoadingReport(key);
    try {
      if (key === "convenios-pdf" || key === "planilha-excel") {
        const rows = await listAgreements();
        const exportFn = format === "pdf" ? exportReportToPdf : exportReportToExcel;
        exportFn("Convenios", AGREEMENT_COLUMNS, rows as unknown as Record<string, unknown>[]);
      } else if (key === "indicadores") {
        const rows = await buildIndicatorsRows();
        const columns: ReportColumn[] = [
          { header: "Indicador", key: "indicador" },
          { header: "Valor", key: "valor" },
        ];
        exportReportToPdf("Indicadores", columns, rows);
      } else if (key === "estatisticas") {
        const [donations, campaigns] = await Promise.all([listDonations(), listCampaigns()]);
        exportReportToExcel("Doacoes", DONATION_COLUMNS, donations as unknown as Record<string, unknown>[]);
        exportReportToExcel("Campanhas", CAMPAIGN_COLUMNS, campaigns as unknown as Record<string, unknown>[]);
      }
      toast({ title: "Relatório gerado com sucesso" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao gerar relatório",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoadingReport(null);
    }
  };

  const REPORT_TYPES: {
    key: ReportKey;
    icon: React.ElementType;
    label: string;
    desc: string;
    format: "pdf" | "excel";
  }[] = [
    { key: "convenios-pdf", icon: FileText, label: "Relatório em PDF", desc: "Exportação de convênios em PDF.", format: "pdf" },
    { key: "planilha-excel", icon: FileSpreadsheet, label: "Planilha Excel", desc: "Exportação tabular de convênios em Excel.", format: "excel" },
    { key: "indicadores", icon: TrendingUp, label: "Indicadores", desc: "KPIs de arrecadação, destinação e credenciamento (PDF).", format: "pdf" },
    { key: "estatisticas", icon: PieChart, label: "Estatísticas", desc: "Doações e campanhas por status (Excel).", format: "excel" },
  ];

  return (
    <div>
      <GestorPageHeader icon={BarChart3} title="Relatórios" subtitle="Exportações e estatísticas do módulo" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {REPORT_TYPES.map(({ key, icon: Icon, label, desc, format }) => (
          <div key={key} className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                <Icon className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="font-black text-white">{label}</p>
                <p className="text-xs text-white/40">{desc}</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="flex-shrink-0 rounded-lg border-white/15 bg-transparent text-white/70"
              disabled={loadingReport === key}
              onClick={() => runReport(key, format)}
            >
              {loadingReport === key ? "Gerando..." : "Gerar"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
