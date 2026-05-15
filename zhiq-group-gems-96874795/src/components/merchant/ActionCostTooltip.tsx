/**
 * ActionCostTooltip
 *
 * Wrapper de tooltip que mostra "Esta ação consome X créditos" em qualquer
 * botão/elemento. Aceita o código da feature (igual ao usage_rules) e
 * exibe a quantidade de créditos definida.
 *
 * Fase 1: custo é passado por prop. Fase 1-DB: lê de merchant_credit_usage_rules.
 */

import type { ReactNode } from 'react';
import { Coins, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Props {
  children: ReactNode;
  /** Código da feature em merchant_credit_usage_rules (ex: 'marketplace_product_click') */
  featureCode: string;
  /** Quantidade de créditos. Se omitido, busca do DEFAULT_COSTS. */
  cost?: number;
  /** Mensagem custom. Se omitida, gera automática. */
  message?: string;
  /** Lado do tooltip. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Se true, mostra ícone Info ao lado em vez de só tooltip silencioso. */
  visibleHint?: boolean;
}

const DEFAULT_COSTS: Record<string, number> = {
  marketplace_product_click: 1,
  purchase_intention_received: 5,
  offer_accept_contact_unlock: 2,
  view_phone_premium: 3,
  product_boost: 50,
  campaign_send: 10,
  whatsapp_unlock: 2,
};

export function ActionCostTooltip({
  children,
  featureCode,
  cost,
  message,
  side = 'top',
  visibleHint = false,
}: Props) {
  const effectiveCost = cost ?? DEFAULT_COSTS[featureCode] ?? 0;
  const text =
    message ??
    (effectiveCost === 0
      ? 'Esta ação não consome créditos.'
      : effectiveCost === 1
        ? 'Esta ação consome 1 crédito da sua loja.'
        : `Esta ação consome ${effectiveCost} créditos da sua loja.`);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1">
            {children}
            {visibleHint && effectiveCost > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Coins className="h-3 w-3" />
                {effectiveCost}
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs">
          <div className="flex items-start gap-1.5">
            <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <p className="text-xs">{text}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
