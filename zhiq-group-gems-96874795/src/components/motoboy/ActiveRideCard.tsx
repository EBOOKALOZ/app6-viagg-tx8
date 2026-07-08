import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PaymentCountdown } from '@/components/rides/PaymentCountdown';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { MapPin, Navigation, User, Loader2, X, Play, CheckCircle, Clock, Route, Star, Phone } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SimpleMap, MapMarker } from '@/components/map';
import { RideRouteData } from '@/hooks/useRideRoute';
import { MotoTaxiRide, PassengerInfo } from '@/hooks/useMotoTaxiRides';

interface ActiveRideCardProps {
  ride: MotoTaxiRide;
  passengerInfo?: PassengerInfo | null;
  isLoadingPassenger?: boolean;
  onStart: () => Promise<boolean>;
  onComplete: () => Promise<boolean>;
  onCancel: () => Promise<boolean>;
  routeData?: RideRouteData | null;
  isCalculatingRoute?: boolean;
  motoboyPosition?: { lat: number; lng: number } | null;
  /** Hide the inline mini-map (used when a large map is already shown in the layout) */
  hideMap?: boolean;
}

export default function ActiveRideCard({ 
  ride, 
  passengerInfo,
  isLoadingPassenger,
  onStart, 
  onComplete, 
  onCancel,
  routeData,
  isCalculatingRoute,
  motoboyPosition,
  hideMap = false,
}: ActiveRideCardProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);

  // ── Gate de pagamento (contador de 3 min) ────────────────────────────────
  // Moto-táxi vive em service_orders. Lê driver_status/payment_status ao vivo;
  // enquanto waiting_payment, bloqueia iniciar/finalizar e mostra o contador.
  // Corridas legadas (driver_status null) passam direto.
  const [paymentCleared, setPaymentCleared] = useState(false);
  const [payState, setPayState] = useState<{ driver_status: string | null; payment_status: string | null }>(
    { driver_status: null, payment_status: null },
  );
  useEffect(() => {
    let alive = true;
    supabase.from('service_orders').select('driver_status,payment_status').eq('id', ride.id).single()
      .then(({ data }) => { if (alive && data) setPayState(data as { driver_status: string | null; payment_status: string | null }); });
    const ch = supabase
      .channel(`arc-pay-${ride.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'service_orders', filter: `id=eq.${ride.id}` },
        (p) => setPayState({
          driver_status: (p.new as { driver_status: string | null }).driver_status,
          payment_status: (p.new as { payment_status: string | null }).payment_status,
        }))
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [ride.id]);
  const isWaitingPayment = payState.driver_status === 'waiting_payment' && payState.payment_status !== 'paid';

  const handleStart = async () => {
    setIsLoading('start');
    await onStart();
    setIsLoading(null);
  };

  const handleComplete = async () => {
    setIsLoading('complete');
    await onComplete();
    setIsLoading(null);
  };

  const handleCancel = async () => {
    setIsLoading('cancel');
    await onCancel();
    setIsLoading(null);
  };

  const getStatusBadge = () => {
    switch (ride.status) {
      case 'aceita':
      case 'a_caminho':
        return <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30">Aceita - Buscar passageiro</Badge>;
      case 'em_andamento':
        return <Badge variant="outline" className="bg-accent/20 text-accent-foreground border-accent/30">Em andamento</Badge>;
      default:
        return <Badge variant="secondary">{ride.status}</Badge>;
    }
  };

  const timeAgo = formatDistanceToNow(new Date(ride.created_at), { 
    addSuffix: true, 
    locale: ptBR 
  });

  // CORREÇÃO: Separar localização do motorista das coordenadas da corrida
  // Mostrar marcador do motorista APENAS quando a corrida está em andamento (GPS ativo)
  const isRideInProgress = ride.status === 'em_andamento';
  const isWaitingToStart = ride.status === 'aceita' || ride.status === 'a_caminho';
  
  // Construir marcadores para o mapa
  const markers: MapMarker[] = [];
  
  // Marcador do moto-táxi - APENAS durante corrida em andamento
  // Antes de iniciar, não mostrar posição GPS para evitar conflito com dados da corrida
  if (isRideInProgress && motoboyPosition) {
    markers.push({
      id: 'motoboy',
      lat: motoboyPosition.lat,
      lng: motoboyPosition.lng,
      type: 'motoboy',
      label: 'Você',
    });
  }
  
  // Marcador do ponto de embarque - SEMPRE baseado nos dados da corrida do banco
  if (ride.origin_lat && ride.origin_lng) {
    markers.push({
      id: 'pickup',
      lat: ride.origin_lat,
      lng: ride.origin_lng,
      type: isWaitingToStart ? 'origin' : 'origin', // Sempre origin quando é ponto de partida
      label: 'Embarque',
    });
  }
  
  // CORREÇÃO: Marcador do destino - MOSTRAR SEMPRE que temos coordenadas
  // Antes de iniciar: mostrar origem + destino para exibir rota completa
  // Durante corrida: mostrar motoboy + destino
  if (ride.destination_lat && ride.destination_lng) {
    markers.push({
      id: 'destination',
      lat: ride.destination_lat,
      lng: ride.destination_lng,
      type: 'destination',
      label: 'Destino',
    });
  }

  // Determinar fase da rota para o mapa
  // CORREÇÃO: Antes de iniciar = mostrar rota origem→destino
  // Durante corrida = mostrar rota motoboy→destino
  const routePhase = isWaitingToStart ? 'to_destination' : 'to_destination';
  
  // CORREÇÃO: Centro do mapa SEMPRE usa coordenadas da corrida do banco
  // Antes de iniciar: centro entre origem e destino (usar origem como referência)
  // Durante corrida: centro no destino
  const mapCenter = ride.origin_lat && ride.origin_lng
    ? { lat: ride.origin_lat, lng: ride.origin_lng }
    : ride.destination_lat && ride.destination_lng
      ? { lat: ride.destination_lat, lng: ride.destination_lng }
      : undefined;
  
  // CORREÇÃO CRÍTICA: Preço SEMPRE vem do banco, NUNCA recalculado
  // O preço é definido na criação da corrida e deve permanecer imutável
  const displayValue = ride.estimated_price || 0;

  return (
    <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Corrida de Passageiro
          </CardTitle>
          {getStatusBadge()}
        </div>
        <p className="text-xs text-muted-foreground">{timeAgo}</p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Card do Passageiro */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
          {isLoadingPassenger ? (
            <div className="flex items-center gap-3 w-full">
              <div className="w-12 h-12 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                <div className="h-3 w-16 bg-muted rounded animate-pulse" />
              </div>
            </div>
          ) : (
            <>
              <Avatar className="w-12 h-12 border-2 border-primary/20 shadow-md">
                <AvatarImage src={passengerInfo?.avatarUrl} alt={passengerInfo?.name || 'Passageiro'} />
                <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white font-bold text-lg">
                  {passengerInfo?.name?.charAt(0)?.toUpperCase() || 'P'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">
                  {passengerInfo?.name || 'Passageiro'}
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {passengerInfo?.rating && (
                    <span className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-zhiq-gold text-zhiq-gold" />
                      {passengerInfo.rating.toFixed(1)}
                    </span>
                  )}
                  <span className="text-xs">{timeAgo}</span>
                </div>
              </div>
              {passengerInfo?.phone && (
                <a 
                  href={`tel:${passengerInfo.phone}`}
                  className="p-2 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  <Phone className="h-4 w-4" />
                </a>
              )}
            </>
          )}
        </div>

        {/* Mini-mapa com rota (hidden when parent shows large map) */}
        {!hideMap && mapCenter && markers.length > 0 && (
          <div className="h-48 lg:h-56 rounded-lg overflow-hidden border border-border/50">
            <SimpleMap
              markers={markers}
              center={mapCenter}
              zoom={14}
              showRoute={true}
              useRealRoute={true}
              routePhase={routePhase}
              className="w-full h-full"
            />
          </div>
        )}
        
        {/* Dados de rota: KM, Tempo, Preço */}
        {/* CORREÇÃO: Priorizar dados do banco (imutáveis) sobre dados calculados dinamicamente */}
        <div className="grid grid-cols-3 gap-2">
          {/* Distância - usar estimated_km do banco ou routeData como fallback */}
          <div className="flex flex-col items-center p-2 rounded-lg bg-muted/50 border border-border/30">
            <Route className="h-4 w-4 text-primary mb-1" />
            <span className="text-xs text-muted-foreground">Distância</span>
            {isCalculatingRoute && !ride.estimated_km ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <span className="text-sm font-bold text-foreground">
                {ride.estimated_km 
                  ? `${ride.estimated_km} km` 
                  : routeData?.distanceKm 
                    ? `${routeData.distanceKm} km` 
                    : '--'}
              </span>
            )}
          </div>
          
          {/* Tempo - usar estimated_time_minutes do banco ou routeData como fallback */}
          <div className="flex flex-col items-center p-2 rounded-lg bg-muted/50 border border-border/30">
            <Clock className="h-4 w-4 text-primary mb-1" />
            <span className="text-xs text-muted-foreground">Tempo</span>
            {isCalculatingRoute && !ride.estimated_time_minutes ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <span className="text-sm font-bold text-foreground">
                {ride.estimated_time_minutes 
                  ? `${ride.estimated_time_minutes} min` 
                  : routeData?.durationMin 
                    ? `${routeData.durationMin} min` 
                    : '--'}
              </span>
            )}
          </div>
          
          {/* Valor - SEMPRE do banco, NUNCA recalculado */}
          <div className="flex flex-col items-center p-2 rounded-lg bg-primary/10 border border-primary/30">
            <span className="text-xs text-muted-foreground mb-1">💰</span>
            <span className="text-xs text-muted-foreground">Valor</span>
            <span className="text-sm font-bold text-primary">
              R$ {displayValue.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Route Info */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-primary border-2 border-background shadow" />
              <div className="w-0.5 h-8 bg-muted-foreground/30" />
              <div className="w-3 h-3 rounded-full bg-destructive border-2 border-background shadow" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground font-medium">EMBARQUE</p>
                <p className="text-sm font-medium">{ride.origin_address}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">DESTINO</p>
                <p className="text-sm font-medium">{ride.destination_address}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Info Note - No code needed */}
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
          <p className="text-xs text-primary font-medium">
            ℹ️ Corrida de passageiro não exige código de confirmação
          </p>
        </div>

        {/* Actions — bloqueadas enquanto aguarda pagamento (contador 3 min) */}
        {isWaitingPayment && !paymentCleared ? (
          <PaymentCountdown
            orderId={ride.id}
            role="professional"
            category="mototaxi"
            table="service_orders"
            onStartNavigation={() => setPaymentCleared(true)}
            className="mt-2"
          />
        ) : (
        <div className="flex gap-2 pt-2">
          {(ride.status === 'aceita' || ride.status === 'a_caminho') && (
            <>
              <Button 
                onClick={handleStart}
                disabled={isLoading !== null}
                className="flex-1"
              >
                {isLoading === 'start' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Iniciar Corrida
              </Button>
              <Button 
                variant="outline" 
                onClick={handleCancel}
                disabled={isLoading !== null}
              >
                {isLoading === 'cancel' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </Button>
            </>
          )}

          {ride.status === 'em_andamento' && (
            <>
              <Button 
                onClick={handleComplete}
                disabled={isLoading !== null}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                {isLoading === 'complete' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Finalizar Corrida
              </Button>
              <Button 
                variant="outline" 
                onClick={handleCancel}
                disabled={isLoading !== null}
              >
                {isLoading === 'cancel' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </Button>
            </>
          )}
        </div>
        )}
      </CardContent>
    </Card>
  );
}