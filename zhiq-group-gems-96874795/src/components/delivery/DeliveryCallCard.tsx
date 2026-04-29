import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Package, MapPin, Navigation, User, Phone, 
  Check, X, Loader2, Clock, FileText, Route, Shield
} from 'lucide-react';
import { formatDistance, formatEstimatedTime, calculateDistanceKm, calculateEstimatedTimeMinutes } from '@/lib/deliveryPricing';

export interface DeliveryCallData {
  id: string;
  customer_name: string;
  customer_phone?: string;
  pickup_location: string;
  destination: string;
  estimated_value: number;
  order_description?: string;
  vehicle_type: 'moto' | 'carro';
  created_at: Date;
  pickup_lat?: number;
  pickup_lng?: number;
  destination_lat?: number;
  destination_lng?: number;
}

interface DeliveryCallCardProps {
  call: DeliveryCallData;
  onAccept: (callId: string) => Promise<void>;
  onReject: (callId: string) => Promise<void>;
  isProcessing: boolean;
  hasActiveDelivery: boolean;
}

export function DeliveryCallCard({ 
  call, 
  onAccept, 
  onReject, 
  isProcessing,
  hasActiveDelivery 
}: DeliveryCallCardProps) {
  const [action, setAction] = useState<'accept' | 'reject' | null>(null);

  const handleAccept = async () => {
    setAction('accept');
    await onAccept(call.id);
    setAction(null);
  };

  const handleReject = async () => {
    setAction('reject');
    await onReject(call.id);
    setAction(null);
  };

  const minutesAgo = Math.floor((Date.now() - call.created_at.getTime()) / 60000);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-r from-orange-500/10 to-transparent">
        <div className="flex items-center justify-between">
          <Badge className="bg-orange-500 text-white">
            <Package className="h-3 w-3 mr-1" />
            Nova Entrega
          </Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Há {minutesAgo} min
          </span>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4 pt-4">
        {/* Customer Info */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <div className="rounded-full bg-primary/10 p-2">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium">{call.customer_name}</p>
            {call.customer_phone && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {call.customer_phone}
              </p>
            )}
          </div>
        </div>

        {/* Locations */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-green-500/10 p-1.5">
              <MapPin className="h-4 w-4 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Coleta</p>
              <p className="text-sm font-medium">{call.pickup_location}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-red-500/10 p-1.5">
              <Navigation className="h-4 w-4 text-red-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Entrega</p>
              <p className="text-sm font-medium">{call.destination}</p>
            </div>
          </div>
        </div>

        {/* Order Description */}
        {call.order_description && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
            <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Descrição do pedido</p>
              <p className="text-sm">{call.order_description}</p>
            </div>
          </div>
        )}

        {/* Painel de valor garantido */}
        {(() => {
          const distanceKm = (call.pickup_lat && call.pickup_lng && call.destination_lat && call.destination_lng)
            ? calculateDistanceKm(call.pickup_lat, call.pickup_lng, call.destination_lat, call.destination_lng)
            : null;
          const estimatedTime = distanceKm ? calculateEstimatedTimeMinutes(distanceKm) : null;
          
          return (
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 space-y-2">
              {/* Valor que o motoboy vai receber */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Você vai receber:</span>
                <span className="text-2xl font-bold text-primary">
                  R$ {call.estimated_value.toFixed(2).replace('.', ',')}
                </span>
              </div>
              
              {/* Distância e Tempo */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Route className="h-4 w-4" />
                  <span>Distância:</span>
                </div>
                <span className="font-medium">
                  {distanceKm ? formatDistance(distanceKm) : 'Calculando...'}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>Tempo estimado:</span>
                </div>
                <span className="font-medium">
                  {estimatedTime ? formatEstimatedTime(estimatedTime) : '~10 min'}
                </span>
              </div>
              
              {/* Badge de pagamento garantido */}
              <div className="flex items-center justify-center gap-1 pt-1">
                <Shield className="h-4 w-4 text-green-600" />
                <span className="text-xs font-medium text-green-600">Pagamento garantido</span>
              </div>
            </div>
          );
        })()}

        {/* Blocked Warning */}
        {hasActiveDelivery && (
          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              Você já possui uma entrega ativa. Complete-a para aceitar novas.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            className="flex-1 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={handleReject}
            disabled={isProcessing}
          >
            {isProcessing && action === 'reject' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <X className="h-4 w-4 mr-2" />
                Recusar
              </>
            )}
          </Button>
          <Button
            className="flex-1"
            onClick={handleAccept}
            disabled={isProcessing || hasActiveDelivery}
          >
            {isProcessing && action === 'accept' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Aceitar
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
