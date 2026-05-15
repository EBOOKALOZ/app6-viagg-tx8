/**
 * SmartRechargeSuggestion
 *
 * Calcula consumo médio diário do lojista e estima quantos dias faltam
 * para acabar o saldo. Se < threshold (padrão 7 dias), exibe alerta com
 * sugestão de pacote.
 *
 * Inputs:
 *  - availableCredits — saldo atual
 *  - recentLedger — entries dos últimos N dias (usa pra calcular média)
 *  - onRecharge — callback (abre fluxo de compra)
 */

import { useMemo } from 'react';
import { AlertCircle, Sparkles, TrendingDown, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface LedgerEntryShape {
  created_at: string;
  entry_type: string;
  amount: number;
}

interface Props {
  availableCredits: number;
  recentLedger: LedgerEntryShape[];
  /** dias considerados para média. Padrão: 14 */
  windowDays?: number;
  /** Avisa se < este número de dias previstos. Padrão: 7 */
  warningThreshold?: number;
  /** Crítico se < este número. Padrão: 3 */
  criticalThreshold?: number;
  onRecharge?: () => void;
}

export function SmartRechargeSuggestion({
  availableCredits,
  recentLedger,
  windowDays = 14,
  warningThreshold = 7,
  criticalThreshold = 3,
  onRecharge,
}: Props) {
  const { dailyAvg, daysRemaining, level } = useMemo(() => {
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const consumed = recentLedger
      .filter((e) => e.entry_type === 'debit' && new Date(e.created_at).getTime() >= cutoff)
      .reduce((acc, e) => acc + Math.abs(e.amount), 0);

    const dailyAvg = consumed / windowDays;
    const daysRemaining = dailyAvg > 0 ? availableCredits / dailyAvg : Infinity;

    let level: 'ok' | 'warning' | 'critical' = 'ok';
    if (daysRemaining < criticalThreshold) level = 'critical';
    else if (daysRemaining < warningThreshold) level = 'warning';

    return { dailyAvg, daysRemaining, level };
  }, [availableCredits, recentLedger, windowDays, warningThreshold, criticalThreshold]);

  if (level === 'ok') return null;

  const isCritical = level === 'critical';

  return (
    <Card
      className={
        isCritical
          ? 'border-red-300 bg-gradient-to-br from-red-50 to-orange-50'
          : 'border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50'
      }
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isCritical ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
            }`}
          >
            {isCritical ? (
              <AlertCircle className="h-5 w-5" />
            ) : (
              <TrendingDown className="h-5 w-5" />
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className={`text-sm font-bold ${
                  isCritical ? 'text-red-700' : 'text-amber-700'
                }`}
              >
                {isCritical ? 'Saldo crítico' : 'Saldo baixo'}
              </h3>
              <span className="text-[10px] text-muted-foreground">
                · ~{Math.round(daysRemaining)} dias no ritmo atual
              </span>
            </div>

            <p
              className={`text-xs ${
                isCritical ? 'text-red-600' : 'text-amber-700'
              }`}
            >
              Você consome em média{' '}
              <strong>{dailyAvg.toFixed(1)} créditos/dia</strong>. Com{' '}
              <strong>{availableCredits} créditos</strong> disponíveis, sua loja
              pode parar de receber leads premium em pouco tempo.
            </p>

            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Recarregue agora para garantir continuidade — pacotes maiores têm bônus.
            </p>
          </div>

          {onRecharge && (
            <Button
              size="sm"
              variant={isCritical ? 'destructive' : 'default'}
              onClick={onRecharge}
              className="flex-shrink-0"
            >
              Recarregar
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
