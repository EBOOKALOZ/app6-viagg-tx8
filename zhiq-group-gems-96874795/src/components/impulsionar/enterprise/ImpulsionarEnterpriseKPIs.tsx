import React from 'react';
import {
  Megaphone, Calendar, CheckCircle2, Clock, Eye,
  MousePointerClick, Target, Wallet, CreditCard,
  TrendingUp, Trophy, Zap, ArrowUpRight, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ImpulsionarEnterpriseKPIsProps {
  activeCampaigns?: number;
  scheduledCampaigns?: number;
  finishedCampaigns?: number;
  underReviewCampaigns?: number;
  totalViews?: number;
  totalClicks?: number;
  conversions?: number;
  availableCredits?: number;
  usedCredits?: number;
  currentBalance?: number;
  estimatedReach?: number;
  bestCampaignName?: string;
  bestCampaignMetric?: string;
  loading?: boolean;
  onCardClick?: (tab: string) => void;
}

export function ImpulsionarEnterpriseKPIs({
  activeCampaigns = 4,
  scheduledCampaigns = 2,
  finishedCampaigns = 18,
  underReviewCampaigns = 1,
  totalViews = 14850,
  totalClicks = 3420,
  conversions = 684,
  availableCredits = 350,
  usedCredits = 1250,
  currentBalance = 145.50,
  estimatedReach = 45000,
  bestCampaignName = 'Frete Rápido — Centro & Zona Sul',
  bestCampaignMetric = '8.4% CTR · 240 cliques',
  loading = false,
  onCardClick,
}: ImpulsionarEnterpriseKPIsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 animate-pulse">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/50" />
        ))}
      </div>
    );
  }

  const kpis = [
    {
      id: 'active',
      label: 'Campanhas Ativas',
      value: activeCampaigns.toString(),
      sub: 'Em exibição agora',
      icon: Megaphone,
      color: 'text-emerald-500 dark:text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20 hover:border-emerald-500/40',
      tab: 'gerenciar',
    },
    {
      id: 'scheduled',
      label: 'Campanhas Agendadas',
      value: scheduledCampaigns.toString(),
      sub: 'Aguardando data/hora',
      icon: Calendar,
      color: 'text-blue-500 dark:text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20 hover:border-blue-500/40',
      tab: 'gerenciar',
    },
    {
      id: 'review',
      label: 'Campanhas em Análise',
      value: underReviewCampaigns.toString(),
      sub: 'Auditoria de segurança',
      icon: Clock,
      color: 'text-amber-500 dark:text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20 hover:border-amber-500/40',
      tab: 'gerenciar',
    },
    {
      id: 'finished',
      label: 'Campanhas Encerradas',
      value: finishedCampaigns.toString(),
      sub: 'Concluídas com sucesso',
      icon: CheckCircle2,
      color: 'text-zinc-500 dark:text-zinc-400',
      bgColor: 'bg-zinc-500/10',
      borderColor: 'border-zinc-500/20 hover:border-zinc-500/40',
      tab: 'gerenciar',
    },
    {
      id: 'views',
      label: 'Total de Visualizações',
      value: totalViews.toLocaleString('pt-BR'),
      sub: '+1.240 hoje',
      icon: Eye,
      color: 'text-purple-500 dark:text-purple-400',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/20 hover:border-purple-500/40',
      tab: 'estatisticas',
    },
    {
      id: 'clicks',
      label: 'Cliques Recebidos',
      value: totalClicks.toLocaleString('pt-BR'),
      sub: `${((totalClicks / Math.max(totalViews, 1)) * 100).toFixed(1)}% CTR global`,
      icon: MousePointerClick,
      color: 'text-indigo-500 dark:text-indigo-400',
      bgColor: 'bg-indigo-500/10',
      borderColor: 'border-indigo-500/20 hover:border-indigo-500/40',
      tab: 'estatisticas',
    },
    {
      id: 'conversions',
      label: 'Conversões Geradas',
      value: conversions.toLocaleString('pt-BR'),
      sub: 'Alvos alcançados',
      icon: Target,
      color: 'text-rose-500 dark:text-rose-400',
      bgColor: 'bg-rose-500/10',
      borderColor: 'border-rose-500/20 hover:border-rose-500/40',
      tab: 'estatisticas',
    },
    {
      id: 'reach',
      label: 'Alcance Estimado',
      value: `${(estimatedReach / 1000).toFixed(1)}k`,
      sub: 'Pessoas na região',
      icon: Zap,
      color: 'text-orange-500 dark:text-orange-400',
      bgColor: 'bg-orange-500/10',
      borderColor: 'border-orange-500/20 hover:border-orange-500/40',
      tab: 'estatisticas',
    },
    {
      id: 'credits_avail',
      label: 'Créditos Disponíveis',
      value: availableCredits.toLocaleString('pt-BR'),
      sub: 'Prontos para usar',
      icon: Sparkles,
      color: 'text-amber-500 dark:text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20 hover:border-amber-500/40',
      tab: 'creditos',
    },
    {
      id: 'credits_used',
      label: 'Créditos Utilizados',
      value: usedCredits.toLocaleString('pt-BR'),
      sub: 'Histórico acumulado',
      icon: CreditCard,
      color: 'text-sky-500 dark:text-sky-400',
      bgColor: 'bg-sky-500/10',
      borderColor: 'border-sky-500/20 hover:border-sky-500/40',
      tab: 'creditos',
    },
    {
      id: 'balance',
      label: 'Saldo Atual RIDV',
      value: `R$ ${currentBalance.toFixed(2).replace('.', ',')}`,
      sub: 'Disponível para saque',
      icon: Wallet,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-600/10',
      borderColor: 'border-emerald-600/20 hover:border-emerald-600/40',
      tab: 'carteira',
    },
    {
      id: 'best',
      label: 'Melhor Campanha',
      value: bestCampaignName,
      sub: bestCampaignMetric,
      icon: Trophy,
      color: 'text-yellow-500 dark:text-yellow-400',
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/20 hover:border-yellow-500/40',
      tab: 'estatisticas',
      isWide: true,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-orange-500" />
          <h3 className="text-xs font-black uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
            Painel de Desempenho Enterprise
          </h3>
        </div>
        <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
          Tempo Real
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.id}
              onClick={() => onCardClick?.(kpi.tab)}
              className={cn(
                'group relative rounded-2xl p-3.5 bg-white dark:bg-zinc-900/90 border transition-all duration-200 hover:shadow-md cursor-pointer flex flex-col justify-between overflow-hidden',
                kpi.borderColor,
                kpi.isWide && 'col-span-2 sm:col-span-3 lg:col-span-2 bg-gradient-to-br from-amber-500/5 via-orange-500/5 to-transparent'
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 leading-tight">
                  {kpi.label}
                </span>
                <div className={cn('p-1.5 rounded-xl shrink-0 transition-transform group-hover:scale-110', kpi.bgColor)}>
                  <Icon className={cn('h-4 w-4', kpi.color)} />
                </div>
              </div>

              <div>
                <div className="text-base sm:text-lg font-black text-zinc-900 dark:text-white tracking-tight truncate">
                  {kpi.value}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 truncate">
                    {kpi.sub}
                  </span>
                  <ArrowUpRight className="h-3 w-3 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
