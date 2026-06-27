import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Package, MapPin, Navigation, User, Phone, 
  DollarSign, Check, X, Loader2, AlertCircle, Map
} from 'lucide-react';
import { DeliveryOrder } from '@/hooks/useDeliveryOrder';
import { SimpleMap, MapMarker } from '@/components/map/SimpleMap';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getCityCoordinates } from '@/lib/cityCoordinates';
import { geocodeAddress } from '@/skills/maps/geocodeService';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ActiveDeliveryCardProps {
  order: DeliveryOrder;
  onValidateCode: (orderId: string, code: string) => Promise<boolean>;
  onValidatePickup: (orderId: string, code: string) => Promise<boolean>;
  onCancel: (orderId: string) => Promise<boolean>;
  isValidating: boolean;
}

export function ActiveDeliveryCard({ 
  order, 
  onValidateCode, 
  onValidatePickup,
  onCancel,
  isValidating 
}: ActiveDeliveryCardProps) {
  const [code, setCode] = useState('');
  const [pickupCode, setPickupCode] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [showPickupInput, setShowPickupInput] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [isValidatingPickup, setIsValidatingPickup] = useState(false);
  const [pickupError, setPickupError] = useState('');
  const [focusMarkerId, setFocusMarkerId] = useState<string | undefined>(undefined);
  
  const { user } = useAuth();
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [motoboyLocationLabel, setMotoboyLocationLabel] = useState('');
  const [motoboyAvatar, setMotoboyAvatar] = useState<string | null>(null);
  const [motoboyName, setMotoboyName] = useState<string>('Motoboy');

  // Carrega avatar/nome e endereço de fallback (caso GPS não esteja disponível)
  useEffect(() => {
    if (!user?.id) return;

    const metaAvatar = (user as any)?.user_metadata?.avatar_url as string | undefined;
    const metaName = (user as any)?.user_metadata?.full_name as string | undefined;
    if (metaAvatar) setMotoboyAvatar(metaAvatar);
    if (metaName) setMotoboyName(metaName);

    supabase
      .from('motoboy_profiles')
      .select('cidade, bairro, estado, nome, sobrenome, avatar_url, latitude_residencia, longitude_residencia')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if ((data as any)?.avatar_url) setMotoboyAvatar((data as any).avatar_url);
        const fullName = [(data as any)?.nome, (data as any)?.sobrenome].filter(Boolean).join(' ');
        if (fullName) setMotoboyName(fullName);
        setMotoboyLocationLabel([data?.bairro, data?.cidade, data?.estado].filter(Boolean).join(', '));

        // Fallback de posição — só usa se GPS não forneceu nada ainda
        setPosition(prev => {
          if (prev) return prev; // GPS já definiu posição, não sobrescreve
          if ((data as any)?.latitude_residencia && (data as any)?.longitude_residencia) {
            return { lat: (data as any).latitude_residencia, lng: (data as any).longitude_residencia };
          }
          return prev;
        });

        if (!data?.cidade) return;
        setPosition(prev => {
          if (prev) return prev;
          const coords = getCityCoordinates(data.cidade!);
          return coords ?? prev;
        });
        if (!position) {
          const addressQuery = [data.bairro, data.cidade, data.estado].filter(Boolean).join(', ');
          const geo = await geocodeAddress(addressQuery);
          if (geo) setPosition(prev => prev ?? geo);
        }
      });

    supabase
      .from('profiles')
      .select('name, avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.avatar_url) setMotoboyAvatar((prev) => prev ?? data.avatar_url);
        if (data?.name) setMotoboyName((prev) => prev === 'Motoboy' ? data.name : prev);
      });
  }, [user?.id]);

  // GPS real em tempo real → atualiza posição no mapa + tabela motoboy_locations
  useEffect(() => {
    if (!user?.id || !navigator.geolocation) return;
    let lastSent = 0;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setPosition({ lat, lng });
        setMotoboyLocationLabel('Sua posição atual');

        // Envia para motoboy_locations a cada 8s (evita flood)
        const now = Date.now();
        if (now - lastSent > 8000) {
          lastSent = now;
          supabase
            .from('motoboy_locations')
            .upsert({ motoboy_id: user.id, lat, lng, updated_at: new Date().toISOString() },
              { onConflict: 'motoboy_id' })
            .then(() => {});
        }
      },
      (err) => console.warn('[ActiveDeliveryCard] GPS error:', err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [user?.id]);

  // Garantir SEMPRE uma imagem no marcador: avatar real, ou avatar gerado pelas iniciais
  const markerAvatarUrl = motoboyAvatar
    || `https://ui-avatars.com/api/?name=${encodeURIComponent(motoboyName)}&background=f97316&color=fff&size=128&bold=true&format=png`;

  const handleValidate = async () => {
    if (code.length !== 4) {
      return;
    }
    const success = await onValidateCode(order.id, code);
    if (success) {
      setCode('');
      setShowCodeInput(false);
    }
  };

  const handleValidatePickup = async () => {
    if (pickupCode.length !== 4) {
      return;
    }
    setIsValidatingPickup(true);
    setPickupError('');
    const success = await onValidatePickup(order.id, pickupCode);
    if (success) {
      setPickupCode('');
      setShowPickupInput(false);
    } else {
      setPickupError('Código inválido');
    }
    setIsValidatingPickup(false);
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    await onCancel(order.id);
    setIsCancelling(false);
  };

  // Verificar se produto já foi retirado (status 'in_progress' ou 'entregando')
  // CORREÇÃO: validate_pickup_code atualiza para 'entregando', não 'in_progress'
  const isPickedUp = order.status === 'in_progress' || order.status === 'entregando';
  
  // REGRA OBRIGATÓRIA: Definir fase da rota baseado no status
  // - Antes da coleta: rota motoboy -> loja (to_pickup)
  // - Depois da coleta: rota loja -> cliente (to_destination)
  const routePhase: 'to_pickup' | 'to_destination' = isPickedUp ? 'to_destination' : 'to_pickup';

  // CORREÇÃO: Adicionar status 'a_caminho' 
  const statusConfig = {
    created: { label: 'Entrega criada', className: 'bg-orange-100 text-orange-700 border-orange-200' },
    accepted: { label: 'Aceito', className: 'bg-primary/20 text-primary border-primary/30' },
    a_caminho: { label: 'A Caminho', className: 'bg-blue-500/20 text-blue-600 border-blue-500/30' },
    in_progress: { label: 'Em Andamento', className: 'bg-accent/20 text-accent-foreground border-accent/30' },
  };

  const currentStatus = statusConfig[order.status as keyof typeof statusConfig] || statusConfig.a_caminho;

  // Construir marcadores do mapa
  const mapMarkers: MapMarker[] = [];
  
  // Posição do motoboy (geolocalização atual)
  if (position?.lat && position?.lng) {
    mapMarkers.push({
      id: 'motoboy',
      lat: position.lat,
      lng: position.lng,
      type: 'motoboy',
      label: motoboyLocationLabel || 'Sua localização',
      avatar_url: markerAvatarUrl,
    });
  }
  
  // Local de coleta (loja)
  if (order.pickup_lat && order.pickup_lng) {
    mapMarkers.push({
      id: 'pickup',
      lat: order.pickup_lat,
      lng: order.pickup_lng,
      type: 'origin',
      label: `Coleta: ${order.pickup_location}`,
    });
  }
  
  // Local de entrega (cliente)
  if (order.destination_lat && order.destination_lng) {
    mapMarkers.push({
      id: 'destination',
      lat: order.destination_lat,
      lng: order.destination_lng,
      type: 'destination',
      label: `Entrega: ${order.destination}`,
    });
  }

  // Verificar se temos coordenadas suficientes para o mapa
  const hasPickupCoords = order.pickup_lat !== null && order.pickup_lng !== null;
  const hasDestCoords = order.destination_lat !== null && order.destination_lng !== null;
  // Mostrar mapa se temos pelo menos coleta OU entrega (não requer posição do motoboy)
  const hasMapData = hasPickupCoords || hasDestCoords;
  
  // Loading apenas se não temos nenhuma coordenada
  const isLoadingMap = !hasMapData;

  // Polyline: sempre loja → cliente (prioridade), fallback motoboy → loja
  const polylineData: [number, number][] | undefined = 
    (position?.lat && position?.lng && hasPickupCoords && hasDestCoords)
      ? [[position.lat, position.lng], [order.pickup_lat!, order.pickup_lng!], [order.destination_lat!, order.destination_lng!]]
      : (hasPickupCoords && hasDestCoords
          ? [[order.pickup_lat!, order.pickup_lng!], [order.destination_lat!, order.destination_lng!]]
          : undefined);

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5 text-primary" />
            Entrega Ativa
          </CardTitle>
          <Badge variant="outline" className={currentStatus.className}>
            {currentStatus.label}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* CORREÇÃO C: Mapa com altura fixa e placeholder enquanto carrega */}
        {showMap && (
          <div className="rounded-lg overflow-hidden border border-border">
            {hasMapData ? (
              <div className="h-[260px]">
                <SimpleMap
                  markers={mapMarkers}
                  showRoute={true}
                  useRealRoute={true}
                  preCalculatedPolyline={polylineData}
                  routePhase={routePhase}
                  focusMarkerId={focusMarkerId}
                  routeColor={routePhase === 'to_pickup' ? 'orange' : 'green'}
                  className="w-full h-full"
                />
              </div>
            ) : (
              /* CORREÇÃO C: Placeholder enquanto coords carregam */
              <div className="h-[260px] bg-muted/30 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground">
                    {isLoadingMap ? 'Carregando localização...' : 'Aguardando coordenadas...'}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    O mapa será exibido em instantes
                  </p>
                </div>
              </div>
            )}
            <div className="p-2 bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Map className="h-3 w-3" />
                <span>{isPickedUp ? 'Rota para entrega' : 'Rota até a loja'}</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 text-xs"
                onClick={() => setShowMap(false)}
              >
                Ocultar mapa
              </Button>
            </div>
          </div>
        )}
        
        {!showMap && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={() => setShowMap(true)}
          >
            <Map className="h-4 w-4 mr-2" />
            Mostrar mapa
          </Button>
        )}
        
        {/* Customer Info */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <div className="rounded-full bg-primary/10 p-2">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium">{order.customer_name}</p>
            {order.customer_phone && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {order.customer_phone}
              </p>
            )}
          </div>
        </div>

        {/* Locations - Clicável para focar no mapa */}
        <div className="space-y-3">
          <button 
            className="flex items-start gap-3 w-full text-left p-2 rounded-lg hover:bg-green-500/10 transition-colors"
            onClick={() => setFocusMarkerId(focusMarkerId === 'pickup' ? undefined : 'pickup')}
          >
            <div className="mt-0.5 rounded-full bg-green-500/10 p-1.5">
              <MapPin className="h-4 w-4 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Coleta (clique para ver no mapa)</p>
              <p className="text-sm font-medium">{order.pickup_location}</p>
            </div>
          </button>

          <button 
            className="flex items-start gap-3 w-full text-left p-2 rounded-lg hover:bg-red-500/10 transition-colors"
            onClick={() => setFocusMarkerId(focusMarkerId === 'destination' ? undefined : 'destination')}
          >
            <div className="mt-0.5 rounded-full bg-red-500/10 p-1.5">
              <Navigation className="h-4 w-4 text-red-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Entrega (clique para ver no mapa)</p>
              <p className="text-sm font-medium">{order.destination}</p>
            </div>
          </button>
        </div>

        {/* Order Description */}
        {order.order_description && (
          <div className="p-3 rounded-lg bg-muted/30 border border-border">
            <p className="text-xs text-muted-foreground mb-1">Descrição</p>
            <p className="text-sm">{order.order_description}</p>
          </div>
        )}

        {/* Value */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10">
          <span className="text-sm font-medium">Valor da entrega</span>
          <span className="text-lg font-bold text-primary flex items-center">
            <DollarSign className="h-4 w-4" />
            R$ {order.estimated_value.toFixed(2)}
          </span>
        </div>

        {/* Confirmação de Retirada (antes de in_progress) */}
        {!isPickedUp && !showPickupInput && !showCodeInput && (
          <Button 
            className="w-full bg-amber-500 hover:bg-amber-600" 
            size="lg"
            onClick={() => setShowPickupInput(true)}
          >
            <Package className="h-4 w-4 mr-2" />
            Confirmar Retirada do Produto
          </Button>
        )}

        {showPickupInput && (
          <div className="space-y-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-center gap-2 text-sm text-amber-700">
              <AlertCircle className="h-4 w-4" />
              <span>Digite o código de retirada fornecido pela loja</span>
            </div>
            
            <Input
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="0000"
              value={pickupCode}
              onChange={(e) => {
                setPickupCode(e.target.value.replace(/\D/g, '').slice(0, 4));
                setPickupError('');
              }}
              className="text-center text-2xl font-mono tracking-[0.5em] h-14"
            />

            {pickupError && (
              <p className="text-sm text-destructive text-center">{pickupError}</p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowPickupInput(false);
                  setPickupCode('');
                  setPickupError('');
                }}
              >
                Voltar
              </Button>
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-600"
                onClick={handleValidatePickup}
                disabled={pickupCode.length !== 4 || isValidatingPickup}
              >
                {isValidatingPickup ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Validar
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Confirmação de Entrega (só após retirada confirmada) */}
        {isPickedUp && !showCodeInput && (
          <Button 
            className="w-full" 
            size="lg"
            onClick={() => setShowCodeInput(true)}
          >
            <Check className="h-4 w-4 mr-2" />
            Confirmar Entrega
          </Button>
        )}

        {showCodeInput && (
          <div className="space-y-3 p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span>Digite o código de 4 dígitos fornecido pelo cliente</span>
            </div>
            
            <Input
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="0000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="text-center text-2xl font-mono tracking-[0.5em] h-14"
            />

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowCodeInput(false);
                  setCode('');
                }}
              >
                Voltar
              </Button>
              <Button
                className="flex-1"
                onClick={handleValidate}
                disabled={code.length !== 4 || isValidating}
              >
                {isValidating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Validar
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Cancel Button */}
        {!showCodeInput && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar Entrega
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancelar entrega?</AlertDialogTitle>
                <AlertDialogDescription>
                  Essa ação não pode ser desfeita. Você terá que aceitar uma nova entrega.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Não, manter</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleCancel}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={isCancelling}
                >
                  {isCancelling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Sim, cancelar'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  );
}
