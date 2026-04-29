import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Clock, MapPin, DollarSign, Package, Users, CheckCircle } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface HistoryItem {
  id: string;
  type: 'ride' | 'delivery';
  origin: string;
  destination: string;
  value: number;
  completedAt: Date;
  customerName?: string;
}

interface ActivityHistoryCardProps {
  items: HistoryItem[];
  title?: string;
  emptyMessage?: string;
  maxItems?: number;
}

// Mock data for demonstration
export const mockHistoryItems: HistoryItem[] = [
  {
    id: 'h1',
    type: 'delivery',
    origin: 'Restaurante Sabor & Arte',
    destination: 'Rua Augusta, 500',
    value: 15.50,
    completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    customerName: 'Maria Silva',
  },
  {
    id: 'h2',
    type: 'ride',
    origin: 'Av. Paulista, 1000',
    destination: 'Shopping Iguatemi',
    value: 22.00,
    completedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
  },
  {
    id: 'h3',
    type: 'delivery',
    origin: 'Farmácia Popular',
    destination: 'Al. Santos, 1500',
    value: 12.00,
    completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    customerName: 'João Oliveira',
  },
];

export function ActivityHistoryCard({ 
  items, 
  title = 'Histórico Recente',
  emptyMessage = 'Nenhuma atividade concluída ainda',
  maxItems = 5 
}: ActivityHistoryCardProps) {
  const displayItems = items.slice(0, maxItems);
  
  if (items.length === 0) {
    return (
      <Card className="border-muted bg-muted/30">
        <CardContent className="py-8 text-center">
          <Clock className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="border-muted">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="pt-0">
        <ScrollArea className="max-h-[280px]">
          <div className="space-y-3">
            {displayItems.map((item, index) => (
              <div 
                key={item.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                {/* Icon */}
                <div className={`
                  mt-0.5 rounded-full p-2
                  ${item.type === 'ride' 
                    ? 'bg-primary/10 text-primary' 
                    : 'bg-accent/20 text-accent-foreground'
                  }
                `}>
                  {item.type === 'ride' ? (
                    <Users className="h-4 w-4" />
                  ) : (
                    <Package className="h-4 w-4" />
                  )}
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {item.type === 'ride' ? 'Corrida' : 'Entrega'}
                      </span>
                      <StatusBadge status="completed" size="sm" showIcon={false} />
                    </div>
                    <span className="font-semibold text-sm text-primary">
                      R$ {item.value.toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{item.origin}</span>
                    <span>→</span>
                    <span className="truncate">{item.destination}</span>
                  </div>
                  
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(item.completedAt, { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
                
                {/* Check Icon */}
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-1" />
              </div>
            ))}
          </div>
        </ScrollArea>
        
        {items.length > maxItems && (
          <p className="text-xs text-center text-muted-foreground mt-3 pt-3 border-t border-border">
            +{items.length - maxItems} atividades anteriores
          </p>
        )}
      </CardContent>
    </Card>
  );
}
