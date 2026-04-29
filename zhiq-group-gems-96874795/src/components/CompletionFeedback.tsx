import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Star, DollarSign, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompletionFeedbackProps {
  type: 'ride' | 'delivery';
  value: number;
  onClose: () => void;
  customerName?: string;
}

export function CompletionFeedback({ type, value, onClose, customerName }: CompletionFeedbackProps) {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    // Trigger animation
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const typeLabel = type === 'ride' ? 'Corrida' : 'Entrega';
  
  return (
    <Card className={cn(
      'border-2 border-green-500/50 bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 overflow-hidden transition-all duration-500',
      isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
    )}>
      <CardContent className="py-8 text-center space-y-4">
        {/* Success Icon with Animation */}
        <div className={cn(
          'mx-auto w-20 h-20 rounded-full bg-green-500 flex items-center justify-center transition-transform duration-700',
          isVisible ? 'scale-100' : 'scale-0'
        )}>
          <CheckCircle className="h-10 w-10 text-white" />
        </div>
        
        {/* Title */}
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-green-700 dark:text-green-400">
            {typeLabel} Concluída!
          </h3>
          {customerName && (
            <p className="text-sm text-muted-foreground">
              Cliente: {customerName}
            </p>
          )}
        </div>
        
        {/* Value Earned */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/20 border border-green-500/30">
          <DollarSign className="h-5 w-5 text-green-600" />
          <span className="text-lg font-bold text-green-700 dark:text-green-400">
            R$ {value.toFixed(2)}
          </span>
          <span className="text-sm text-green-600">ganho</span>
        </div>
        
        {/* Rating Prompt (visual only) */}
        <div className="flex items-center justify-center gap-1 py-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star 
              key={star} 
              className="h-6 w-6 text-accent fill-accent cursor-pointer hover:scale-110 transition-transform" 
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Avalie sua experiência</p>
        
        {/* Continue Button */}
        <Button 
          onClick={onClose}
          className="mt-4 bg-green-600 hover:bg-green-700 text-white"
        >
          Continuar
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}
