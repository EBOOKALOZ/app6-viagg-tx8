import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DeliveryReceipt, DeliveryReceiptData } from './DeliveryReceipt';
import { SimpleMap, MapMarker } from '@/components/map/SimpleMap';
import { FileText, Share2, MapPin, X, Download, Clock, Route, Bike } from 'lucide-react';
import { toast } from 'sonner';

interface DeliveryHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  delivery: DeliveryReceiptData | null;
  viewMode?: 'details' | 'route' | 'receipt';
}

export function DeliveryHistoryModal({
  open,
  onOpenChange,
  delivery,
  viewMode = 'details',
}: DeliveryHistoryModalProps) {
  const [currentView, setCurrentView] = useState<'details' | 'route' | 'receipt'>(viewMode);
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!delivery) return null;

  // Preparar marcadores para o mapa
  const mapMarkers: MapMarker[] = [];
  
  if (delivery.route_points && delivery.route_points.length >= 2) {
    // Adicionar todos os pontos da rota
    delivery.route_points.forEach((point, index) => {
      if (index === 0) {
        mapMarkers.push({
          id: `point-${index}`,
          lat: point.lat,
          lng: point.lng,
          type: 'origin',
          label: 'Coleta',
        });
      } else if (index === delivery.route_points!.length - 1) {
        mapMarkers.push({
          id: `point-${index}`,
          lat: point.lat,
          lng: point.lng,
          type: 'destination',
          label: 'Entrega',
        });
      }
    });
  }

  const handleShareWhatsApp = () => {
    const message = `🧾 *Comprovante de Entrega*\n\n` +
      `📍 *Origem:* ${delivery.pickup_location}\n` +
      `📍 *Destino:* ${delivery.destination}\n` +
      `👤 *Cliente:* ${delivery.cliente_nome || 'Não informado'}\n` +
      `💰 *Valor:* R$ ${delivery.valor_bruto.toFixed(2).replace('.', ',')}\n` +
      `✅ *Status:* ${delivery.status === 'finalizada' ? 'Entregue' : 'Cancelada'}\n\n` +
      `${delivery.receipt_hash ? `#${delivery.receipt_hash.slice(0, 12).toUpperCase()}` : ''}\n\n` +
      `_Comprovante gerado por Viagg Entregas_`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    toast.success('Abrindo WhatsApp...');
  };

  const handleDownloadReceipt = () => {
    // Para download, podemos usar html2canvas ou simplesmente notificar
    toast.success('Comprovante pronto para compartilhar');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] p-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg">Detalhes da Entrega</DialogTitle>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-2 mt-3">
            <Button
              variant={currentView === 'details' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('details')}
            >
              <FileText className="h-4 w-4 mr-1" />
              Detalhes
            </Button>
            {mapMarkers.length >= 2 && (
              <Button
                variant={currentView === 'route' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCurrentView('route')}
              >
                <MapPin className="h-4 w-4 mr-1" />
                Rota
              </Button>
            )}
            <Button
              variant={currentView === 'receipt' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('receipt')}
            >
              <FileText className="h-4 w-4 mr-1" />
              Comprovante
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          {/* View: Detalhes */}
          {currentView === 'details' && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Loja</p>
                  <p className="font-medium text-sm">{delivery.loja_nome || 'Não informado'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="font-medium text-sm">{delivery.cliente_nome || 'Não informado'}</p>
                </div>
              </div>
              
              <div>
                <p className="text-xs text-muted-foreground">Endereço de Coleta</p>
                <p className="font-medium text-sm">{delivery.pickup_location}</p>
              </div>
              
              <div>
                <p className="text-xs text-muted-foreground">Endereço de Entrega</p>
                <p className="font-medium text-sm">{delivery.destination}</p>
              </div>
              
              {delivery.order_description && (
                <div>
                  <p className="text-xs text-muted-foreground">Descrição</p>
                  <p className="font-medium text-sm">{delivery.order_description}</p>
                </div>
              )}

              {/* Resumo da entrega: distância e tempo */}
              {(delivery.distance_km || delivery.duration_minutes || delivery.motoboy_nome) && (
                <div className="grid grid-cols-3 gap-3 py-2 px-3 bg-muted/40 rounded-lg">
                  {delivery.distance_km !== undefined && delivery.distance_km > 0 && (
                    <div className="text-center">
                      <Route className="h-4 w-4 mx-auto mb-1 text-blue-600" />
                      <p className="text-sm font-bold">{delivery.distance_km.toFixed(1)} km</p>
                      <p className="text-xs text-muted-foreground">Distância</p>
                    </div>
                  )}
                  {delivery.duration_minutes !== undefined && delivery.duration_minutes > 0 && (
                    <div className="text-center">
                      <Clock className="h-4 w-4 mx-auto mb-1 text-orange-600" />
                      <p className="text-sm font-bold">{delivery.duration_minutes} min</p>
                      <p className="text-xs text-muted-foreground">Tempo</p>
                    </div>
                  )}
                  {delivery.motoboy_nome && (
                    <div className="text-center">
                      <Bike className="h-4 w-4 mx-auto mb-1 text-primary" />
                      <p className="text-sm font-bold truncate">{delivery.motoboy_nome}</p>
                      <p className="text-xs text-muted-foreground">Entregador</p>
                    </div>
                  )}
                </div>
              )}
              
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Valor Bruto</p>
                  <p className="font-bold text-sm">R$ {delivery.valor_bruto.toFixed(2)}</p>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Taxa</p>
                  <p className="font-bold text-sm text-red-500">-R$ {delivery.taxa_plataforma.toFixed(2)}</p>
                </div>
                <div className="text-center p-3 bg-primary/10 rounded-lg">
                  <p className="text-xs text-muted-foreground">Líquido</p>
                  <p className="font-bold text-sm text-primary">R$ {delivery.valor_liquido.toFixed(2)}</p>
                </div>
              </div>
            </div>
          )}

          {/* View: Rota */}
          {currentView === 'route' && mapMarkers.length >= 2 && (
            <div className="h-80">
              <SimpleMap
                markers={mapMarkers}
                showRoute={true}
                className="w-full h-full"
              />
            </div>
          )}

          {/* View: Comprovante */}
          {currentView === 'receipt' && (
            <div className="p-2">
              <DeliveryReceipt ref={receiptRef} data={delivery} showMap={false} />
            </div>
          )}
        </ScrollArea>

        {/* Footer Actions */}
        <div className="p-4 border-t bg-muted/30 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDownloadReceipt}
          >
            <Download className="h-4 w-4 mr-2" />
            Baixar
          </Button>
          <Button
            className="flex-1 bg-green-600 hover:bg-green-700"
            onClick={handleShareWhatsApp}
          >
            <Share2 className="h-4 w-4 mr-2" />
            WhatsApp
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
