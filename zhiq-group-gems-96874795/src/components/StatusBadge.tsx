import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, Play, Package, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ActivityStatus = 'waiting' | 'available' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';

interface StatusBadgeProps {
  status: ActivityStatus;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

const statusConfig: Record<ActivityStatus, {
  label: string;
  icon: typeof Clock;
  className: string;
}> = {
  waiting: {
    label: 'Aguardando',
    icon: Clock,
    className: 'bg-muted text-muted-foreground border-muted',
  },
  available: {
    label: 'Disponível',
    icon: Package,
    className: 'bg-accent/20 text-accent-foreground border-accent/30',
  },
  accepted: {
    label: 'Aceito',
    icon: CheckCircle,
    className: 'bg-primary/20 text-primary border-primary/30',
  },
  in_progress: {
    label: 'Em Andamento',
    icon: Play,
    className: 'bg-accent/20 text-accent-foreground border-accent/30',
  },
  completed: {
    label: 'Finalizado',
    icon: CheckCircle,
    className: 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30',
  },
  cancelled: {
    label: 'Cancelado',
    icon: Clock,
    className: 'bg-destructive/20 text-destructive border-destructive/30',
  },
};

export function StatusBadge({ status, size = 'md', showIcon = true, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  
  return (
    <Badge 
      variant="outline"
      className={cn(
        'font-medium transition-all',
        config.className,
        size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1',
        className
      )}
    >
      {showIcon && (
        <Icon className={cn(
          'mr-1.5',
          size === 'sm' ? 'h-3 w-3' : 'h-4 w-4',
          status === 'in_progress' && 'animate-pulse'
        )} />
      )}
      {config.label}
    </Badge>
  );
}
