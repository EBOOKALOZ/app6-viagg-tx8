import React, { useState } from 'react';
import {
  BarChart3, TrendingUp, Eye, MousePointerClick, Target,
  DollarSign, Trophy, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Download, Calendar, Sparkles, Zap, PieChart, ShieldAlert
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function ImpulsionarAnalytics() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const chartData = [
    { day: 'Seg', views: 2100, clicks: 480, conv: 96 },
    { day: 'Ter', views: 1850, clicks: 410, conv: 82 },
    { day: 'Qua', views: 2400, clicks: 590, conv: 118 },
    { day: 'Qui', views: 2200, clicks: 520, conv: 104 },
    { day: 'Sex', views: 3100, clicks: 750, conv: 150 },
    { day: 'Sáb', views: 2900, clicks: 680, conv: 136 },
    { day: 'Dom', views: 1950, clicks: 430, conv: 86 },
  ];

  const maxViews = Math.max(...chartData.map((d) => d.views));

  const bestCampaigns = [
    {
      rank: 1,
      title: '⚡ Entregas Express 15min — Prioridade Total',
      ctr: '12.5%',
      clicks: 1420,
      convRate: '24%',
      status: 'Excelente 🔥',
      col: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    },
    {
      rank: 2,
      title: '🔥 Promoção Exclusiva de Frete & Delivery',
      ctr: '9.8%',
      clicks: 980,
      convRate: '19%',
      status: 'Ótimo 🚀',
      col: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    },
  ];

  const worstCampaigns = [
    {
      title: '📦 Frete Rápido para Mudanças Residenciais',
      ctr: '2.1%',
      clicks: 84,
      convRate: '4%',
      tip: 'Sugestão IA: Amplie o raio de atuação para 40 km e adicione uma foto com veículo visível para aumentar a taxa de cliques em até 60%.',
    },
    {
      title: '🛵 Motoboy Corujão 24h — Entregas Noturnas',
      ctr: '3.4%',
      clicks: 112,
      convRate: '7%',
      tip: 'Sugestão IA: Concentre o orçamento nos dias de quinta a domingo entre 22h e 03h para atingir hamburguerias em horário de pico.',
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-transparent border border-purple-500/20">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/20 shrink-0">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-zinc-900 dark:text-white tracking-tight leading-none">
              Analytics & Estatísticas Enterprise
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Relatórios detalhados de conversão, custo por clique (CPC) e inteligência de mercado.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-1 rounded-xl text-xs font-bold">
            {(['7d', '30d', '90d'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPeriod(t)}
                className={cn(
                  'px-3 py-1 rounded-lg transition-all',
                  period === t ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                )}
              >
                {t === '7d' ? '7 dias' : t === '30d' ? '30 dias' : '90 dias'}
              </button>
            ))}
          </div>

          <Button
            onClick={() => alert('📊 Relatório PDF exportado com sucesso!')}
            variant="outline"
            size="sm"
            className="h-9 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" /> Exportar
          </Button>
        </div>
      </div>

      {/* 4 Cards de Funil de Conversão */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Total de Visualizações',
            value: '14.850',
            change: '+18.4% vs anterior',
            isPos: true,
            icon: Eye,
            col: 'text-purple-500',
            bg: 'bg-purple-500/10',
          },
          {
            label: 'Cliques em Links (CTR 23%)',
            value: '3.420',
            change: '+24.1% vs anterior',
            isPos: true,
            icon: MousePointerClick,
            col: 'text-indigo-500',
            bg: 'bg-indigo-500/10',
          },
          {
            label: 'Conversões Realizadas',
            value: '684',
            change: 'Taxa de 20% s/ cliques',
            isPos: true,
            icon: Target,
            col: 'text-emerald-500',
            bg: 'bg-emerald-500/10',
          },
          {
            label: 'Custo por Clique (CPC)',
            value: 'R$ 0,18',
            change: '-12% mais barato',
            isPos: true,
            icon: DollarSign,
            col: 'text-amber-500',
            bg: 'bg-amber-500/10',
          },
        ].map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className="rounded-2xl p-4 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm flex flex-col justify-between gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">{card.label}</span>
                <div className={cn('p-2 rounded-xl shrink-0', card.bg)}>
                  <Icon className={cn('h-4 w-4', card.col)} />
                </div>
              </div>
              <div>
                <div className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">{card.value}</div>
                <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-500 mt-1">
                  <ArrowUpRight className="h-3 w-3" />
                  <span>{card.change}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Gráfico Semanal Visual com Barras */}
      <div className="rounded-3xl p-6 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-zinc-900 dark:text-white leading-tight flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              Evolução Diária de Alcance & Cliques
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Comparativo de visualizações (roxo) e cliques (índigo) ao longo da última semana.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
              <span className="w-3 h-3 rounded-full bg-purple-500" /> Visualizações
            </span>
            <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
              <span className="w-3 h-3 rounded-full bg-indigo-500" /> Cliques
            </span>
          </div>
        </div>

        {/* Barras do Gráfico */}
        <div className="h-56 flex items-end justify-between gap-2 sm:gap-6 pt-8 pb-2 border-b border-zinc-100 dark:border-zinc-800 px-2">
          {chartData.map((item) => {
            const hViews = Math.round((item.views / maxViews) * 100);
            const hClicks = Math.round((item.clicks / maxViews) * 100);

            return (
              <div key={item.day} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                {/* Tooltip on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -translate-y-20 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-2.5 py-1.5 rounded-xl text-[10px] font-black shadow-lg pointer-events-none text-center z-10 whitespace-nowrap">
                  <div>{item.views} views</div>
                  <div className="text-indigo-400 dark:text-indigo-600">{item.clicks} cliques</div>
                </div>

                <div className="w-full flex items-end justify-center gap-1 sm:gap-2 h-full max-w-[44px]">
                  {/* Barra Visualizações */}
                  <div
                    style={{ height: `${hViews}%` }}
                    className="w-1/2 bg-purple-500/80 hover:bg-purple-500 rounded-t-lg transition-all duration-300"
                  />
                  {/* Barra Cliques */}
                  <div
                    style={{ height: `${hClicks * 2.5}%` }}
                    className="w-1/2 bg-indigo-500 hover:bg-indigo-600 rounded-t-lg transition-all duration-300"
                  />
                </div>

                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mt-1">{item.day}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>Média diária: 2.350 visualizações</span>
          <span className="font-bold text-emerald-500">Pico na Sexta-feira (+42%)</span>
        </div>
      </div>

      {/* Rankings: Melhor vs Pior e Dicas IA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Melhores Campanhas */}
        <div className="rounded-3xl p-6 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              Top Campanhas (Maior Conversão)
            </h3>
            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              Alta Performance
            </span>
          </div>

          <div className="space-y-3">
            {bestCampaigns.map((c) => (
              <div key={c.rank} className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-700/50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-7 h-7 rounded-full bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 font-black text-xs flex items-center justify-center shrink-0">
                    #{c.rank}
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-xs font-black text-zinc-900 dark:text-white truncate">{c.title}</h4>
                    <p className="text-[11px] text-zinc-500">{c.clicks} cliques · {c.convRate} conversão</p>
                  </div>
                </div>
                <span className={cn('text-[10px] font-extrabold px-2.5 py-1 rounded-full border shrink-0', c.col)}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Oportunidades de Melhoria (IA RIDV) */}
        <div className="rounded-3xl p-6 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border border-amber-500/20 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-orange-500" />
              Auditoria de Otimização IA RIDV
            </h3>
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full">
              2 Recomendações
            </span>
          </div>

          <div className="space-y-3">
            {worstCampaigns.map((wc, idx) => (
              <div key={idx} className="p-4 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-amber-500/30 shadow-sm space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-black text-zinc-900 dark:text-white truncate">{wc.title}</span>
                  <span className="font-bold text-rose-500">{wc.ctr} CTR</span>
                </div>
                <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300 leading-relaxed bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
                  💡 {wc.tip}
                </p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
