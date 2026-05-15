/**
 * CreditConsumptionChart
 *
 * Gráfico de consumo de créditos nos últimos N dias.
 * Recebe entries (já filtradas) e agrupa por dia.
 *
 * Fase 1: a UI passa o array já buscado (do useMerchantCredits.ledger).
 * Fase 1-DB: pode evoluir para usar uma view materializada `daily_consumption`.
 */

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ConsumptionEntry {
  /** ISO date string */
  created_at: string;
  /** type of entry — 'debit' counts as consumption, 'credit' is recharge */
  entry_type: string;
  /** amount in credits */
  amount: number;
}

interface Props {
  entries: ConsumptionEntry[];
  /** Número de dias para mostrar. Padrão: 14. */
  days?: number;
  /** Título customizado. */
  title?: string;
}

export function CreditConsumptionChart({
  entries,
  days = 14,
  title = 'Consumo nos últimos dias',
}: Props) {
  const data = useMemo(() => {
    const buckets = new Map<string, number>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Seed: todos os dias com 0
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, 0);
    }

    // Soma débitos por dia
    for (const e of entries) {
      if (e.entry_type !== 'debit') continue;
      const key = e.created_at.slice(0, 10);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + Math.abs(e.amount));
      }
    }

    return Array.from(buckets.entries()).map(([date, value]) => ({
      date,
      day: new Date(date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      }),
      value,
    }));
  }, [entries, days]);

  // Stats rápidas
  const total = data.reduce((a, b) => a + b.value, 0);
  const average = total / Math.max(data.length, 1);
  const last = data[data.length - 1]?.value ?? 0;
  const prevLast = data[data.length - 2]?.value ?? 0;
  const trend = last - prevLast;

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <div className="flex items-center gap-3 text-xs">
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase font-bold">
                Total {days}d
              </p>
              <p className="font-black text-base">{total}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase font-bold">
                Média/dia
              </p>
              <p className="font-black text-base">{average.toFixed(1)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1 justify-end">
                Hoje
                {trend > 0 ? (
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                ) : trend < 0 ? (
                  <TrendingDown className="h-3 w-3 text-rose-500" />
                ) : (
                  <Minus className="h-3 w-3 text-muted-foreground" />
                )}
              </p>
              <p className="font-black text-base">{last}</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                contentStyle={{ fontSize: '12px', borderRadius: 8 }}
                formatter={(v: number) => [`${v} créditos`, 'Consumo']}
                labelFormatter={(l: string) => l}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.value === max && max > 0 ? '#f59e0b' : '#fb923c'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
