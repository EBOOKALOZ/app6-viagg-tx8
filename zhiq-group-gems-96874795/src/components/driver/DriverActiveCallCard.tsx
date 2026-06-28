import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  MapPin, Navigation, DollarSign, Check, X, Loader2, 
  Clock, Package, Users, Phone
} from 'lucide-react';
import { IncomingCall, IncomingDeliveryCall, IncomingRideCall } from '@/hooks/useRealtimeCalls';
import { cn } from '@/lib/utils';

interface DriverActiveCallCardProps {
  call: IncomingCall;
  onAccept: (callId: string) => Promise<void>;
  onReject: (callId: string) => void;
  isAccepting?: boolean;
}

export function DriverActiveCallCard({
  call,
  onAccept,
  onReject,
  isAccepting = false,
}: DriverActiveCallCardProps) {
  const [isRejecting, setIsRejecting] = useState(false);

  const isDelivery = call.type === 'delivery';
  const deliveryCall = call as IncomingDeliveryCall;
  const rideCall = call as IncomingRideCall;

  const handleAccept = async () => {
    await onAccept(call.id);
  };

  const handleReject = () => {
    setIsRejecting(true);
    onReject(call.id);
    setIsRejecting(false);
  };

  const customerName = isDelivery ? deliveryCall.customer_name : 'Passageiro';
  const customerInitials = customerName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <Card className={cn(
      "border-2 animate-pulse-slow shadow-lg",
      isDelivery ? "border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20" : "border-primary/50 bg-primary/5"
    )}>
      <CardContent className="p-4 space-y-4">
        {/* Header with badge */}
        <div className="flex items-center justify-between">
          <Badge 
            variant="secondary" 
            className={cn(
              "px-3 py-1 font-medium",
              isDelivery 
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                : "bg-primary/10 text-primary"
            )}
          >
            {isDelivery ? (
              <>
                <Package className="h-3.5 w-3.5 mr-1.5" />
                Entrega Pendente
              </>
            ) : (
              <>
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Corrida Pendente
              </>
            )}
          </Badge>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span className="text-sm">Aguardando aceite</span>
          </div>
        </div>

        {/* Customer/Passenger info */}
        <div className="flex items-center gap-4 p-3 rounded-lg bg-background/80 border border-border">
          <Avatar className="h-14 w-14 border-2 border-muted">
            <AvatarImage src="" alt={customerName} />
            <AvatarFallback className="text-lg font-semibold bg-muted">
              {customerInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-lg truncate">{customerName}</p>
            {isDelivery && deliveryCall.customer_phone && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {deliveryCall.customer_phone}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-yellow-500">★★★★★</span>
              <span className="text-sm text-muted-foreground">5.0</span>
            </div>
          </div>
        </div>

        {/* Locations */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-green-500/10 p-2 shrink-0">
              <MapPin className="h-4 w-4 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                {isDelivery ? 'Coleta' : 'Embarque'}
              </p>
              <p className="text-sm font-medium">
                {isDelivery ? deliveryCall.pickup_location : rideCall.pickup_location}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-red-500/10 p-2 shrink-0">
              <Navigation className="h-4 w-4 text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Destino</p>
              <p className="text-sm font-medium">
                {isDelivery ? deliveryCall.destination : rideCall.destination}
              </p>
            </div>
          </div>
        </div>

        {/* Order Description (delivery only) */}
        {isDelivery && deliveryCall.order_description && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground mb-1 font-medium">Descrição do pedido</p>
            <p className="text-sm">{deliveryCall.order_description}</p>
          </div>
        )}

        {/* Value and Vehicle Type */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-primary/10">
          <div className="flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            <span className="text-2xl font-bold text-primary">
              R$ {(isDelivery ? deliveryCall.estimated_value : rideCall.estimated_value || 0).toFixed(2)}
            </span>
          </div>
          {isDelivery && (
            <Badge variant="secondary" className="text-sm">
              {deliveryCall.vehicle_type === 'moto' ? '🏍️ Moto' : '🚗 Carro'}
            </Badge>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            className="flex-1 h-12 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={handleReject}
            disabled={isAccepting || isRejecting}
          >
            {isRejecting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <X className="h-5 w-5 mr-2" />
                Recusar
              </>
            )}
          </Button>
          <Button
            className="flex-1 h-12"
            onClick={handleAccept}
            disabled={isAccepting || isRejecting}
          >
            {isAccepting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Check className="h-5 w-5 mr-2" />
                Aceitar
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default DriverActiveCallCard;
