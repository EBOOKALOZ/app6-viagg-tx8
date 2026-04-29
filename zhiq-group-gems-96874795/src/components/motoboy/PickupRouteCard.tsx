import { Bike, MapPin } from 'lucide-react';
import RouteMapCanvas from './RouteMapCanvas';

interface Props {
  offerId: string;
  pickupLat: number;
  pickupLng: number;
  motoboyLat: number | null;
  motoboyLng: number | null;
  pickupDistanceKm: number | null;
  pickupDurationMin: number | null;
  pickupPolyline: string | null;
}

export default function PickupRouteCard({
  offerId, pickupLat, pickupLng, motoboyLat, motoboyLng,
  pickupDistanceKm, pickupDurationMin, pickupPolyline,
}: Props) {
  const displayDist = pickupDistanceKm != null ? pickupDistanceKm.toFixed(1) : null;
  const displayMin = pickupDurationMin != null ? `${Math.round(pickupDurationMin)}` : null;

  return (
    <div className="h-[240px] flex flex-col rounded-2xl overflow-hidden border border-blue-200/60 bg-gradient-to-br from-blue-50/80 via-sky-50/50 to-blue-100/30">
      {/* HEADER — h-[64px] */}
      <div className="h-[64px] shrink-0 px-3.5 flex flex-col justify-center">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-500/15 flex items-center justify-center">
            <Bike className="h-3.5 w-3.5 text-blue-600" />
          </div>
          <span className="font-bold text-[13px] text-blue-700 tracking-tight">
            Apenas para chegar até a loja
          </span>
        </div>
        <p className="text-[11.5px] text-blue-500/80 mt-1 ml-8">
          {displayDist != null ? (
            <>
              Você está a <span className="font-semibold text-blue-600">{displayDist} km</span> da loja
              {displayMin && <> · <span className="font-semibold text-blue-600">{displayMin} min</span></>}
            </>
          ) : (
            <span className="animate-pulse">Calculando rota…</span>
          )}
        </p>
      </div>

      {/* MAP — h-[150px] */}
      <div className="h-[150px] shrink-0 mx-2.5 mb-2.5 rounded-xl overflow-hidden relative bg-blue-100/40">
        <RouteMapCanvas
          instanceId={`pickup-${offerId}`}
          originLat={motoboyLat}
          originLng={motoboyLng}
          destinationLat={pickupLat}
          destinationLng={pickupLng}
          encodedPolyline={pickupPolyline}
          routeColor="#2D7FF9"
          outlineColor="#1A5BC4"
          originMarkerColor="#2D7FF9"
          destinationMarkerColor="#34C759"
          placeholderText="Rota sendo calculada…"
        />

        {/* Badge: Até a loja */}
        <div className="absolute top-2 left-2 bg-blue-600/90 backdrop-blur-sm rounded-lg px-2.5 py-1 text-[10px] text-white font-semibold shadow-sm">
          Até a loja
        </div>

        {/* Distance pill */}
        {displayDist && (
          <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-md rounded-lg px-2.5 py-1 text-[11px] font-bold text-foreground shadow-sm">
            {displayDist} km{displayMin && ` • ${displayMin} min`}
          </div>
        )}
      </div>
    </div>
  );
}
