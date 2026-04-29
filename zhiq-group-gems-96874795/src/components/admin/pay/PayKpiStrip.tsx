import { useState } from "react";
import {
  Landmark, TrendingUp, Banknote, Lock,
  ArrowDownCircle, CheckCircle, AlertTriangle,
  Info, TrendingDown,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePayTreasuryStats } from "@/hooks/useAdminPayTreasury";
import { formatBRL } from "@/skills/pay/payUtils";
import { KPI_COLORS } from "@/skills/pay/payConstants";

// ─── Single KPI Card ────────────────────────────
function KpiCard({
  label, value, subtitle, tooltip, icon: Icon, gradient, pulse, micro,
}: {
  label: string;
  value: string;
  subtitle?: string;
  tooltip?: string;
  icon: React.ElementType;
  gradient: string;
  pulse?: boolean;
  micro?: string;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`relative overflow-hidden rounded-2xl ${gradient} p-5 shadow-lg shadow-black/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl cursor-default select-none`}>
            {/* Decorative layers */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-white/[0.06] to-transparent rounded-bl-full" />
            <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-white/[0.03] rounded-full" />

            <div className="relative z-10 flex flex-col justify-between min-h-[100px]">
              {/* Header: icon + label */}
              <div className="flex items-center gap-2 mb-auto">
                <div className="w-8 h-8 rounded-xl bg-white/[0.12] backdrop-blur-sm flex items-center justify-center ring-1 ring-white/10">
                  <Icon className={`h-4 w-4 text-white ${pulse ? "animate-pulse" : ""}`} />
                </div>
                <p className="text-[8px] text-white/50 font-extrabold uppercase tracking-[0.18em] leading-tight flex-1">{label}</p>
              </div>

              {/* Value */}
              <p className="text-[28px] font-black text-white tracking-tight leading-none mt-3 tabular-nums">{value}</p>

              {/* Footer: subtitle + micro */}
              <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/[0.08]">
                <p className="text-[9px] text-white/35 font-medium">{subtitle}</p>
                {micro && (
                  <span className="text-[8px] text-white/30 font-mono bg-white/[0.06] px-1.5 py-0.5 rounded">
                    {micro}
                  </span>
                )}
              </div>
            </div>
          </div>
        </TooltipTrigger>
        {tooltip && (
          <TooltipContent side="bottom" className="max-w-[200px] text-xs">
            {tooltip}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── KPI Strip ──────────────────────────────────
export default function PayKpiStrip() {
  const { data: stats, isLoading } = usePayTreasuryStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-[140px] rounded-2xl" />
        ))}
      </div>
    );
  }

  const s = stats || {
    grossBalanceCents: 0, settledBalanceCents: 0, availableForWithdrawalCents: 0,
    reservedBalanceCents: 0, pendingWithdrawalsCount: 0, completedWithdrawalsCount: 0,
    recentFailuresCount: 0,
  };

  const utilizationRate = s.grossBalanceCents > 0
    ? Math.round((s.reservedBalanceCents / s.grossBalanceCents) * 100) : 0;

  const cards = [
    {
      label: "Saldo Bruto", value: formatBRL(s.grossBalanceCents), icon: Landmark,
      gradient: KPI_COLORS.gross, subtitle: "Total geral plataforma",
      tooltip: "Soma de todos os saldos: liquidado + pendente + reservado",
      micro: "GROSS",
    },
    {
      label: "Saldo Liquidado", value: formatBRL(s.settledBalanceCents), icon: TrendingUp,
      gradient: KPI_COLORS.settled, subtitle: "Disponível no sistema",
      tooltip: "Saldo já processado e confirmado pelo provedor bancário",
      micro: "SETTLED",
    },
    {
      label: "Disponível p/ Saque", value: formatBRL(s.availableForWithdrawalCents), icon: Banknote,
      gradient: KPI_COLORS.available, subtitle: "Líquido para transferir",
      tooltip: "Saldo liquidado menos reservas em andamento. Montante pronto para saque.",
      micro: "NET",
    },
    {
      label: "Saldo Reservado", value: formatBRL(s.reservedBalanceCents), icon: Lock,
      gradient: KPI_COLORS.reserved, subtitle: "Retido por operações",
      tooltip: "Saldo retido por saques aprovados/em processamento. Liberado quando pago ou cancelado.",
      micro: `${utilizationRate}% util`,
    },
    {
      label: "Saques Pendentes", value: String(s.pendingWithdrawalsCount), icon: ArrowDownCircle,
      gradient: KPI_COLORS.pending, subtitle: "Aguardando processamento",
      tooltip: "Saques com status pending_approval, approved, queued ou processing",
      micro: "QUEUE",
    },
    {
      label: "Saques Concluídos", value: String(s.completedWithdrawalsCount), icon: CheckCircle,
      gradient: KPI_COLORS.completed, subtitle: "Pagos com sucesso",
      tooltip: "Total de saques finalizados com status paid/completed",
      micro: "PAID",
    },
    {
      label: "Falhas Recentes", value: String(s.recentFailuresCount), icon: AlertTriangle,
      gradient: KPI_COLORS.failures, subtitle: "Últimos 7 dias",
      tooltip: "Saques com status failed nos últimos 7 dias. Podem ser reprocessados.",
      pulse: s.recentFailuresCount > 0,
      micro: "7D",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {cards.map((c) => (
        <KpiCard key={c.label} {...c} />
      ))}
    </div>
  );
}
