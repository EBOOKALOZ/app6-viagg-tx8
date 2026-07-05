import React from "react";
import { TrendingUp, Eye, MousePointerClick, DollarSign, Award, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImpulsionarStatsProps {
  viewsCount?: number;
  clicksCount?: number;
  earnings?: number;
  activeCampaigns?: number;
  conversionRate?: number;
  loading?: boolean;
}

export function ImpulsionarStats({
  viewsCount = 1240,
  clicksCount = 384,
  earnings = 145.50,
  activeCampaigns = 3,
  conversionRate = 31.0,
  loading = false,
}: ImpulsionarStatsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-white/10 border border-white/5 backdrop-blur-md" />
        ))}
      </div>
    );
  }

  const stats = [
    {
      label: "Ganhos Acumulados",
      value: `R$ ${earnings.toFixed(2).replace('.', ',')}`,
      change: "+18.4%",
      icon: DollarSign,
      gradient: "from-emerald-500/20 to-teal-500/10",
      border: "border-emerald-500/30",
      iconColor: "text-emerald-400",
      textColor: "text-emerald-300",
    },
    {
      label: "Cliques em Links",
      value: clicksCount.toLocaleString('pt-BR'),
      change: `${conversionRate}% conv.`,
      icon: MousePointerClick,
      gradient: "from-blue-500/20 to-indigo-500/10",
      border: "border-blue-500/30",
      iconColor: "text-blue-400",
      textColor: "text-blue-300",
    },
    {
      label: "Alcance / Visualizações",
      value: viewsCount.toLocaleString('pt-BR'),
      change: "+24 hoje",
      icon: Eye,
      gradient: "from-purple-500/20 to-pink-500/10",
      border: "border-purple-500/30",
      iconColor: "text-purple-400",
      textColor: "text-purple-300",
    },
    {
      label: "Campanhas Ativas",
      value: `${activeCampaigns}`,
      change: "Em andamento",
      icon: Award,
      gradient: "from-amber-500/20 to-orange-500/10",
      border: "border-amber-500/30",
      iconColor: "text-amber-400",
      textColor: "text-amber-300",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-orange-400" />
          <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300">
            Desempenho & Impacto
          </h3>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          ● Tempo Real
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div
              key={idx}
              className={cn(
                "relative overflow-hidden rounded-2xl p-3.5 border backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] group",
                stat.gradient,
                stat.border
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={cn("p-2 rounded-xl bg-white/10 backdrop-blur-md", stat.iconColor)}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className={cn("text-[10px] font-bold flex items-center gap-0.5", stat.textColor)}>
                  {stat.change}
                  <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>

              <div className="space-y-0.5">
                <p className="text-lg font-black text-white tracking-tight">
                  {stat.value}
                </p>
                <p className="text-[11px] font-medium text-zinc-400 truncate">
                  {stat.label}
                </p>
              </div>

              {/* Subtle background glow */}
              <div className="absolute -right-4 -bottom-4 w-16 h-16 rounded-full bg-white/5 blur-xl group-hover:bg-white/10 transition-all" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
