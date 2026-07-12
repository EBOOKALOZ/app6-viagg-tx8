import { cn } from '@/lib/utils';
import { Eye, MousePointerClick, MapPin, ShoppingCart, DollarSign, Send } from 'lucide-react';

interface RIDVResultadosProps {
  visualizacoes?: number;
  cliques?: number;
  visitas?: number;
  conversoes?: number;
  vendas?: number;
  receitaGerada?: number | null;
  isLoading?: boolean;
}

interface MetricItemProps {
  icon: typeof Eye;
  label: string;
  value: string;
  sub?: string;
  glowHex: string;
  accentColor: string;
  comingSoon?: boolean;
}

function MetricItem({ icon: Icon, label, value, sub, glowHex, accentColor, comingSoon }: MetricItemProps) {
  return (
    <div
      className="relative rounded-2xl p-4 overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, #F0FDF4 0%, #ECFDF5 100%)', // Verde bem leve e suave
        border: '1px solid rgba(16, 185, 129, 0.15)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
        opacity: 1,
      }}
    >
      {/* Contraste de amarelo no topo */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, transparent, #F5E62B, transparent)` }}
      />
      <div
        className="absolute -top-6 -left-6 w-16 h-16 rounded-full blur-2xl opacity-40"
        style={{ background: '#F5E62B' }}
      />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="p-1.5 rounded-lg"
            style={{
              background: 'rgba(245, 230, 43, 0.25)', // Fundo amarelo suave no ícone
              border: '1px solid rgba(245, 230, 43, 0.4)',
            }}
          >
            <Icon className={cn('h-3.5 w-3.5', comingSoon ? 'text-zinc-500' : 'text-emerald-700')} />
          </div>
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-800/60 leading-none">{label}</p>
        </div>
        <p className={cn('text-[26px] font-black leading-none tracking-tight', comingSoon ? 'text-zinc-500' : 'text-emerald-950')}>
          {value}
        </p>
        {sub && (
          <p className={cn('text-[10px] mt-1 font-medium', comingSoon ? 'text-zinc-400' : 'text-emerald-800/70')}>
            {sub}
          </p>
        )}
        {comingSoon && (
          <span className="inline-block mt-1.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/50 text-emerald-700 border border-emerald-200">
            em breve
          </span>
        )}
      </div>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString('pt-BR');
const fmtBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);

export function RIDVResultados({
  visualizacoes = 0,
  cliques = 0,
  visitas = 0,
  conversoes = 0,
  vendas = 0,
  receitaGerada = null,
  isLoading = false,
}: RIDVResultadosProps) {

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl p-4 animate-pulse"
            style={{ background: 'linear-gradient(145deg, #ECFDF5, #D1FAE5)', border: '1px solid rgba(16, 185, 129, 0.2)' }}
          >
            <div className="flex gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-900/10" />
              <div className="h-2 w-16 rounded bg-emerald-900/10 self-center" />
            </div>
            <div className="h-7 w-10 rounded bg-emerald-900/10" />
          </div>
        ))}
      </div>
    );
  }

  const metrics: MetricItemProps[] = [
    {
      icon: Eye,
      label: 'Visualizações',
      value: fmt(visualizacoes),
      sub: 'total de impressões',
      glowHex: '#0ea5e9',
      accentColor: 'text-sky-400',
      comingSoon: visualizacoes === 0,
    },
    {
      icon: MousePointerClick,
      label: 'Cliques',
      value: fmt(cliques),
      sub: 'nos links compartilhados',
      glowHex: '#8b5cf6',
      accentColor: 'text-violet-400',
      comingSoon: cliques === 0,
    },
    {
      icon: MapPin,
      label: 'Visitas',
      value: fmt(visitas),
      sub: 'ao estabelecimento',
      glowHex: '#10b981',
      accentColor: 'text-emerald-400',
      comingSoon: visitas === 0,
    },
    {
      icon: ShoppingCart,
      label: 'Conversões',
      value: fmt(conversoes),
      sub: 'ações realizadas',
      glowHex: '#f59e0b',
      accentColor: 'text-amber-400',
      comingSoon: conversoes === 0,
    }
  ];

  return (
    <div className="space-y-4">
      {/* Title */}
      <div
        className="rounded-xl p-3 flex items-center gap-2"
        style={{ background: 'rgba(255,106,0,0.06)', border: '1px solid rgba(255,106,0,0.12)' }}
      >
        <span className="text-sm">📊</span>
        <p className="text-[11px] font-bold text-[#A7B0BE]/60 leading-relaxed">
          Consumindo métricas oficiais quando disponíveis. Dados em tempo real assim que integração for ativada.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {metrics.map((m) => <MetricItem key={m.label} {...m} />)}
      </div>
    </div>
  );
}
