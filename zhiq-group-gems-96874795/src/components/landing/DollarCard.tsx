import { useExchangeRateRich } from '@/hooks/useExchangeRateRich';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

export function DollarCard() {
  const { rate, loading } = useExchangeRateRich();

  if (loading) {
    return (
      <div className="rounded-2xl p-6 min-h-[220px] animate-pulse" style={{ background: 'linear-gradient(135deg, #1a2332 0%, #243447 100%)' }}>
        <div className="h-4 w-32 rounded bg-white/20 mb-4" />
        <div className="h-10 w-24 rounded bg-white/20" />
      </div>
    );
  }

  if (!rate) {
    return (
      <div className="rounded-2xl p-6 min-h-[220px] flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1a2332 0%, #243447 100%)' }}>
        <p className="text-white/50 text-sm">Cotação indisponível</p>
      </div>
    );
  }

  const isUp = rate.direction === 'up';
  const isDown = rate.direction === 'down';
  const timeStr = rate.updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className="relative rounded-2xl p-6 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #1a2332 0%, #243447 100%)' }}
    >
      <DollarSign className="absolute -right-4 -top-2 h-32 w-32 text-white/5 pointer-events-none" />

      <div className="relative z-10 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Cotação do dólar</p>

        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-white/10 shrink-0">
            <DollarSign className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-4xl font-bold text-white leading-none">
                R$ {rate.current.toFixed(2)}
              </p>
              <span
                className={`flex items-center gap-0.5 text-sm font-semibold ${
                  isUp ? 'text-red-400' : isDown ? 'text-emerald-400' : 'text-white/60'
                }`}
              >
                {isUp ? <TrendingUp className="h-4 w-4" /> : isDown ? <TrendingDown className="h-4 w-4" /> : null}
                {rate.variationPercent > 0 ? '+' : ''}{rate.variationPercent.toFixed(2)}%
              </span>
            </div>
            <p className="text-sm text-white/60 mt-1">USD / BRL</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/10">
          <div className="text-white/70">
            <p className="text-[10px] uppercase tracking-wide">Abertura</p>
            <p className="text-sm font-semibold text-white">{rate.open.toFixed(2)}</p>
          </div>
          <div className="text-white/70">
            <p className="text-[10px] uppercase tracking-wide">Máxima</p>
            <p className="text-sm font-semibold text-white">{rate.high.toFixed(2)}</p>
          </div>
          <div className="text-white/70">
            <p className="text-[10px] uppercase tracking-wide">Mínima</p>
            <p className="text-sm font-semibold text-white">{rate.low.toFixed(2)}</p>
          </div>
        </div>

        <div className="flex items-center justify-end pt-1">
          <p className="text-[11px] text-white/50">
            Atualizado às {timeStr}
          </p>
        </div>
      </div>
    </div>
  );
}
