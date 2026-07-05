import { cn } from '@/lib/utils';
import { Store, Package, Wrench, Users, Eye, ShoppingCart, TrendingUp, DollarSign } from 'lucide-react';

interface RIDVImpactProps {
  empresasAjudadas?: number;
  produtosDivulgados?: number;
  servicosDivulgados?: number;
  clientesAlcancados?: number;
  visitasGeradas?: number;
  conversoes?: number;
  vendas?: number;
  valorMovimentado?: number | null;
}

interface ImpactItemProps {
  icon: typeof Store;
  label: string;
  value: string;
  glowHex: string;
  accentColor: string;
  isEmpty?: boolean;
}

function ImpactItem({ icon: Icon, label, value, glowHex, accentColor, isEmpty }: ImpactItemProps) {
  return (
    <div
      className="relative rounded-xl p-3.5 overflow-hidden transition-all hover:-translate-y-0.5"
      style={{
        background: 'linear-gradient(145deg, #1B1F24 0%, #0D0F12 100%)',
        border: '1px solid rgba(42,48,56,0.80)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        opacity: isEmpty ? 0.6 : 1,
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[1.5px]"
        style={{ background: `linear-gradient(90deg, transparent, ${isEmpty ? '#3f4550' : glowHex}, transparent)` }}
      />
      <div
        className="absolute -top-4 -left-4 w-12 h-12 rounded-full blur-xl opacity-20"
        style={{ background: isEmpty ? '#3f4550' : glowHex }}
      />
      <div className="relative z-10">
        <div
          className="p-1.5 rounded-lg w-fit mb-2"
          style={{
            background: isEmpty ? 'rgba(63,69,80,0.15)' : `${glowHex}15`,
            border: `1px solid ${isEmpty ? 'rgba(63,69,80,0.20)' : `${glowHex}22`}`,
          }}
        >
          <Icon className={cn('h-3.5 w-3.5', isEmpty ? 'text-zinc-600' : accentColor)} />
        </div>
        <p className={cn('text-[22px] font-black leading-none', isEmpty ? 'text-zinc-700' : 'text-white')}>
          {value}
        </p>
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#A7B0BE]/45 mt-1">{label}</p>
      </div>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString('pt-BR');
const fmtBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);

export function RIDVImpact({
  empresasAjudadas = 0,
  produtosDivulgados = 0,
  servicosDivulgados = 0,
  clientesAlcancados = 0,
  visitasGeradas = 0,
  conversoes = 0,
  vendas = 0,
  valorMovimentado = null,
}: RIDVImpactProps) {
  const total = empresasAjudadas + produtosDivulgados + servicosDivulgados + visitasGeradas + conversoes + vendas;
  const participationPercent = Math.min(100, total > 0 ? Math.floor(total / 50) : 0);

  const items: ImpactItemProps[] = [
    {
      icon: Store, label: 'Empresas Ajudadas', value: fmt(empresasAjudadas),
      glowHex: '#FF6A00', accentColor: 'text-orange-400', isEmpty: empresasAjudadas === 0,
    },
    {
      icon: Package, label: 'Produtos Divulgados', value: fmt(produtosDivulgados),
      glowHex: '#10b981', accentColor: 'text-emerald-400', isEmpty: produtosDivulgados === 0,
    },
    {
      icon: Wrench, label: 'Serviços Divulgados', value: fmt(servicosDivulgados),
      glowHex: '#0ea5e9', accentColor: 'text-sky-400', isEmpty: servicosDivulgados === 0,
    },
    {
      icon: Users, label: 'Clientes Alcançados', value: fmt(clientesAlcancados),
      glowHex: '#8b5cf6', accentColor: 'text-violet-400', isEmpty: clientesAlcancados === 0,
    },
    {
      icon: Eye, label: 'Visitas Geradas', value: fmt(visitasGeradas),
      glowHex: '#f59e0b', accentColor: 'text-amber-400', isEmpty: visitasGeradas === 0,
    },
    {
      icon: ShoppingCart, label: 'Conversões', value: fmt(conversoes),
      glowHex: '#ec4899', accentColor: 'text-pink-400', isEmpty: conversoes === 0,
    },
    {
      icon: TrendingUp, label: 'Vendas', value: fmt(vendas),
      glowHex: '#22c55e', accentColor: 'text-green-400', isEmpty: vendas === 0,
    },
    {
      icon: DollarSign,
      label: 'Valor Movimentado',
      value: valorMovimentado != null ? fmtBRL(valorMovimentado) : '—',
      glowHex: '#f59e0b',
      accentColor: 'text-amber-400',
      isEmpty: valorMovimentado == null,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Institutional message */}
      <div
        className="relative rounded-2xl overflow-hidden p-4"
        style={{
          background: 'linear-gradient(135deg, rgba(255,106,0,0.12) 0%, rgba(255,149,0,0.06) 100%)',
          border: '1px solid rgba(255,106,0,0.25)',
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: 'linear-gradient(90deg, transparent, #FF6A00, transparent)' }}
        />
        <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-3xl opacity-20"
          style={{ background: '#FF6A00' }}
        />
        <div className="relative z-10 flex items-start gap-3">
          <span className="text-2xl shrink-0">🌎</span>
          <div>
            <p className="text-sm font-black text-white leading-snug">
              Você está ajudando empresas da sua cidade a vender mais através da Viagg.
            </p>
            <p className="text-[11px] text-[#A7B0BE]/55 mt-1.5 leading-relaxed">
              Cada campanha que você compartilha fortalece a economia local e conecta negócios a novos clientes.
            </p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#A7B0BE]/45">
            Sua participação RIDV
          </p>
          <p className="text-[10px] font-black text-orange-400">{participationPercent}%</p>
        </div>
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ background: 'rgba(42,48,56,0.80)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${participationPercent}%`,
              background: 'linear-gradient(90deg, #FF6A00, #FF9500)',
            }}
          />
        </div>
      </div>

      {/* Impact grid */}
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => <ImpactItem key={item.label} {...item} />)}
      </div>
    </div>
  );
}
