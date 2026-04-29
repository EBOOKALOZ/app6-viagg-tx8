import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Package, MapPin, User, Clock, Check, X, Loader2, Store, 
  Route, Shield, ExternalLink
} from 'lucide-react';
import { SimpleMap } from '@/components/map/SimpleMap';
import { formatDistance, formatEstimatedTime, calculateDistanceKm, calculateEstimatedTimeMinutes } from '@/lib/deliveryPricing';

interface StoreInfo {
  nome_loja: string;
  cpf_cnpj: string;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
}

interface DeliveryData {
  id: string;
  destination: string;
  customer_name: string;
  order_description: string | null;
  estimated_value: number;
  pickup_location: string;
  store: StoreInfo | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  distance_km: number | null;
  estimated_time_min: number | null;
}

interface DeliveryPreviewCardProps {
  delivery: DeliveryData;
  motoboyPosition: { lat: number; lng: number } | null;
  onAccept: () => void;
  onReject: () => void;
  isAccepting: boolean;
  isRejecting: boolean;
}

export function DeliveryPreviewCard({
  delivery,
  motoboyPosition,
  onAccept,
  onReject,
  isAccepting,
  isRejecting,
}: DeliveryPreviewCardProps) {

  // ── Pickup metrics (Motoboy → Loja) — calculated from coordinates ──
  const pickupMetrics = useMemo(() => {
    if (!motoboyPosition || !delivery.pickup_lat || !delivery.pickup_lng) return null;
    const km = calculateDistanceKm(motoboyPosition.lat, motoboyPosition.lng, delivery.pickup_lat, delivery.pickup_lng);
    const min = calculateEstimatedTimeMinutes(km);
    return { distanceKm: km, timeMins: min };
  }, [motoboyPosition, delivery.pickup_lat, delivery.pickup_lng]);

  // ── Delivery metrics (Loja → Cliente) — from backend data ──
  const deliveryDistanceKm = delivery.distance_km;
  const deliveryTimeMins = delivery.estimated_time_min;

  // Formatar endereço completo da loja
  const formatStoreAddress = (s: StoreInfo) => {
    const parts = [s.rua, s.numero ? `nº ${s.numero}` : null, s.bairro, s.cidade, s.estado].filter(Boolean);
    return parts.join(', ') || 'Endereço não informado';
  };

  return (
    <Card className="border-motoboy/50 bg-motoboy-light w-full overflow-hidden">
      <CardContent className="p-3 space-y-3">
        {/* Cabeçalho com valor destacado */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-motoboy" />
            <span className="font-semibold text-foreground">Nova Entrega</span>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-motoboy">
              R$ {delivery.estimated_value.toFixed(2).replace('.', ',')}
            </div>
            <div className="flex items-center gap-1 text-xs text-green-600">
              <Shield className="h-3 w-3" />
              <span>Pagamento garantido</span>
            </div>
          </div>
        </div>

        {/* Prévia da Corrida — Distâncias separadas */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-blue-50/50 border border-blue-100">
            <div className="flex items-center gap-1 text-xs text-blue-600">
              <User className="h-3 w-3" />
              <span>Coleta (você → loja)</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              {pickupMetrics ? formatDistance(pickupMetrics.distanceKm) : '-- km'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {pickupMetrics ? formatEstimatedTime(pickupMetrics.timeMins) : '--'}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-orange-50/50 border border-orange-100">
            <div className="flex items-center gap-1 text-xs text-orange-600">
              <Package className="h-3 w-3" />
              <span>Entrega (loja → cliente)</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              {deliveryDistanceKm != null && deliveryDistanceKm > 0
                ? formatDistance(deliveryDistanceKm)
                : '-- km'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {deliveryTimeMins != null && deliveryTimeMins > 0
                ? formatEstimatedTime(deliveryTimeMins)
                : '--'}
            </p>
          </div>
        </div>

        {/* Container dos 2 mapas separados */}
        <div className="space-y-4 my-4">
          
          {/* MAPA 1: MOTOBOY ATÉ A LOJA */}
          {motoboyPosition && delivery.pickup_lat && delivery.pickup_lng && (
            <div className="bg-[#F0F7FF] rounded-2xl border border-blue-100 p-3 pt-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 flex items-center justify-center">
                  <User className="text-blue-500 w-4 h-4" />
                </div>
                <span className="text-[#3B82F6] font-medium text-sm">Apenas para chegar até a loja</span>
              </div>
              <div className="text-gray-500 text-xs mb-3 ml-7">
                Você está a <span className="font-semibold text-[#3B82F6]">
                  {pickupMetrics ? formatDistance(pickupMetrics.distanceKm) : '--'}
                </span> da loja · <span className="font-semibold text-[#3B82F6]">
                  {pickupMetrics ? formatEstimatedTime(pickupMetrics.timeMins) : '--'}
                </span>
              </div>
              <div className="relative rounded-xl overflow-hidden border border-blue-100 h-28 bg-gray-100">
                <SimpleMap
                  markers={[
                    { id: 'motoboy', lat: motoboyPosition.lat, lng: motoboyPosition.lng, type: 'motoboy', label: 'Você' },
                    { id: 'pickup', lat: delivery.pickup_lat, lng: delivery.pickup_lng, type: 'origin', label: 'Loja' },
                  ]}
                  showRoute={true}
                  useRealRoute={true}
                  className="w-full h-full"
                />
                
                <button className="absolute top-2 right-2 bg-white rounded-md p-1.5 shadow-sm z-10 hover:bg-gray-50">
                  <ExternalLink className="w-3 h-3 text-gray-700" />
                </button>
                <div className="absolute bottom-2 right-2 bg-white rounded-full px-2.5 py-1 text-[10px] font-bold text-gray-800 shadow-sm z-10">
                  {pickupMetrics ? formatDistance(pickupMetrics.distanceKm) : '--'} • {pickupMetrics ? formatEstimatedTime(pickupMetrics.timeMins) : '--'}
                </div>
              </div>
            </div>
          )}

          {/* MAPA 2: LOJA ATÉ O CLIENTE */}
          {delivery.pickup_lat && delivery.pickup_lng && delivery.destination_lat && delivery.destination_lng && (
            <div className="bg-white rounded-2xl border-2 border-[#F97316] overflow-hidden shadow-sm">
              <div className="bg-[#F97316] text-white py-2 px-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  <span className="font-bold text-sm tracking-wide">Entrega ao cliente</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span>
                    {deliveryDistanceKm != null ? formatDistance(deliveryDistanceKm) : '--'} · {deliveryTimeMins != null ? formatEstimatedTime(deliveryTimeMins) : '--'}
                  </span>
                  <button className="bg-white text-gray-800 rounded p-1 hover:bg-gray-100 transition-colors">
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="relative h-48 w-full bg-slate-100">
                <SimpleMap
                  markers={[
                    { id: 'pickup', lat: delivery.pickup_lat, lng: delivery.pickup_lng, type: 'origin', label: 'Loja' },
                    { id: 'destination', lat: delivery.destination_lat, lng: delivery.destination_lng, type: 'destination', label: 'Cliente' },
                  ]}
                  showRoute={true}
                  useRealRoute={true}
                  routeColor="green"
                  className="w-full h-full"
                />
                
                <div className="absolute top-3 left-3 bg-white px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-600 shadow-sm z-10">
                  Rota estimada
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Local de Coleta */}
        <div className="p-2 rounded-lg bg-background border border-border space-y-1">
          <div className="flex items-center gap-1 text-xs font-semibold text-amber-600">
            <Store className="h-3 w-3" />
            <span>RETIRADA</span>
          </div>
          {delivery.store ? (
            <>
              <p className="text-sm font-medium text-foreground">{delivery.store.nome_loja}</p>
              <p className="text-xs text-muted-foreground">{formatStoreAddress(delivery.store)}</p>
            </>
          ) : (
            <p className="text-sm font-medium text-foreground">{delivery.pickup_location}</p>
          )}
        </div>

        {/* Destino */}
        <div className="p-2 rounded-lg bg-background border border-border space-y-1">
          <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <MapPin className="h-3 w-3" />
            <span>ENTREGA</span>
          </div>
          <p className="text-sm font-medium text-foreground">{delivery.destination}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            <span>Cliente: {delivery.customer_name}</span>
          </div>
          {delivery.order_description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {delivery.order_description}
            </p>
          )}
        </div>

        {/* Botões de ação */}
        <div className="flex gap-2 pt-2">
          <Button
            size="lg"
            variant="outline"
            className="flex-1 h-12 border-destructive/50 text-destructive hover:bg-destructive/10"
            onClick={onReject}
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
            size="lg"
            className="flex-1 h-12 bg-motoboy hover:bg-motoboy-hover text-motoboy-foreground"
            onClick={onAccept}
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
