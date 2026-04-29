import { Phone, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MotoboyCallsButtonProps {
  onClick: () => void;
  hasActiveCalls?: boolean;
  activeCallsCount?: number;
  isLoading?: boolean;
}

export function MotoboyCallsButton({
  onClick,
  hasActiveCalls = false,
  activeCallsCount = 0,
  isLoading = false,
}: MotoboyCallsButtonProps) {
  return (
    <div className="px-4">
      <Button
        onClick={onClick}
        disabled={isLoading}
        className={cn(
          'relative w-full h-14 text-lg font-bold rounded-2xl',
          'bg-gradient-to-r from-motoboy via-motoboy to-motoboy-hover',
          'hover:from-motoboy-hover hover:via-motoboy hover:to-motoboy',
          'shadow-lg shadow-motoboy/25 hover:shadow-xl hover:shadow-motoboy/30',
          'transform transition-all duration-200',
          'hover:scale-[1.02] active:scale-[0.98]',
          'border-0 text-motoboy-foreground',
          hasActiveCalls && 'animate-pulse'
        )}
      >
        {/* Glow effect */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-motoboy/0 via-white/10 to-motoboy/0 opacity-0 hover:opacity-100 transition-opacity" />
        
        <div className="relative flex items-center justify-center gap-3">
          <Phone className="h-5 w-5" />
          <span>VER CHAMADAS</span>
          <ArrowRight className="h-5 w-5" />
        </div>

        {/* Active calls badge */}
        {hasActiveCalls && activeCallsCount > 0 && (
          <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex items-center justify-center h-6 w-6 rounded-full bg-success text-xs font-bold text-success-foreground">
              {activeCallsCount}
            </span>
          </span>
        )}
      </Button>
    </div>
  );
}
