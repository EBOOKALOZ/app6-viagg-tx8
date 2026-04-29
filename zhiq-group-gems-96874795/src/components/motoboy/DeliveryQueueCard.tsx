import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Clock, Route, DollarSign, Users, Percent, Store, Loader2 } from 'lucide-react';
import type { DeliveryOffer } from '@/components/motoboy/DeliveryOfferCard';

interface DeliveryQueueCardProps {
  offer: DeliveryOffer;
}

/**
 * Card de modo espera/fila — exibe dados da entrega enquanto
 * o motoboy aguarda nova chamada ou o pedido é redistribuído.
 * Somente leitura, sem ação de aceite.
 */
export default function DeliveryQueueCard({ offer }: DeliveryQueueCardProps) {
  const hasCommissionInfo = offer.comissao_percent != null && offer.valor_liquido != null;
  const hasStoreInfo = !!offer.loja_nome;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3 pb-safe animate-in fade-in duration-300">
      <Card className="border border-border shadow-lg bg-card">
        <CardContent className="p-4 space-y-3">
          {/* Header — waiting indicator */}
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              Em espera por nova chamada…
            </span>
          </div>

          {/* Store info */}
          {hasStoreInfo && (
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
              {offer.loja_logo ? (
                <img src={offer.loja_logo} alt={offer.loja_nome} className="h-8 w-8 rounded-md object-cover border border-border" />
              ) : (
                <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                  <Store className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{offer.loja_nome}</p>
                {offer.loja_endereco && (
                  <p className="text-xs text-muted-foreground truncate">{offer.loja_endereco}</p>
                )}
              </div>
            </div>
          )}

          {/* Delivery details */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm truncate">{offer.regiao}</span>
            </div>
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm">{offer.distancia_km.toFixed(1)} km</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm">{offer.tempo_estimado_min} min</span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm">R$ {offer.valor.toFixed(2).replace('.', ',')}</span>
            </div>
          </div>

          {/* Commission breakdown */}
          {hasCommissionInfo && (
            <div className="bg-primary/5 rounded-lg p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5" />
                  Comissão: {offer.comissao_percent}%
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {offer.grupos_ativos ?? 0} grupo{(offer.grupos_ativos ?? 0) !== 1 ? 's' : ''} ativo{(offer.grupos_ativos ?? 0) !== 1 ? 's' : ''}
                </span>
              </div>
              {offer.comissao_plataforma != null && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Taxa plataforma:</span>
                  <span>R$ {offer.comissao_plataforma.toFixed(2).replace('.', ',')}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border pt-1.5">
                <span className="text-sm font-medium text-foreground">Você recebe:</span>
                <span className="text-lg font-bold text-primary">
                  R$ {offer.valor_liquido!.toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
