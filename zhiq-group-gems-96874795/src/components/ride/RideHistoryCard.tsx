import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Clock, MapPin, Star, CheckCircle, XCircle, Route } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RideHistoryItem } from '@/hooks/useRideHistory';

interface RideHistoryCardProps {
  items: RideHistoryItem[];
  title?: string;
  emptyMessage?: string;
  maxItems?: number;
  role: 'passenger' | 'mototaxi';
}

export function RideHistoryCard({ 
  items, 
  title = 'Histórico de Corridas',
  emptyMessage = 'Você ainda não realizou corridas.',
  maxItems = 10,
  role,
}: RideHistoryCardProps) {
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
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-3">
            {displayItems.map((item) => (
              <div 
                key={item.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                {/* Avatar do participante */}
                <Avatar className="w-11 h-11 border-2 border-border shadow-sm flex-shrink-0">
                  <AvatarImage src={item.participantAvatar} alt={item.participantName} />
                  <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white font-bold">
                    {item.participantName?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Nome e Status */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-sm truncate">
                        {item.participantName}
                      </span>
                      {item.participantRating && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Star className="h-3 w-3 fill-zhiq-gold text-zhiq-gold" />
                          {item.participantRating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <Badge 
                      variant={item.status === 'finalizada' ? 'default' : 'destructive'}
                      className={`text-xs ${
                        item.status === 'finalizada' 
                          ? 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30' 
                          : 'bg-destructive/20 text-destructive border-destructive/30'
                      }`}
                    >
                      {item.status === 'finalizada' ? 'Concluída' : 'Cancelada'}
                    </Badge>
                  </div>
                  
                  {/* Origem e Destino */}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
                    <MapPin className="h-3 w-3 flex-shrink-0 text-primary" />
                    <span className="truncate">{item.origin}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                    <MapPin className="h-3 w-3 flex-shrink-0 text-destructive" />
                    <span className="truncate">{item.destination}</span>
                  </div>
                  
                  {/* Info Row: Data, Distância, Valor */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {format(item.completedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                    
                    <div className="flex items-center gap-3">
                      {item.distanceKm && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Route className="h-3 w-3" />
                          {item.distanceKm.toFixed(1)} km
                        </span>
                      )}
                      <span className={`font-semibold ${
                        role === 'mototaxi' ? 'text-green-600' : 'text-primary'
                      }`}>
                        {role === 'mototaxi' ? '+' : ''}R$ {item.value.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Status Icon */}
                {item.status === 'finalizada' ? (
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-1" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-1" />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
        
        {items.length > maxItems && (
          <p className="text-xs text-center text-muted-foreground mt-3 pt-3 border-t border-border">
            +{items.length - maxItems} corridas anteriores
          </p>
        )}
      </CardContent>
    </Card>
  );
}
