import { forwardRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Store, MapPin, User, Bike, Calendar, CheckCircle, Package, DollarSign, Clock, Route } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SimpleMap, MapMarker } from '@/components/map/SimpleMap';

export interface DeliveryReceiptData {
  id: string;
  loja_nome?: string | null;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  pickup_location: string;
  destination: string;
  order_description?: string | null;
  valor_bruto: number;
  taxa_plataforma: number;
  valor_liquido: number;
  status: string;
  finalizada_em?: string | null;
  motoboy_name?: string;
  motoboy_nome?: string; // Alias para compatibilidade
  route_points?: { lat: number; lng: number }[];
  receipt_hash?: string | null;
  distance_km?: number;
  duration_minutes?: number;
  accepted_at?: string;
}

interface DeliveryReceiptProps {
  data: DeliveryReceiptData;
  showMap?: boolean;
}

export const DeliveryReceipt = forwardRef<HTMLDivElement, DeliveryReceiptProps>(
  ({ data, showMap = true }, ref) => {
    // Preparar marcadores do mapa
    const mapMarkers: MapMarker[] = [];
    
    if (data.route_points && data.route_points.length >= 2) {
      // Primeiro ponto = origem
      mapMarkers.push({
        id: 'origin',
        lat: data.route_points[0].lat,
        lng: data.route_points[0].lng,
        type: 'origin',
        label: 'Coleta',
      });
      
      // Último ponto = destino
      const lastPoint = data.route_points[data.route_points.length - 1];
      mapMarkers.push({
        id: 'destination',
        lat: lastPoint.lat,
        lng: lastPoint.lng,
        type: 'destination',
        label: 'Entrega',
      });
    }

    const statusLabel = {
      finalizada: 'Entrega Concluída',
      cancelada: 'Entrega Cancelada',
    }[data.status] || 'Entrega';

    const statusColor = data.status === 'finalizada' ? 'text-green-600' : 'text-red-600';

    return (
      <div ref={ref} className="bg-white text-black p-6 max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-3">
            <Package className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Comprovante de Entrega</h1>
          <p className={`text-sm font-medium ${statusColor} flex items-center justify-center gap-1 mt-1`}>
            <CheckCircle className="h-4 w-4" />
            {statusLabel}
          </p>
          {data.receipt_hash && (
            <p className="text-xs text-gray-500 mt-2 font-mono">
              #{data.receipt_hash.slice(0, 12).toUpperCase()}
            </p>
          )}
        </div>

        <Separator className="my-4 bg-gray-200" />

        {/* Data e Hora */}
        <div className="flex items-center gap-3 mb-4">
          <Calendar className="h-5 w-5 text-gray-500" />
          <div>
            <p className="text-xs text-gray-500">Data da Entrega</p>
            <p className="font-medium">
              {data.finalizada_em 
                ? format(new Date(data.finalizada_em), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })
                : 'Data não disponível'}
            </p>
          </div>
        </div>

        <Separator className="my-4 bg-gray-200" />

        {/* Loja */}
        {data.loja_nome && (
          <div className="flex items-start gap-3 mb-4">
            <Store className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">Estabelecimento</p>
              <p className="font-medium">{data.loja_nome}</p>
              <p className="text-sm text-gray-600">{data.pickup_location}</p>
            </div>
          </div>
        )}

        {/* Cliente */}
        <div className="flex items-start gap-3 mb-4">
          <User className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-xs text-gray-500">Cliente</p>
            <p className="font-medium">{data.cliente_nome || 'Não informado'}</p>
            {data.cliente_telefone && (
              <p className="text-sm text-gray-600">{data.cliente_telefone}</p>
            )}
          </div>
        </div>

        {/* Destino */}
        <div className="flex items-start gap-3 mb-4">
          <MapPin className="h-5 w-5 text-emerald-600 mt-0.5" />
          <div>
            <p className="text-xs text-gray-500">Endereço de Entrega</p>
            <p className="font-medium">{data.destination}</p>
          </div>
        </div>

        {/* Descrição do pedido */}
        {data.order_description && (
          <div className="flex items-start gap-3 mb-4">
            <Package className="h-5 w-5 text-purple-600 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">Descrição</p>
              <p className="font-medium">{data.order_description}</p>
            </div>
          </div>
        )}

        {/* Distância e Tempo */}
        {(data.distance_km || data.duration_minutes) && (
          <div className="flex gap-6 mb-4">
            {data.distance_km && data.distance_km > 0 && (
              <div className="flex items-center gap-2">
                <Route className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-xs text-gray-500">Distância</p>
                  <p className="font-medium">{data.distance_km.toFixed(1)} km</p>
                </div>
              </div>
            )}
            {data.duration_minutes && data.duration_minutes > 0 && (
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="text-xs text-gray-500">Tempo</p>
                  <p className="font-medium">{data.duration_minutes} min</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Motoboy */}
        {(data.motoboy_name || data.motoboy_nome) && (
          <div className="flex items-start gap-3 mb-4">
            <Bike className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">Entregador</p>
              <p className="font-medium">{data.motoboy_name || data.motoboy_nome}</p>
            </div>
          </div>
        )}

        <Separator className="my-4 bg-gray-200" />

        {/* Valores */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Valor bruto</span>
            <span>R$ {data.valor_bruto.toFixed(2).replace('.', ',')}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Taxa da plataforma</span>
            <span className="text-red-600">- R$ {data.taxa_plataforma.toFixed(2).replace('.', ',')}</span>
          </div>
          <Separator className="my-2 bg-gray-200" />
          <div className="flex justify-between font-bold">
            <span>Valor líquido</span>
            <span className="text-primary">R$ {data.valor_liquido.toFixed(2).replace('.', ',')}</span>
          </div>
        </div>

        {/* Mapa com rota */}
        {showMap && mapMarkers.length >= 2 && (
          <div className="mt-6">
            <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Rota da Entrega
            </p>
            <div className="h-48 rounded-lg overflow-hidden border border-gray-200">
            <SimpleMap
                markers={mapMarkers}
                showRoute={true}
                useRealRoute={true}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-400">
            Comprovante gerado automaticamente
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Viagg Entregas • {format(new Date(), 'yyyy')}
          </p>
        </div>
      </div>
    );
  }
);

DeliveryReceipt.displayName = 'DeliveryReceipt';
