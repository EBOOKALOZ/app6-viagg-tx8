import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { 
  Phone, MapPin, Navigation, User, Package, 
  Check, X, Loader2, Clock,
  Users, Route, Shield, Gauge, Store
} from 'lucide-react';
import { IncomingCall, IncomingDeliveryCall, IncomingRideCall } from '@/hooks/useRealtimeCalls';
import { cn } from '@/lib/utils';
import { StoreMiniHeader } from '@/components/merchant/StoreMiniHeader';
import { calculateDistanceKm, calculateEstimatedTimeMinutes, formatDistance, formatEstimatedTime } from '@/lib/deliveryPricing';

// Velocidades médias por tipo de via (km/h)
const SPEED_URBAN = 35;
const SPEED_RURAL = 45;
const SPEED_HIGHWAY = 65;
const SPEED_FALLBACK = 40;

/**
 * Calcula tempo estimado baseado no tipo de via predominante
 */
function calculateDynamicTime(distanceKm: number | null | undefined): { 
  timeMin: number; 
  speedKmh: number; 
  roadType: string;
} {
  if (!distanceKm || distanceKm <= 0) {
    return { timeMin: 0, speedKmh: SPEED_FALLBACK, roadType: 'Misto' };
  }
  
  // Heurística simples: distância determina tipo de via predominante
  let speedKmh: number;
  let roadType: string;
  
  if (distanceKm <= 5) {
    // Curta distância = urbano
    speedKmh = SPEED_URBAN;
    roadType = 'Urbano';
  } else if (distanceKm <= 20) {
    // Média distância = misto (média entre urbano e rural)
    speedKmh = SPEED_FALLBACK;
    roadType = 'Misto';
  } else if (distanceKm <= 50) {
    // Longa distância = rural
    speedKmh = SPEED_RURAL;
    roadType = 'Rural';
  } else {
    // Muito longa = rodovia
    speedKmh = SPEED_HIGHWAY;
    roadType = 'Rodovia';
  }
  
  const timeMin = Math.ceil((distanceKm / speedKmh) * 60);
  
  return { timeMin, speedKmh, roadType };
}

interface IncomingCallModalProps {
  call: IncomingCall | null;
  isOpen: boolean;
  onAccept: (callId: string) => Promise<void>;
  onReject: (callId: string) => void;
  onExpire?: (callId: string) => void;
  /** Countdown duration in seconds (default: 15) */
  countdownSeconds?: number;
  /** Whether accepting is in progress */
  isAccepting?: boolean;
}

export function IncomingCallModal({
  call,
  isOpen,
  onAccept,
  onReject,
  onExpire,
  countdownSeconds = 15,
  isAccepting = false,
}: IncomingCallModalProps) {
  const [countdown, setCountdown] = useState(countdownSeconds);
  const [isRejecting, setIsRejecting] = useState(false);
  const hasExpiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  const callIdRef = useRef(call?.id);

  // Keep refs updated
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    callIdRef.current = call?.id;
  }, [call?.id]);

  // Reset countdown and expired flag when call changes
  useEffect(() => {
    if (call) {
      setCountdown(countdownSeconds);
      hasExpiredRef.current = false;
    }
  }, [call?.id, countdownSeconds]);

  // Countdown timer - completely independent
  useEffect(() => {
    if (!isOpen || !call || isAccepting) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, call?.id, isAccepting]);

  // Handle expiration - uses refs to avoid dependency issues
  useEffect(() => {
    if (countdown === 0 && callIdRef.current && isOpen && !hasExpiredRef.current) {
      console.log('[IncomingCallModal] Expirando chamada:', callIdRef.current);
      hasExpiredRef.current = true;
      onExpireRef.current?.(callIdRef.current);
    }
  }, [countdown, isOpen]);

  const handleAccept = useCallback(async () => {
    if (!call) return;
    await onAccept(call.id);
  }, [call, onAccept]);

  const handleReject = useCallback(() => {
    if (!call) return;
    setIsRejecting(true);
    onReject(call.id);
    setIsRejecting(false);
  }, [call, onReject]);

  const isDelivery = call?.type === 'delivery';
  const deliveryCall = call as IncomingDeliveryCall;
  const rideCall = call as IncomingRideCall;

  // Calcular tempo dinâmico baseado no tipo de via (hook antes do early return)
  const dynamicRoute = useMemo(() => {
    if (!isDelivery && rideCall?.distance_km) {
      return calculateDynamicTime(rideCall.distance_km);
    }
    return null;
  }, [isDelivery, rideCall?.distance_km]);
  
  // Tempo desde a solicitação (hook antes do early return)
  const requestedAgo = useMemo(() => {
    if (!call?.created_at) return '0s';
    const created = new Date(call.created_at);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - created.getTime()) / 1000);
    if (diffSeconds < 60) return `${diffSeconds}s`;
    return `${Math.floor(diffSeconds / 60)}min`;
  }, [call?.created_at]);

  if (!call) return null;

  const progressPercent = (countdown / countdownSeconds) * 100;
  const isUrgent = countdown <= 5;

  return createPortal(
    <div 
      className="fixed inset-0 flex items-center justify-center p-3 bg-black/90"
      style={{ 
        zIndex: 2147483647, // Máximo z-index possível
        touchAction: 'none', // Bloqueia gestos de navegação
        userSelect: 'none',
      }}
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()} // Impede cliques passarem
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-[420px] mx-auto bg-background rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Animated Header */}
        <div 
          className={cn(
            "relative p-6 text-center transition-colors duration-300",
            isDelivery 
              ? "bg-gradient-to-br from-orange-500 to-orange-600" 
              : "bg-gradient-to-br from-primary to-primary/80"
          )}
        >
          {/* Pulse animation */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={cn(
              "w-24 h-24 rounded-full animate-ping opacity-20",
              isDelivery ? "bg-orange-300" : "bg-primary-foreground"
            )} />
          </div>

          {/* Icon */}
          <div className="relative z-10 mx-auto w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-4 animate-bounce">
            {isDelivery ? (
              <Package className="h-8 w-8 text-white" />
            ) : (
              <Users className="h-8 w-8 text-white" />
            )}
          </div>

          {/* Title */}
          <h2 className="relative z-10 text-xl font-bold text-white mb-1">
            {isDelivery ? 'Nova Entrega!' : 'Nova Corrida!'}
          </h2>
          <p className="relative z-10 text-white/80 text-sm">
            {isDelivery ? 'Chamada de entrega recebida' : 'Passageiro solicitando corrida'}
          </p>
        </div>

        {/* Countdown Progress Bar */}
        <div className="h-1.5 bg-muted relative overflow-hidden">
          <div 
            className={cn(
              "h-full transition-all duration-1000 ease-linear",
              isUrgent ? "bg-destructive" : isDelivery ? "bg-orange-500" : "bg-primary"
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Timer */}
          <div className="flex items-center justify-center gap-2">
            <Clock className={cn("h-4 w-4", isUrgent ? "text-destructive" : "text-muted-foreground")} />
            <span className={cn(
              "font-mono text-lg font-bold",
              isUrgent ? "text-destructive animate-pulse" : "text-foreground"
            )}>
              {countdown}s
            </span>
          </div>

          {/* Passenger Info Card (rides) */}
          {!isDelivery && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar className="h-12 w-12 shrink-0 ring-2 ring-primary/20">
                {rideCall.passenger_avatar_url ? (
                  <AvatarImage src={rideCall.passenger_avatar_url} alt="Passageiro" />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary font-medium">
                  {rideCall.passenger_name?.charAt(0).toUpperCase() || <User className="h-5 w-5" />}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{rideCall.passenger_name || 'Passageiro'}</p>
                <p className="text-xs text-muted-foreground">
                  Solicitado há {requestedAgo}
                </p>
              </div>
            </div>
          )}

          {/* Store Info (deliveries) */}
          {isDelivery && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <StoreMiniHeader
                storeName={deliveryCall.store_name || 'Loja'}
                logoUrl={deliveryCall.store_logo_url}
                size="md"
              />
              {deliveryCall.customer_name && (
                <p className="text-sm text-muted-foreground ml-auto shrink-0">
                  Cliente: {deliveryCall.customer_name}
                </p>
              )}
            </div>
          )}
          
          {/* Route Metrics (rides only) */}
          {!isDelivery && dynamicRoute && rideCall.distance_km && (
            <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-muted/30 border border-border">
              <div className="text-center">
                <Route className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-sm font-bold">{rideCall.distance_km.toFixed(1)} km</p>
                <p className="text-xs text-muted-foreground">Distância</p>
              </div>
              <div className="text-center">
                <Clock className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-sm font-bold">{dynamicRoute.timeMin} min</p>
                <p className="text-xs text-muted-foreground">Tempo</p>
              </div>
              <div className="text-center">
                <Gauge className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-sm font-bold">{dynamicRoute.speedKmh} km/h</p>
                <p className="text-xs text-muted-foreground">{dynamicRoute.roadType}</p>
              </div>
            </div>
          )}

          {/* Locations */}
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-green-500/10 p-1.5 shrink-0">
                <MapPin className="h-4 w-4 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">
                  {isDelivery ? 'Coleta' : 'Embarque'}
                </p>
                <p className="text-sm font-medium line-clamp-2">
                  {isDelivery ? deliveryCall.pickup_location : rideCall.pickup_location}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-red-500/10 p-1.5 shrink-0">
                <Navigation className="h-4 w-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Destino</p>
                <p className="text-sm font-medium line-clamp-2">
                  {isDelivery ? deliveryCall.destination : rideCall.destination}
                </p>
              </div>
            </div>

            {/* Número de passageiros (apenas para serviço Carro/Motorista) */}
            {!isDelivery && rideCall.passenger_count && rideCall.passenger_count > 0 && (
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-primary/10 p-1.5 shrink-0">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Passageiros</p>
                  <p className="text-sm font-medium">
                    {rideCall.passenger_count} {rideCall.passenger_count === 1 ? 'passageiro' : 'passageiros'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Order Description (delivery only) */}
          {isDelivery && deliveryCall.order_description && (
            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <p className="text-xs text-muted-foreground mb-1">Descrição</p>
              <p className="text-sm line-clamp-2">{deliveryCall.order_description}</p>
            </div>
          )}

          {/* Route Metrics for Delivery */}
          {isDelivery && (() => {
            const distanceKm = deliveryCall.distancia_km || (
              deliveryCall.pickup_lat && deliveryCall.pickup_lng && 
              deliveryCall.destination_lat && deliveryCall.destination_lng
                ? calculateDistanceKm(
                    deliveryCall.pickup_lat, 
                    deliveryCall.pickup_lng, 
                    deliveryCall.destination_lat, 
                    deliveryCall.destination_lng
                  )
                : null
            );
            const estimatedTime = distanceKm ? calculateEstimatedTimeMinutes(distanceKm) : null;
            
            return distanceKm ? (
              <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-muted/30 border border-border">
                <div className="text-center">
                  <Route className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-sm font-bold">{formatDistance(distanceKm)}</p>
                  <p className="text-xs text-muted-foreground">Distância</p>
                </div>
                <div className="text-center">
                  <Clock className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-sm font-bold">{estimatedTime ? formatEstimatedTime(estimatedTime) : '~10 min'}</p>
                  <p className="text-xs text-muted-foreground">Tempo estimado</p>
                </div>
              </div>
            ) : null;
          })()}

          {/* Painel de valor garantido */}
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 space-y-2">
            {/* Valor que o motoboy vai receber */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Você vai receber:</span>
              <span className="text-xl font-bold text-primary">
                R$ {(isDelivery ? deliveryCall.estimated_value : rideCall.estimated_value || 0).toFixed(2).replace('.', ',')}
              </span>
            </div>
            
            {/* Badge de pagamento garantido */}
            <div className="flex items-center justify-center gap-1 pt-1">
              <Shield className="h-4 w-4 text-green-600" />
              <span className="text-xs font-medium text-green-600">Pagamento garantido</span>
            </div>
          </div>

          {/* Vehicle Type Badge (delivery only) */}
          {isDelivery && (
            <div className="flex justify-center">
              <Badge variant="secondary">
                {deliveryCall.vehicle_type === 'moto' ? '🏍️ Moto' : '🚗 Carro'}
              </Badge>
            </div>
          )}
        </div>

        {/* Action Buttons - grid 2 colunas para 360px */}
        <div className="p-4 pt-0 grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="w-full h-14 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground font-semibold"
            onClick={handleReject}
            disabled={isAccepting || isRejecting}
          >
            {isRejecting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <X className="h-5 w-5 mr-2 shrink-0" />
                <span className="truncate">RECUSAR</span>
              </>
            )}
          </Button>
          <Button
            className="w-full h-14 font-semibold text-base"
            onClick={handleAccept}
            disabled={isAccepting || isRejecting || countdown === 0}
          >
            {isAccepting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Check className="h-5 w-5 mr-2 shrink-0" />
                <span className="truncate">ACEITAR OFERTA</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default IncomingCallModal;
