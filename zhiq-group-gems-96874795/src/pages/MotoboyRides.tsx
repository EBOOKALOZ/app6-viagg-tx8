import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Package, RefreshCw, History } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { UserAvatar } from '@/components/UserAvatar';
import { useMotoTaxiRides } from '@/hooks/useMotoTaxiRides';
import { useDeliveryOrder } from '@/hooks/useDeliveryOrder';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import PassengerToggle from '@/components/motoboy/PassengerToggle';
import ActiveRideCard from '@/components/motoboy/ActiveRideCard';
import { ActiveDeliveryCard } from '@/components/delivery/ActiveDeliveryCard';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { ActivityHistoryCard, HistoryItem } from '@/components/ActivityHistoryCard';
import { MotoboyDeliveryHistory } from '@/components/motoboy/MotoboyDeliveryHistory';

export default function MotoboyRides() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [completedRides, setCompletedRides] = useState<HistoryItem[]>([]);
  const [completedDeliveries, setCompletedDeliveries] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'rides' | 'deliveries'>('all');

  const {
    activeRide,
    hasActiveRide,
    isMotoTaxi,
    isLoading: ridesLoading,
    startRide,
    completeRide,
    cancelRide,
    refresh: refreshRides,
    // Dados de rota
    routeData,
    isCalculatingRoute,
    motoTaxiPosition,
  } = useMotoTaxiRides();

  // Estados locais para toggle de passageiros (buscar do motoboy_profiles)
  const [acceptsPassengers, setAcceptsPassengers] = useState(false);
  const [canAcceptPassengers, setCanAcceptPassengers] = useState(false);

  // Buscar configurações de aceitar passageiros
  useEffect(() => {
    const fetchPassengerSettings = async () => {
      if (!user?.id) return;
      
      const { data: profileData } = await supabase
        .from('motoboy_profiles')
        .select('accepts_passengers, tipo_transporte, capacidade_garupa')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileData) {
        setAcceptsPassengers(profileData.accepts_passengers || false);
        const hasGarupa = profileData.tipo_transporte === 'garupa' || 
                          profileData.tipo_transporte === 'bag_garupa';
        setCanAcceptPassengers(hasGarupa && !!profileData.capacidade_garupa);
      }
    };
    
    fetchPassengerSettings();
  }, [user?.id]);

  const toggleAcceptsPassengers = async (value: boolean) => {
    if (!user?.id) return;
    
    try {
      const { error } = await supabase
        .from('motoboy_profiles')
        .update({ accepts_passengers: value })
        .eq('user_id', user.id);

      if (error) throw error;
      setAcceptsPassengers(value);
    } catch (error) {
      console.error('Error updating passenger preference:', error);
    }
  };

  const {
    activeOrder,
    hasActiveDelivery,
    isLoading: deliveryLoading,
    isValidating,
    validateCode,
    validatePickupCode,
    cancelDelivery,
    refetch: refreshDelivery,
  } = useDeliveryOrder();

  // Buscar corridas e entregas finalizadas
  const fetchCompletedActivities = useCallback(async () => {
    if (!user?.id) return;
    
    setIsLoadingHistory(true);
    try {
      console.log('[MotoboyRides] Buscando histórico para user:', user.id);
      
      // Buscar corridas de moto-táxi finalizadas da tabela moto_taxi_corridas_legacy
      const { data: motoTaxiRidesData, error: motoTaxiError } = await (supabase
        .from('moto_taxi_corridas_legacy' as any)
        .select('id, origin_address, destination_address, estimated_price, finished_at, created_at, status')
        .eq('moto_taxi_id', user.id)
        .in('status', ['finalizada', 'cancelada'])
        .order('created_at', { ascending: false })
        .limit(20) as any);
      
      console.log('[MotoboyRides] Corridas moto-táxi:', { 
        error: motoTaxiError, 
        count: motoTaxiRidesData?.length,
        data: motoTaxiRidesData 
      });
      
      if (motoTaxiError) {
        console.error('[MotoboyRides] Erro ao buscar corridas moto-táxi:', motoTaxiError);
      }
      
      const motoTaxiRides: HistoryItem[] = (motoTaxiRidesData || []).map((ride) => ({
        id: ride.id,
        type: 'ride' as const,
        origin: ride.origin_address,
        destination: ride.destination_address,
        value: Number(ride.estimated_price) || 0,
        completedAt: new Date(ride.finished_at || ride.created_at || new Date()),
      }));
      
      setCompletedRides(motoTaxiRides);

      // Buscar entregas finalizadas - status 'completed'
      const { data: deliveriesData, error: deliveriesError } = await supabase
        .from('service_orders')
        .select('id, pickup_location, destination, total_price, updated_at, customer_id, status')
        .eq('motoboy_id', user.id)
        .eq('service_type', 'delivery')
        .eq('status', 'completed')
        .order('updated_at', { ascending: false, nullsFirst: false })
        .limit(20);
      
      if (deliveriesError) {
        console.error('[MotoboyRides] Erro ao buscar entregas:', deliveriesError);
      }
      
      const deliveries: HistoryItem[] = (deliveriesData || []).map((delivery) => ({
        id: delivery.id,
        type: 'delivery' as const,
        origin: delivery.pickup_location,
        destination: delivery.destination,
        value: Number(delivery.total_price) || 0,
        completedAt: new Date(delivery.updated_at || new Date()),
        customerName: delivery.customer_id || 'Cliente',
      }));
      
      setCompletedDeliveries(deliveries);
    } catch (error) {
      console.error('[MotoboyRides] Erro ao buscar histórico:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchCompletedActivities();
  }, [fetchCompletedActivities]);

  const isLoading = ridesLoading || deliveryLoading;
  const hasActiveActivity = hasActiveRide || hasActiveDelivery;

  const handleRefresh = () => {
    refreshRides();
    refreshDelivery();
    fetchCompletedActivities();
  };

  // Filtrar histórico baseado no filtro selecionado
  const getFilteredHistory = (): HistoryItem[] => {
    let items: HistoryItem[] = [];
    
    if (historyFilter === 'rides') {
      items = completedRides;
    } else if (historyFilter === 'deliveries') {
      items = completedDeliveries;
    } else {
      items = [...completedRides, ...completedDeliveries];
    }
    
    // Ordenar por data mais recente
    return items.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  };

  const filteredHistory = getFilteredHistory();

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/motoboy')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Logo size="sm" />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleRefresh}>
              <RefreshCw className="h-5 w-5" />
            </Button>
            <UserAvatar size="sm" />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Minhas Atividades</h1>
          <div className="flex items-center gap-2">
            {hasActiveRide && (
              <Badge variant="outline" className="gap-1 border-primary text-primary">
                <Users className="h-3 w-3" />
                Corrida
              </Badge>
            )}
            {hasActiveDelivery && (
              <Badge variant="outline" className="gap-1 border-accent text-accent-foreground">
                <Package className="h-3 w-3" />
                Entrega
              </Badge>
            )}
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        )}

        {/* Passenger Toggle - Only show if no active activity */}
        {!isLoading && !hasActiveActivity && (
          <PassengerToggle
            acceptsPassengers={acceptsPassengers}
            canAcceptPassengers={canAcceptPassengers}
            onToggle={toggleAcceptsPassengers}
          />
        )}

        {/* Active Ride */}
        {!isLoading && activeRide && (
          <ActiveRideCard
            ride={activeRide}
            onStart={startRide}
            onComplete={completeRide}
            onCancel={cancelRide}
            routeData={routeData}
            isCalculatingRoute={isCalculatingRoute}
            motoboyPosition={motoTaxiPosition}
          />
        )}

        {/* Active Delivery */}
        {!isLoading && activeOrder && (
          <ActiveDeliveryCard
            order={activeOrder}
            onValidateCode={validateCode}
            onValidatePickup={validatePickupCode}
            onCancel={cancelDelivery}
            isValidating={isValidating}
          />
        )}

        {/* No Active Activity */}
        {!isLoading && !hasActiveActivity && (
          <EmptyState
            icon={Package}
            title="Nenhuma atividade ativa"
            description={
              acceptsPassengers 
                ? 'Aguardando corridas de passageiro ou entregas...'
                : 'Aguardando entregas... Ative "Aceitar passageiros" para receber corridas também.'
            }
          />
        )}

        {/* Filter Buttons - SEMPRE visíveis */}
        {!isLoading && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setHistoryFilter(historyFilter === 'rides' ? 'all' : 'rides')}
              className={`p-4 rounded-xl border-2 transition-all ${
                historyFilter === 'rides'
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-muted/30 hover:border-primary/50'
              }`}
            >
              <Users className={`h-5 w-5 mx-auto mb-2 ${historyFilter === 'rides' ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="text-xs text-muted-foreground">Corridas</p>
              <p className={`font-semibold text-sm ${historyFilter === 'rides' ? 'text-primary' : ''}`}>Sem código</p>
            </button>
            <button
              onClick={() => setHistoryFilter(historyFilter === 'deliveries' ? 'all' : 'deliveries')}
              className={`p-4 rounded-xl border-2 transition-all ${
                historyFilter === 'deliveries'
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-border bg-muted/30 hover:border-orange-500/50'
              }`}
            >
              <Package className={`h-5 w-5 mx-auto mb-2 ${historyFilter === 'deliveries' ? 'text-orange-500' : 'text-muted-foreground'}`} />
              <p className="text-xs text-muted-foreground">Entregas</p>
              <p className={`font-semibold text-sm ${historyFilter === 'deliveries' ? 'text-orange-500' : ''}`}>Com código</p>
            </button>
          </div>
        )}

        {/* Activity History - SEMPRE visível, independente de atividade ativa */}
        {!isLoading && (
          <>
            {isLoadingHistory ? (
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-32 w-full" />
                </CardContent>
              </Card>
            ) : (
              <ActivityHistoryCard 
                items={filteredHistory}
                title={
                  historyFilter === 'rides' 
                    ? 'Histórico de Corridas' 
                    : historyFilter === 'deliveries' 
                      ? 'Histórico de Entregas'
                      : 'Histórico Recente'
                }
                emptyMessage={
                  historyFilter === 'rides' 
                    ? 'Nenhuma corrida finalizada ainda' 
                    : historyFilter === 'deliveries' 
                      ? 'Nenhuma entrega finalizada ainda'
                      : 'Nenhuma atividade finalizada ainda'
                }
                maxItems={10}
              />
            )}
          </>
        )}

        {/* Histórico Completo de Entregas (com detalhes e rotas) */}
        {!isLoading && historyFilter !== 'rides' && (
          <MotoboyDeliveryHistory />
        )}
      </main>
    </div>
  );
}