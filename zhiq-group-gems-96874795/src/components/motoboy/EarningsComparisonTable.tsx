import { useMemo } from 'react';
import { ChevronUp, TrendingUp, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

// Commission rules based on active groups
const COMMISSION_RULES = [
  { groups: 0, percentage: 25 },
  { groups: 1, percentage: 18 },
  { groups: 2, percentage: 11 },
  { groups: 3, percentage: 6 },
];

interface EarningsComparisonTableProps {
  grossValue: number;
  currentGroups?: number;
  currentPercentage?: number;
  compact?: boolean;
  onCollapse?: () => void;
}

export function EarningsComparisonTable({
  grossValue,
  currentGroups = 0,
  currentPercentage,
  compact = true,
  onCollapse,
}: EarningsComparisonTableProps) {

  const comparisons = useMemo(() => {
    return COMMISSION_RULES.map((rule) => {
      const commission = grossValue * (rule.percentage / 100);
      const netValue = grossValue - commission;
      // Match by percentage if available, otherwise by groups
      const isCurrent = currentPercentage !== undefined
        ? rule.percentage === currentPercentage
        : rule.groups === currentGroups;
      const isBest = rule.groups === 3;
      const isWorst = rule.groups === 0;

      return {
        ...rule,
        commission,
        netValue,
        isCurrent,
        isBest,
        isWorst,
      };
    });
  }, [grossValue, currentGroups, currentPercentage]);

  // Calculate potential gain if user had 6 groups
  const currentEarning = comparisons.find(c => c.isCurrent)?.netValue || comparisons[0].netValue;
  const bestEarning = comparisons.find(c => c.isBest)?.netValue || comparisons[3].netValue;
  const potentialGain = bestEarning - currentEarning;

  return (
    <div className="rounded-lg bg-gradient-to-r from-amber-500/5 to-orange-500/5 border border-amber-500/20 overflow-hidden">
      {/* Header */}
      <button
        onClick={onCollapse}
        className={cn(
          "w-full p-2 flex items-center justify-between bg-amber-500/10",
          compact && onCollapse && "hover:bg-amber-500/20 cursor-pointer"
        )}
      >
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-amber-600" />
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            Quanto você poderia ganhar com mais grupos
          </span>
        </div>
        {compact && onCollapse && <ChevronUp className="h-4 w-4 text-amber-600" />}
      </button>

      {/* Table */}
      <div className="p-2">
        <div className="grid grid-cols-4 gap-1 text-[10px] font-medium text-muted-foreground mb-1 px-1">
          <span>Grupos</span>
          <span className="text-center">Taxa</span>
          <span className="text-right">Você recebe</span>
          <span className="text-right">Diferença</span>
        </div>

        <div className="space-y-1">
          {comparisons.map((item) => {
            const difference = item.netValue - currentEarning;

            return (
              <div
                key={item.groups}
                className={cn(
                  "grid grid-cols-4 gap-1 text-xs py-1.5 px-1 rounded transition-colors",
                  item.isCurrent && "bg-primary/20 ring-1 ring-primary/40",
                  item.isBest && !item.isCurrent && "bg-emerald-500/10",
                  item.isWorst && !item.isCurrent && "bg-destructive/10"
                )}
              >
                {/* Groups */}
                <div className="flex items-center gap-1">
                  <span className={cn(
                    "font-semibold",
                    item.isCurrent && "text-primary",
                    item.isBest && !item.isCurrent && "text-emerald-600 dark:text-emerald-400",
                    item.isWorst && !item.isCurrent && "text-destructive"
                  )}>
                    {item.groups}
                  </span>
                  {item.isCurrent && (
                    <span className="text-[9px] bg-primary/20 text-primary px-1 py-0.5 rounded">
                      VOCÊ
                    </span>
                  )}
                </div>

                {/* Percentage */}
                <span className={cn(
                  "text-center font-medium",
                  item.isWorst && !item.isCurrent && "text-destructive",
                  item.isBest && !item.isCurrent && "text-emerald-600 dark:text-emerald-400"
                )}>
                  {item.percentage}%
                </span>

                {/* Net Value */}
                <span className={cn(
                  "text-right font-bold",
                  item.isCurrent && "text-primary",
                  item.isBest && !item.isCurrent && "text-emerald-600 dark:text-emerald-400",
                  item.isWorst && !item.isCurrent && "text-destructive"
                )}>
                  R$ {item.netValue.toFixed(2)}
                </span>

                {/* Difference */}
                <span className={cn(
                  "text-right font-medium",
                  difference > 0 && "text-emerald-600 dark:text-emerald-400",
                  difference < 0 && "text-destructive",
                  difference === 0 && "text-muted-foreground"
                )}>
                  {difference === 0 ? '-' : (
                    difference > 0 ? `+R$ ${difference.toFixed(2)}` : `-R$ ${Math.abs(difference).toFixed(2)}`
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {/* Call to Action */}
        {potentialGain > 0.01 && (
          <div className="mt-2 pt-2 border-t border-amber-500/20 text-center">
            <p className="text-[10px] text-muted-foreground">
              Com 3 grupos você ganharia{' '}
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                R$ {potentialGain.toFixed(2)} a mais
              </span>{' '}
              nesta entrega!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
