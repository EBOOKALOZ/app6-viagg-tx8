import { Flame, TrendingUp, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type DemandLevel = 'baixa' | 'normal' | 'alta' | 'muito_alta';

interface DemandCardProps {
  demandLevel: DemandLevel;
  message?: string;
  isLoading?: boolean;
}

export function DemandCard({
  demandLevel,
  message,
  isLoading = false,
}: DemandCardProps) {
  const demandConfig: Record<DemandLevel, { 
    label: string; 
    color: string; 
    bgColor: string;
    icon: React.ReactNode;
    defaultMessage: string;
  }> = {
    baixa: {
      label: 'BAIXA',
      color: 'text-muted-foreground',
      bgColor: 'bg-muted/50 border-border',
      icon: <Clock className="h-4 w-4" />,
      defaultMessage: 'Poucas chamadas no momento',
    },
    normal: {
      label: 'NORMAL',
      color: 'text-primary',
      bgColor: 'bg-primary/10 border-primary/20',
      icon: <TrendingUp className="h-4 w-4" />,
      defaultMessage: 'Fluxo estável de chamadas',
    },
    alta: {
      label: 'ALTA',
      color: 'text-accent-foreground',
      bgColor: 'bg-accent/20 border-accent/30',
      icon: <Flame className="h-4 w-4" />,
      defaultMessage: 'Muitas chamadas nos próximos minutos',
    },
    muito_alta: {
      label: 'MUITO ALTA',
      color: 'text-destructive',
      bgColor: 'bg-destructive/10 border-destructive/20',
      icon: <Flame className="h-4 w-4 animate-pulse" />,
      defaultMessage: 'Demanda extrema! Aproveite agora',
    },
  };

  const config = demandConfig[demandLevel];

  if (isLoading) {
    return (
      <Card className="border-0 bg-card/80 backdrop-blur-sm shadow-lg">
        <CardContent className="p-5">
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-6 w-16 bg-muted rounded" />
            <div className="h-3 w-48 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'border bg-card/80 backdrop-blur-sm shadow-lg transition-all duration-300',
        config.bgColor
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">
              Demanda na região
            </span>
            
            <Badge
              variant="outline"
              className={cn(
                'font-bold text-sm px-3 py-1 gap-1.5 border-2',
                config.color,
                demandLevel === 'muito_alta' && 'animate-pulse'
              )}
            >
              {config.icon}
              {config.label}
            </Badge>
            
            <p className="text-sm text-muted-foreground">
              {message || config.defaultMessage}
            </p>
          </div>

          {(demandLevel === 'alta' || demandLevel === 'muito_alta') && (
            <div className="relative">
              <div
                className={cn(
                  'h-12 w-12 rounded-full flex items-center justify-center',
                  demandLevel === 'muito_alta' 
                    ? 'bg-destructive/20' 
                    : 'bg-accent/20'
                )}
              >
                <Flame
                  className={cn(
                    'h-6 w-6',
                    demandLevel === 'muito_alta' 
                      ? 'text-destructive animate-bounce' 
                      : 'text-accent-foreground'
                  )}
                />
              </div>
              {demandLevel === 'muito_alta' && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive/75 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
                </span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
