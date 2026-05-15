/**
 * BalanceCard — separa visualmente os 4 baldes contábeis da carteira.
 *
 * Pilar Fase 1: separar saldo de UX (o que o usuário "tem agora") do saldo
 * contábil interno (current_balance), porque a longo prazo a divergência
 * vai crescer (D+1, escrow, retenções, KYC, etc).
 *
 * Convenção de valores: TUDO em centavos (number). Currency BRL.
 *
 * Layout:
 *   ┌──────────────────────────────────┐
 *   │ {title}                          │
 *   │                                  │
 *   │  Disponível                      │
 *   │  R$ 135,00            (grande)   │
 *   │                                  │
 *   │  ─────────────────                │
 *   │  Reservado    R$ 10,00           │
 *   │  Pendente     R$ 0,00            │
 *   │  ▸ Ver saldo contábil (R$ 145…)  │
 *   └──────────────────────────────────┘
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wallet, Lock, Clock, ChevronDown, ChevronUp, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface BalanceCardProps {
  /** Saldo que o usuário pode usar/sacar AGORA. Em centavos. */
  availableCents: number;
  /** Reservado para saques/operações em andamento. Em centavos. */
  reservedCents: number;
  /** Pendente — chega em D+1 ou está em rota. Em centavos. */
  pendingCents: number;
  /**
   * Saldo contábil total (current_balance). Em centavos.
   * Se omitido, é calculado como available + reserved + pending.
   */
  currentCents?: number;
  /** Título do card. Default: "Sua carteira". */
  title?: string;
  /** Label customizada do balde principal. Default: "Disponível". */
  primaryLabel?: string;
  /** Unidade da moeda para o sufixo. Default: BRL → "R$". */
  unitLabel?: string;
  /** Se true, NÃO mostra o disclaimer informativo. */
  hideDisclaimer?: boolean;
  /** className extra no Card raiz. */
  className?: string;
  /** Ação a ser renderizada no header (botão de saque etc). */
  headerAction?: React.ReactNode;
  /** Estado loading exibe skeletons. */
  isLoading?: boolean;
  /**
   * Formatador custom. Recebe o valor em centavos e devolve a string final.
   * Útil para créditos/pontos (unidade não-monetária).
   */
  formatValue?: (valueCents: number) => string;
}

const defaultFmt = (cents: number, unit = 'R$') => {
  const value = cents / 100;
  return `${unit} ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export function BalanceCard({
  availableCents,
  reservedCents,
  pendingCents,
  currentCents,
  title = 'Sua carteira',
  primaryLabel = 'Disponível',
  unitLabel = 'R$',
  hideDisclaimer = false,
  className = '',
  headerAction,
  isLoading = false,
  formatValue,
}: BalanceCardProps) {
  const [showAccounting, setShowAccounting] = useState(false);
  const computedCurrent =
    typeof currentCents === 'number'
      ? currentCents
      : availableCents + reservedCents + pendingCents;
  const fmt = (v: number) => (formatValue ? formatValue(v) : defaultFmt(v, unitLabel));

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Wallet className="w-4 h-4" />
          {title}
        </CardTitle>
        {headerAction}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Disponível — principal */}
        <div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            {primaryLabel}
            {!hideDisclaimer && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex"
                      aria-label="Sobre saldo disponível"
                    >
                      <Info className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    Saldo que você pode usar ou sacar agora. Reservado e
                    pendente ainda não estão liberados.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="text-2xl md:text-3xl font-bold tabular-nums">
            {isLoading ? '—' : fmt(availableCents)}
          </div>
        </div>

        {/* Reservado + Pendente */}
        <div className="space-y-2 pt-2 border-t border-border/50">
          <BalanceLine
            icon={<Lock className="w-3.5 h-3.5" />}
            label="Reservado"
            valueCents={reservedCents}
            fmt={fmt}
            hint="Em saque ou bloqueado em uma operação em andamento."
            isLoading={isLoading}
          />
          <BalanceLine
            icon={<Clock className="w-3.5 h-3.5" />}
            label="Pendente"
            valueCents={pendingCents}
            fmt={fmt}
            hint="A receber em D+1 ou serviço em rota."
            isLoading={isLoading}
          />
        </div>

        {/* Saldo contábil — collapsável */}
        <button
          type="button"
          onClick={() => setShowAccounting((v) => !v)}
          className="w-full flex items-center justify-between text-[11px] text-muted-foreground hover:text-foreground transition pt-1"
        >
          <span className="flex items-center gap-1">
            {showAccounting ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            {showAccounting ? 'Ocultar' : 'Ver'} saldo contábil
          </span>
          {showAccounting && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {fmt(computedCurrent)}
            </Badge>
          )}
        </button>
        {showAccounting && (
          <p className="text-[10px] text-muted-foreground leading-tight">
            Total no ledger contábil. Inclui valores ainda não liberados ao
            usuário (reservado + pendente). Use apenas para conferência interna.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface BalanceLineProps {
  icon: React.ReactNode;
  label: string;
  valueCents: number;
  fmt: (cents: number) => string;
  hint: string;
  isLoading: boolean;
}

function BalanceLine({ icon, label, valueCents, fmt, hint, isLoading }: BalanceLineProps) {
  const isEmpty = valueCents === 0;
  return (
    <div className="flex items-center justify-between text-xs">
      <span
        className={`inline-flex items-center gap-1.5 ${
          isEmpty ? 'text-muted-foreground/60' : 'text-muted-foreground'
        }`}
      >
        {icon}
        {label}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="inline-flex" aria-label={`Sobre ${label}`}>
                <Info className="w-3 h-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </span>
      <span
        className={`tabular-nums font-medium ${
          isEmpty ? 'text-muted-foreground/60' : ''
        }`}
      >
        {isLoading ? '—' : fmt(valueCents)}
      </span>
    </div>
  );
}
