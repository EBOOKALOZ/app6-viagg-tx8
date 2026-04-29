import { Users, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface ActiveGroupsCardProps {
  activeGroups: number;
  maxGroups?: number;
  isLoading?: boolean;
  onClick?: () => void;
}

export function ActiveGroupsCard({
  activeGroups,
  maxGroups = 3,
  isLoading = false,
  onClick,
}: ActiveGroupsCardProps) {
  const progressPercentage = Math.min((activeGroups / maxGroups) * 100, 100);
  const groupsRemaining = Math.max(maxGroups - activeGroups, 0);

  const getProgressColor = () => {
    if (activeGroups >= 3) return 'bg-primary';
    if (activeGroups >= 2) return 'bg-accent';
    if (activeGroups >= 1) return 'bg-accent';
    return 'bg-destructive';
  };

  if (isLoading) {
    return (
      <Card className="border-0 bg-card/80 backdrop-blur-sm shadow-lg">
        <CardContent className="p-5">
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-8 w-16 bg-muted rounded" />
            <div className="h-2 w-full bg-muted rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'border-0 bg-card/80 backdrop-blur-sm shadow-lg transition-all duration-300',
        onClick && 'cursor-pointer hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]'
      )}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">
                Grupos Ativos
              </span>
            </div>
            
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-extrabold tracking-tighter text-foreground">
                {activeGroups}
              </span>
              <span className="text-xl font-medium text-muted-foreground">
                / {maxGroups}
              </span>
            </div>
          </div>

          {onClick && (
            <div className="p-2 rounded-full bg-primary/10">
              <ChevronRight className="h-5 w-5 text-primary" />
            </div>
          )}
        </div>

        {/* Animated progress bar */}
        <div className="space-y-2">
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-1000 ease-out',
                getProgressColor()
              )}
              style={{ width: `${progressPercentage}%` }}
            >
              {/* Shimmer effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground">
            {groupsRemaining > 0 ? (
              <>
                <span className="font-semibold text-primary">+{groupsRemaining}</span> grupos para reduzir comissão
              </>
            ) : (
              <span className="text-primary font-semibold">
                🎉 Comissão mínima atingida!
              </span>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
