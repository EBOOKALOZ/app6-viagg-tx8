import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Phone, Package, Users, Loader2, Check, X, MapPin } from 'lucide-react';
import { IncomingCall, IncomingDeliveryCall, IncomingRideCall } from '@/hooks/useRealtimeCalls';
import { useState, useEffect } from 'react';
import { SimpleMap, MapMarker } from '@/components/map';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getCityCoordinates } from '@/lib/cityCoordinates';
import { geocodeAddress } from '@/skills/maps/geocodeService';

interface MotoboyActiveCallCardProps {
  call: IncomingCall;
  onAccept: (callId: string) => Promise<void>;
  onReject: (callId: string) => void;
  isAccepting: boolean;
}

export default function MotoboyActiveCallCard({ 
  call, 
  onAccept, 
  onReject,
  isAccepting 
}: MotoboyActiveCallCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const { user } = useAuth();
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);

  const isDelivery = call.type === 'delivery';
  const deliveryCall = call as IncomingDeliveryCall;
  const rideCall = call as IncomingRideCall;

  // Obter localização EXCLUSIVAMENTE do cadastro do motoboy
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('motoboy_profiles')
      .select('cidade, bairro, estado')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (data?.cidade) {
          const coords = getCityCoordinates(data.cidade);
          if (coords) {
             setPosition(coords);
          } else {
             const addressQuery = [data.bairro, data.cidade, data.estado].filter(Boolean).join(', ');
             const geo = await geocodeAddress(addressQuery || 'Blumenau, SC');
             if (geo) setPosition(geo);
          }
        }
      });
  }, [user?.id]);

  // Verificar se tem coordenadas de origem para exibir mapa
  const hasPickupCoords = !isDelivery && rideCall.pickup_lat && rideCall.pickup_lng;
  const hasMotoboiLocation = position?.lat && position?.lng;
  
  // Criar marcadores para o mapa
  // Mostrar rota: posição atual do motoboy → ponto de embarque do passageiro
  const mapMarkers: MapMarker[] = [];
  
  if (hasPickupCoords) {
    // Se temos a posição do motoboy, mostrar rota motoboy → passageiro
    if (hasMotoboiLocation) {
      mapMarkers.push({
        id: 'motoboy',
        lat: position!.lat,
        lng: position!.lng,
        type: 'user', // Posição atual do motoboy
        label: 'Você',
      });
    }
    
    mapMarkers.push({
      id: 'pickup',
      lat: rideCall.pickup_lat!,
      lng: rideCall.pickup_lng!,
      type: 'origin',
      label: 'Passageiro',
    });
  }

  const handleAccept = async () => {
    setIsProcessing(true);
    await onAccept(call.id);
    setIsProcessing(false);
  };

  const handleReject = () => {
    onReject(call.id);
  };

  // CORREÇÃO A: Overlay fixo centralizado para mobile
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50">
      <Card className={`border-2 w-full max-w-[420px] mx-auto ${isDelivery ? 'border-orange-500/50 bg-orange-500/5' : 'border-primary/50 bg-primary/5'}`}>
      <CardHeader className="pb-3 px-3 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2 min-w-0">
            {isDelivery ? (
              <>
                <Package className="h-5 w-5 text-orange-500 flex-shrink-0" />
                <span className="truncate">Nova Entrega</span>
              </>
            ) : (
              <>
                <Users className="h-5 w-5 text-primary flex-shrink-0" />
                <span className="truncate">Nova Corrida</span>
              </>
            )}
          </CardTitle>
          <Badge variant="outline" className={`flex-shrink-0 text-xs ${isDelivery ? 'border-orange-500 text-orange-600' : 'border-primary text-primary'}`}>
            Aguardando
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3 px-3 sm:px-6">
        {/* Customer Info (delivery only) */}
        {isDelivery && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="rounded-full bg-primary/10 p-2 flex-shrink-0">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{deliveryCall.customer_name}</p>
              {deliveryCall.customer_phone && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{deliveryCall.customer_phone}</span>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Mini Mapa - mostra rota do motoboy até o passageiro */}
        {hasPickupCoords && mapMarkers.length > 0 && (
          <div className="rounded-lg overflow-hidden border border-border/50 h-40 lg:h-48">
            <SimpleMap
              markers={mapMarkers}
              center={hasMotoboiLocation 
                ? { lat: position!.lat, lng: position!.lng } 
                : { lat: rideCall.pickup_lat!, lng: rideCall.pickup_lng! }
              }
              zoom={13}
              showRoute={mapMarkers.length > 1}
              useRealRoute={true}
              routePhase="to_pickup"
            />
          </div>
        )}
        
        {/* Aviso se não houver coordenadas */}
        {!isDelivery && !hasPickupCoords && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <MapPin className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-600">Localização GPS não disponível</p>
          </div>
        )}

        {/* Route Info */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow" />
              <div className="w-0.5 h-8 bg-muted-foreground/30" />
              <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow" />
            </div>
            <div className="flex-1 space-y-3 min-w-0">
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  {isDelivery ? 'COLETA' : 'EMBARQUE'}
                </p>
                <p className="text-sm font-medium break-words">
                  {isDelivery ? deliveryCall.pickup_location : rideCall.pickup_location}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">DESTINO</p>
                <p className="text-sm font-medium break-words">
                  {isDelivery ? deliveryCall.destination : rideCall.destination}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Value */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 gap-2">
          <span className="text-sm text-muted-foreground">Valor estimado</span>
          <span className="text-lg font-bold text-primary flex-shrink-0">
            R$ {(isDelivery ? deliveryCall.estimated_value : rideCall.estimated_value || 0).toFixed(2)}
          </span>
        </div>

        {/* Order Description */}
        {isDelivery && deliveryCall.order_description && (
          <div className="p-3 rounded-lg bg-muted/30 border border-border">
            <p className="text-xs text-muted-foreground mb-1">Descrição</p>
            <p className="text-sm break-words">{deliveryCall.order_description}</p>
          </div>
        )}

        {/* CORREÇÃO A: Grid 2 colunas para garantir botões 100% visíveis em 360px */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button 
            variant="outline" 
            onClick={handleReject}
            disabled={isProcessing || isAccepting}
            className="w-full h-12 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <X className="h-4 w-4 mr-2 flex-shrink-0" />
            <span className="truncate">Recusar</span>
          </Button>
          <Button 
            onClick={handleAccept}
            disabled={isProcessing || isAccepting}
            className="w-full h-12"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Check className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="truncate">Aceitar</span>
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
