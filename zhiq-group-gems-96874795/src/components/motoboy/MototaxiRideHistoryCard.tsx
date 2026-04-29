import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Clock, MapPin, Star, CheckCircle, XCircle, Route, ChevronLeft, ChevronRight, DollarSign, Percent, History } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

export interface MototaxiRideHistoryItem {
  id: string;
  origin: string;
  destination: string;
  value: number;
  status: 'finalizada' | 'cancelada';
  completedAt: Date;
  participantId: string;
  participantName: string;
  participantAvatar?: string;
  participantRating?: number;
  distanceKm?: number;
  durationMinutes?: number;
  // Financial fields
  commissionRate: number;
  platformFee: number;
  netAmount: number;
}

interface MototaxiRideHistoryCardProps {
  items: MototaxiRideHistoryItem[];
  isLoading?: boolean;
  currentPage: number;
  totalPages: number;
  totalEarnings: number;
  onPageChange: (page: number) => void;
}

export function MototaxiRideHistoryCard({ 
  items, 
  isLoading,
  currentPage,
  totalPages,
  totalEarnings,
  onPageChange,
}: MototaxiRideHistoryCardProps) {
  const navigate = useNavigate();
  
  if (items.length === 0 && !isLoading) {
    return (
      <Card className="border-muted bg-muted/30">
        <CardContent className="py-8 text-center">
          <Clock className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Você ainda não realizou corridas.</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="border-muted">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            Histórico de Corridas
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/mototaxi/history')}
            className="text-xs"
          >
            Ver tudo
          </Button>
        </div>
        
        {/* Summary */}
        <div className="mt-2 p-3 rounded-lg bg-gradient-to-r from-green-500/10 to-green-500/5 border border-green-500/20">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Total Recebido (líquido)</span>
            <span className="text-lg font-bold text-green-600">
              R$ {totalEarnings.toFixed(2)}
            </span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <ScrollArea className="max-h-[350px]">
          <div className="space-y-3">
            {items.map((item) => (
              <div 
                key={item.id}
                className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                {/* Header: Avatar, Name, Status */}
                <div className="flex items-start gap-3">
                  <Avatar className="w-10 h-10 border-2 border-border shadow-sm flex-shrink-0">
                    <AvatarImage src={item.participantAvatar} alt={item.participantName} />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white font-bold text-xs">
                      {item.participantName?.charAt(0)?.toUpperCase() || 'P'}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-sm truncate">
                          {item.participantName}
                        </span>
                        {item.participantRating && (
                          <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
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
                    
                    {/* Locations */}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <MapPin className="h-3 w-3 flex-shrink-0 text-primary" />
                      <span className="truncate">{item.origin}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                      <MapPin className="h-3 w-3 flex-shrink-0 text-destructive" />
                      <span className="truncate">{item.destination}</span>
                    </div>
                  </div>
                </div>
                
                {/* Financial Details */}
                <div className="mt-2 pt-2 border-t border-border/50 grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center">
                    <p className="text-muted-foreground mb-0.5">Bruto</p>
                    <p className="font-medium">R$ {item.value.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground mb-0.5 flex items-center justify-center gap-0.5">
                      <Percent className="h-3 w-3" />
                      Taxa ({item.commissionRate}%)
                    </p>
                    <p className="font-medium text-orange-600">-R$ {item.platformFee.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground mb-0.5">Líquido</p>
                    <p className="font-bold text-green-600">+R$ {item.netAmount.toFixed(2)}</p>
                  </div>
                </div>
                
                {/* Footer: Date, Distance */}
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{format(item.completedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  <div className="flex items-center gap-2">
                    {item.distanceKm && (
                      <span className="flex items-center gap-1">
                        <Route className="h-3 w-3" />
                        {item.distanceKm.toFixed(1)} km
                      </span>
                    )}
                    {item.durationMinutes && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {item.durationMinutes} min
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="text-xs"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="text-xs"
            >
              Próxima
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
