import { cn } from '@/lib/utils';
import {
  Megaphone, Share2, Eye, ShoppingCart, DollarSign,
  Store, TrendingUp, Loader2,
} from 'lucide-react';

interface RIDVStatsProps {
  campanhasDisponiveis?: number;
  compartilhadasHoje?: number;
  visitasGeradas?: number;
  conversoes?: number;
  receitaGerada?: number | null;
  empresasAjudadas?: number;
  impactoEconomico?: number | null;
  isLoading?: boolean;
}

interface StatCardProps {
  icon: typeof Megaphone;
  label: string;
  value: string | number;
  sub?: string;
  glowHex: string;
  accentColor: string;
  highlight?: boolean;
}

function StatCard({ icon: Icon, label, value, sub, glowHex, accentColor, highlight }: StatCardProps) {
  return (
    <div
      className={cn(
        'relative rounded-2xl p-3.5 overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl',
        highlight && 'ring-1 ring-[#FF6A00]/40'
      )}
      style={{
        background: 'linear-gradient(145deg, #1B1F24 0%, #0D0F12 100%)',
        border: highlight ? '1px solid rgba(255,106,0,0.35)' : '1px solid rgba(42,48,56,0.80)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      {/* Top glow line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
        style={{ background: `linear-gradient(90deg, transparent, ${glowHex}, transparent)` }}
      />
      {/* Background glow */}
      <div
        className="absolute -top-6 -left-6 w-16 h-16 rounded-full blur-2xl opacity-15"
        style={{ background: glowHex }}
      />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="p-1.5 rounded-lg"
            style={{ background: `${glowHex}18`, border: `1px solid ${glowHex}28` }}
          >
            <Icon className={cn('h-3.5 w-3.5 shrink-0', accentColor)} />
          </div>
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#A7B0BE]/45 leading-none">
            {label}
          </p>
        </div>
        <p className="text-[26px] font-black text-white leading-none tracking-tight">{value}</p>
        {sub && <p className="text-[10px] text-[#A7B0BE]/50 mt-1 font-medium">{sub}</p>}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="rounded-2xl p-3.5 animate-pulse"
      style={{ background: 'linear-gradient(145deg, #1B1F24, #0D0F12)', border: '1px solid rgba(42,48,56,0.80)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-white/5" />
        <div className="h-2 w-16 rounded bg-white/5" />
      </div>
      <div className="h-7 w-12 rounded bg-white/5" />
      <div className="h-2 w-20 rounded bg-white/5 mt-1.5" />
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString('pt-BR');
const fmtBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);

export function RIDVStats({
  campanhasDisponiveis = 0,
  compartilhadasHoje = 0,
  visitasGeradas = 0,
  conversoes = 0,
  receitaGerada = null,
  empresasAjudadas = 0,
  impactoEconomico = null,
  isLoading = false,
}: RIDVStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 7 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  const stats: StatCardProps[] = [
    {
      icon: Megaphone,
      label: 'Campanhas Disponíveis',
      value: fmt(campanhasDisponiveis),
      sub: campanhasDisponiveis === 0 ? 'aguardando novas' : 'prontas para divulgar',
      glowHex: '#FF6A00',
      accentColor: 'text-orange-400',
      highlight: campanhasDisponiveis > 0,
    },
    {
      icon: Share2,
      label: 'Compartilhadas Hoje',
      value: fmt(compartilhadasHoje),
      sub: 'neste período',
      glowHex: '#10b981',
      accentColor: 'text-emerald-400',
    },
    {
      icon: Eye,
      label: 'Visitas Geradas',
      value: visitasGeradas > 0 ? fmt(visitasGeradas) : '—',
      sub: visitasGeradas > 0 ? 'originadas por você' : 'em breve',
      glowHex: '#0ea5e9',
      accentColor: 'text-sky-400',
    },
    {
      icon: ShoppingCart,
      label: 'Conversões',
      value: conversoes > 0 ? fmt(conversoes) : '—',
      sub: conversoes > 0 ? 'vendas originadas' : 'em breve',
      glowHex: '#8b5cf6',
      accentColor: 'text-violet-400',
    },
    {
      icon: DollarSign,
      label: 'Receita Gerada',
      value: receitaGerada != null ? fmtBRL(receitaGerada) : '—',
      sub: receitaGerada != null ? 'aos anunciantes' : 'em breve',
      glowHex: '#f59e0b',
      accentColor: 'text-amber-400',
    },
    {
      icon: Store,
      label: 'Empresas Ajudadas',
      value: fmt(empresasAjudadas),
      sub: 'da sua cidade',
      glowHex: '#ec4899',
      accentColor: 'text-pink-400',
    },
    {
      icon: TrendingUp,
      label: 'Impacto Econômico',
      value: impactoEconomico != null ? fmtBRL(impactoEconomico) : '—',
      sub: impactoEconomico != null ? 'movimentados' : 'em breve',
      glowHex: '#22c55e',
      accentColor: 'text-green-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map((s) => <StatCard key={s.label} {...s} />)}
    </div>
  );
}
