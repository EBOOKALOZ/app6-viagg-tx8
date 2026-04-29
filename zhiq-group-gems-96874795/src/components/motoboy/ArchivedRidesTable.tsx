import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Archive, MapPin, Clock, Route, ChevronLeft, ChevronRight, Store, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ArchivedRide } from '@/hooks/useArchivedRides';

interface ArchivedRidesTableProps {
  rides: ArchivedRide[];
  statusFilter: string;
  onStatusFilterChange: (f: 'todos' | 'finalizada' | 'cancelada') => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
}

const statusFilters = [
  { value: 'todos', label: 'Todos' },
  { value: 'finalizada', label: 'Concluídas' },
  { value: 'cancelada', label: 'Canceladas' },
] as const;

export function ArchivedRidesTable({
  rides,
  statusFilter,
  onStatusFilterChange,
  currentPage,
  totalPages,
  onPageChange,
  isLoading,
}: ArchivedRidesTableProps) {
  return (
    <div className="space-y-3">
      {/* Status Filter */}
      <div className="flex gap-2">
        {statusFilters.map((f) => (
          <Button
            key={f.value}
            variant={statusFilter === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => onStatusFilterChange(f.value)}
            className="text-xs"
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Archive className="h-4 w-4 text-muted-foreground" />
            Registros
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : rides.length === 0 ? (
            <div className="py-10 text-center">
              <Archive className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum registro encontrado</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <div className="divide-y">
                {rides.map((ride) => (
                  <div key={ride.id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Store & Client */}
                        <div className="flex items-center gap-2 mb-1">
                          {ride.loja_nome && (
                            <span className="flex items-center gap-1 text-sm font-medium truncate">
                              <Store className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              {ride.loja_nome}
                            </span>
                          )}
                          <Badge
                            variant={ride.status === 'finalizada' ? 'default' : 'destructive'}
                            className="text-xs flex-shrink-0"
                          >
                            {ride.status === 'finalizada' ? 'Concluída' : 'Cancelada'}
                          </Badge>
                        </div>

                        {/* Client */}
                        {ride.cliente_nome && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                            <User className="h-3 w-3" />
                            {ride.cliente_nome}
                          </p>
                        )}

                        {/* Route */}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{ride.pickup_location}</span>
                          <span>→</span>
                          <span className="truncate">{ride.destination}</span>
                        </div>

                        {/* Meta */}
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {ride.finalizada_em
                              ? format(new Date(ride.finalizada_em), "dd/MM/yy 'às' HH:mm", { locale: ptBR })
                              : '—'}
                          </span>
                          {ride.distance_km && Number(ride.distance_km) > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Route className="h-3 w-3" />
                              {Number(ride.distance_km).toFixed(1)} km
                            </span>
                          )}
                          {ride.duration_minutes && Number(ride.duration_minutes) > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {ride.duration_minutes} min
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Value */}
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-sm text-primary">
                          R$ {Number(ride.valor_liquido).toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">líquido</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            Próxima
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
