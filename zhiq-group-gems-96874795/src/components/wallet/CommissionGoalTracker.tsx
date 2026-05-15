/**
 * CommissionGoalTracker
 *
 * Mostra para o motoboy:
 *  - Comissão atual (% que a plataforma retém)
 *  - Quantos grupos válidos ele tem hoje
 *  - O próximo "tier" e quantos grupos faltam pra atingir
 *  - Aviso quando inatividade está perto de 3 dias (Fase 2: regra real)
 *
 * Pensado para gamificar a postagem em grupos. Tabela de comissão segue
 * a regra do banco (regras_comissao_motoboy):
 *   0 grupos  → 35%
 *   1 grupo   → 28%
 *   2 grupos  → 20%
 *   3 grupos  → 15%
 *   4 grupos  → 11%
 *   5 grupos  → 8%
 *   6+ grupos → 6%
 */

import { TrendingDown, Trophy, AlertTriangle, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface CommissionTier {
  groups: number;
  rate: number;
  label: string;
}

export const COMMISSION_TIERS: CommissionTier[] = [
  { groups: 0, rate: 35, label: 'Sem grupos' },
  { groups: 1, rate: 28, label: '1 grupo' },
  { groups: 2, rate: 20, label: '2 grupos' },
  { groups: 3, rate: 15, label: '3 grupos' },
  { groups: 4, rate: 11, label: '4 grupos' },
  { groups: 5, rate: 8, label: '5 grupos' },
  { groups: 6, rate: 6, label: '6+ grupos (máximo)' },
];

export function getCommissionForGroups(activeGroups: number): CommissionTier {
  const tier = [...COMMISSION_TIERS]
    .reverse()
    .find((t) => activeGroups >= t.groups);
  return tier ?? COMMISSION_TIERS[0];
}

export function getNextTier(activeGroups: number): CommissionTier | null {
  if (activeGroups >= 6) return null;
  return COMMISSION_TIERS.find((t) => t.groups > activeGroups) ?? null;
}

interface Props {
  activeGroups: number;
  /** Dias desde a última postagem em grupo. Se >=3, alerta de perda de benefício. */
  daysSinceLastPost?: number;
  /** Callback para abrir tela de grupos. */
  onViewGroups?: () => void;
}

export function CommissionGoalTracker({
  activeGroups,
  daysSinceLastPost,
  onViewGroups,
}: Props) {
  const current = getCommissionForGroups(activeGroups);
  const next = getNextTier(activeGroups);
  const isMaxTier = !next;

  // Aviso: regra dos 3 dias sem postar (a ser aplicada via cron no banco)
  const inactivityWarning =
    daysSinceLastPost !== undefined && daysSinceLastPost >= 2 && activeGroups > 0;

  // Progress: % do caminho até o próximo tier
  const progressToNext = next
    ? Math.min(100, Math.round((activeGroups / next.groups) * 100))
    : 100;

  return (
    <Card className="border-2 border-motoboy/20 bg-gradient-to-br from-motoboy/5 to-transparent">
      <CardContent className="p-4 space-y-3">
        {/* Linha 1: tier atual + status */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-motoboy" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-motoboy">
                Sua comissão hoje
              </p>
            </div>
            <p className="text-3xl font-black text-foreground mt-1 leading-none">
              {current.rate}%
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {current.label}
            </p>
          </div>

          <div className="text-right">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="bg-motoboy/10 text-motoboy text-xs font-black cursor-help"
                  >
                    {activeGroups} grupos
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    Quanto mais grupos válidos você posta, menor a comissão.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {isMaxTier && (
              <p className="text-[9px] text-emerald-600 font-bold mt-1">
                ✓ Tier máximo
              </p>
            )}
          </div>
        </div>

        {/* Linha 2: meta para próximo tier */}
        {next && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">
                Faltam{' '}
                <strong className="text-foreground">
                  {next.groups - activeGroups}{' '}
                  {next.groups - activeGroups === 1 ? 'grupo' : 'grupos'}
                </strong>{' '}
                para cair para
              </span>
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-[10px] font-bold">
                {next.rate}%
              </Badge>
            </div>
            <Progress value={progressToNext} className="h-1.5" />
          </div>
        )}

        {/* Linha 3: aviso de inatividade */}
        {inactivityWarning && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-amber-700 font-semibold">
                Você está há {daysSinceLastPost} dias sem postar
              </p>
              <p className="text-[10px] text-amber-600">
                Após 3 dias sem postagem o benefício de comissão reduzida é perdido até você voltar a postar.
              </p>
            </div>
          </div>
        )}

        {/* Linha 4: ação */}
        {onViewGroups && !isMaxTier && (
          <button
            type="button"
            onClick={onViewGroups}
            className="w-full flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-[11px] font-semibold"
          >
            <span className="flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" />
              Ver meus grupos e adicionar novos
            </span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </CardContent>
    </Card>
  );
}
