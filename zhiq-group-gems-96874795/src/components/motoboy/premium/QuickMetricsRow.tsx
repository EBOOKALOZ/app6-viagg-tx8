import { Users, Zap, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface QuickMetricsRowProps {
  activeGroups: number | null | undefined;
  maxGroups?: number;
  isOnline?: boolean;
  isLoading?: boolean;
}

// Commission tiers mapping (new model: 3 groups = 6%)
const COMMISSION_TIERS = [
  { groups: 0, rate: 25 },
  { groups: 1, rate: 18 },
  { groups: 2, rate: 11 },
  { groups: 3, rate: 6 },
];

export function QuickMetricsRow({
  activeGroups,
  maxGroups = 3,
  isOnline = true,
  isLoading = false,
}: QuickMetricsRowProps) {
  const displayGroups = activeGroups ?? 0;

  // Calculate next goal
  const getNextGoal = () => {
    if (displayGroups >= maxGroups) {
      return { groups: maxGroups, rate: 6, achieved: true };
    }
    const nextTier = COMMISSION_TIERS.find(t => t.groups > displayGroups);
    return nextTier ? { ...nextTier, achieved: false } : { groups: maxGroups, rate: 6, achieved: false };
  };

  const nextGoal = getNextGoal();
  const groupsToNext = Math.max(0, nextGoal.groups - displayGroups);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-0 bg-card/80 shadow-md">
            <CardContent className="p-4">
              <div className="animate-pulse space-y-2">
                <div className="h-3 w-12 bg-muted rounded" />
                <div className="h-6 w-8 bg-muted rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const metrics = [
    {
      icon: Users,
      label: 'Grupos',
      value: `${displayGroups}/${maxGroups}`,
      subtext: displayGroups >= maxGroups ? 'Máximo' : `+${maxGroups - displayGroups} disponíveis`,
      iconColor: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
    {
      icon: Zap,
      label: 'Status',
      value: isOnline ? 'Online' : 'Offline',
      subtext: isOnline ? 'Recebendo chamadas' : 'Pausado',
      iconColor: isOnline ? 'text-emerald-500' : 'text-muted-foreground',
      bgColor: isOnline ? 'bg-emerald-500/10' : 'bg-muted/50',
      valueColor: isOnline ? 'text-emerald-600' : 'text-muted-foreground',
    },
    {
      icon: Target,
      label: 'Próxima Meta',
      value: nextGoal.achieved ? '🎯' : `${nextGoal.rate}%`,
      subtext: nextGoal.achieved ? 'Meta atingida!' : `+${groupsToNext} grupo${groupsToNext > 1 ? 's' : ''}`,
      iconColor: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      highlight: nextGoal.achieved,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {metrics.map((metric, index) => (
        <Card
          key={index}
          className={cn(
            'border-0 shadow-md transition-all duration-300 hover:shadow-lg',
            metric.highlight ? 'bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/30 dark:to-amber-900/20' : 'bg-card/90'
          )}
        >
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <div className={cn('p-1 rounded-md', metric.bgColor)}>
                <metric.icon className={cn('h-3 w-3', metric.iconColor)} />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {metric.label}
              </span>
            </div>

            <p className={cn(
              'text-lg font-bold tracking-tight',
              metric.valueColor || 'text-foreground'
            )}>
              {metric.value}
            </p>

            <p className="text-[10px] text-muted-foreground truncate">
              {metric.subtext}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
