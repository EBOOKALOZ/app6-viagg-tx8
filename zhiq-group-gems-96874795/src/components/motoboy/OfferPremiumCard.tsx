import { useState, useEffect } from 'react';
import { MapPin, Navigation, Ruler, Clock, Banknote, Timer } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import OfferMiniMap from './OfferMiniMap';

export interface OfferData {
  id: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  commission_percent: number | null;
  gross_value: number | null;
  net_value: number | null;
  delivery_orders: {
    id: string;
    pickup_address: string | null;
    drop_address: string | null;
    pickup_lat: number | null;
    pickup_lng: number | null;
    drop_lat: number | null;
    drop_lng: number | null;
    distance_km: number | null;
    estimated_minutes: number | null;
    price: number | null;
  } | null;
}

interface OfferPremiumCardProps {
  offer: OfferData;
  accepting: boolean;
  onAccept: (offerId: string) => void;
  now: number; // timestamp updated every second from parent
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function OfferPremiumCard({ offer, accepting, onAccept, now }: OfferPremiumCardProps) {
  const order = offer.delivery_orders;
  const tempoEstimado = order?.estimated_minutes ?? (order?.distance_km ? Math.ceil(order.distance_km * 3) : null);

  const ganhoReal = offer.net_value != null
    ? (offer.net_value / 100).toFixed(2)
    : order?.price != null
      ? (order.price * (1 - (offer.commission_percent ?? 25) / 100)).toFixed(2)
      : null;

  // Expiration countdown
  const secondsLeft = offer.expires_at
    ? Math.max(0, Math.floor((new Date(offer.expires_at).getTime() - now) / 1000))
    : null;

  const isUrgent = secondsLeft != null && secondsLeft < 30;
  const isExpired = secondsLeft != null && secondsLeft <= 0;

  const hasCoords = order?.pickup_lat != null && order?.pickup_lng != null;

  if (isExpired) return null;

  return (
    <Card className="p-4 shadow-lg border-border/60 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Header: Pickup + Badges */}
      <div className="flex justify-between items-start mb-2 gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Coleta
          </p>
          <p className="font-semibold text-sm truncate">{order?.pickup_address ?? '—'}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {offer.commission_percent != null && (
            <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px]">
              {offer.commission_percent}%
            </Badge>
          )}
          {secondsLeft != null && (
            <Badge className={`text-[10px] gap-0.5 ${isUrgent ? 'bg-destructive/10 text-destructive border-destructive/30 animate-pulse' : 'bg-muted text-muted-foreground border-border'}`}>
              <Timer className="h-2.5 w-2.5" />
              {isUrgent ? 'ÚLTIMOS SEG' : formatCountdown(secondsLeft)}
            </Badge>
          )}
        </div>
      </div>

      {/* Destination */}
      <div className="mb-3">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Navigation className="h-3 w-3" /> Destino
        </p>
        <p className="font-semibold text-sm truncate">{order?.drop_address ?? '—'}</p>
      </div>

      {/* Mini Map */}
      {hasCoords && (
        <div className="mb-3">
          <OfferMiniMap
            pickupLat={order!.pickup_lat}
            pickupLng={order!.pickup_lng}
            dropoffLat={order!.drop_lat}
            dropoffLng={order!.drop_lng}
            distanciaKm={order?.distance_km ?? undefined}
            tempoEstimadoMin={tempoEstimado ?? undefined}
          />
        </div>
      )}

      {/* Metrics row (when no map or as supplement) */}
      {!hasCoords && (
        <div className="flex justify-between text-xs text-muted-foreground mb-3">
          {order?.distance_km != null && (
            <span className="flex items-center gap-1"><Ruler className="h-3.5 w-3.5" /> {order.distance_km.toFixed(1)} km</span>
          )}
          {tempoEstimado != null && (
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {tempoEstimado} min</span>
          )}
          {order?.price != null && (
            <span className="flex items-center gap-1"><Banknote className="h-3.5 w-3.5" /> R$ {order.price.toFixed(2)}</span>
          )}
        </div>
      )}

      {/* Earnings highlight */}
      {ganhoReal && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 mb-3 text-center">
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-0.5">Você recebe</p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">R$ {ganhoReal}</p>
        </div>
      )}

      {/* CTA */}
      <Button
        className="w-full h-12 text-base font-bold bg-orange-500 hover:bg-orange-600 text-white"
        disabled={accepting}
        onClick={() => onAccept(offer.id)}
      >
        {accepting ? 'ACEITANDO…' : 'ACEITAR CORRIDA'}
      </Button>
    </Card>
  );
}
