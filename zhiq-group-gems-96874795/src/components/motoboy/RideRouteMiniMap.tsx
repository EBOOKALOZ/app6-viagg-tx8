import { useState } from 'react';
import { Package, Maximize2, MapPin } from 'lucide-react';
import RouteMapCanvas from './RouteMapCanvas';
import FullscreenMapModal from '@/components/map/FullscreenMapModal';
import polyline from '@mapbox/polyline';

interface Props {
  offerId?: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropLat: number | null;
  dropLng: number | null;
  distanceKm: number;
  estimatedMinutes: number | null;
  dropPolyline: string | null;
}

export default function RideRouteMiniMap({
  offerId, pickupLat, pickupLng, dropLat, dropLng,
  distanceKm, estimatedMinutes, dropPolyline,
}: Props) {
  const [fullscreen, setFullscreen] = useState(false);

  const routeCoords: [number, number][] | null = (() => {
    if (!dropPolyline) return null;
    try {
      const decoded = polyline.decode(dropPolyline);
      return decoded.map(([lat, lng]) => [lng, lat] as [number, number]);
    } catch {
      return null;
    }
  })();

  console.log("DROP POLYLINE:", dropPolyline);

  if (!dropLat || !dropLng) {
    return (
      <div className="h-[240px] flex flex-col items-center justify-center rounded-2xl bg-orange-50 border border-orange-200/60 text-orange-500 font-semibold text-[13px]">
        📍 Destino indisponível
      </div>
    );
  }

  if (!pickupLat || !pickupLng) return null;

  const fullscreenRoute = routeCoords && routeCoords.length >= 2
    ? { color: '#00FF00', outlineColor: '#00AA00', coordinates: routeCoords }
    : null;

  const fullscreenMarkers = [
    { color: '#34C759', lngLat: [pickupLng, pickupLat] as [number, number] },
    { color: '#FF3B30', lngLat: [dropLng, dropLat] as [number, number] },
  ];

  return (
    <>
      <div className="h-[240px] flex flex-col rounded-2xl overflow-hidden border-2 border-orange-400/60 shadow-lg shadow-orange-500/10">
        {/* HEADER — h-[64px] orange gradient */}
        <div className="h-[64px] shrink-0 bg-gradient-to-r from-orange-500 to-orange-400 px-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              <Package className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-bold text-[13px] text-white tracking-tight">
              Entrega ao cliente
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-white/85 font-semibold">
              {distanceKm.toFixed(1)} km{estimatedMinutes != null ? ` · ${estimatedMinutes} min` : ''}
            </span>
            <button
              onClick={() => setFullscreen(true)}
              className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              <Maximize2 className="h-3.5 w-3.5 text-white" />
            </button>
          </div>
        </div>

        {/* MAP — h-[150px] — MESMO componente do card "Até a loja" */}
        <div className="h-[150px] shrink-0 relative bg-orange-50/50">
          <RouteMapCanvas
            instanceId={`drop-${offerId || 'default'}`}
            originLat={pickupLat}
            originLng={pickupLng}
            destinationLat={dropLat}
            destinationLng={dropLng}
            encodedPolyline={dropPolyline}
            routeColor="#00FF00"
            outlineColor="#00AA00"
            originMarkerColor="#34C759"
            destinationMarkerColor="#FF3B30"
            placeholderText="Calculando rota real…"
            interactive
          />

          {/* Floating badge */}
          <div className="absolute bottom-2.5 left-2.5 bg-white/92 backdrop-blur-md rounded-lg px-2.5 py-1 text-[10px] font-semibold text-foreground/70 shadow-sm border border-border/30">
            {routeCoords && routeCoords.length >= 2 ? 'Rota real' : 'Calculando rota real…'}
          </div>
        </div>
      </div>

      {/* Fullscreen modal */}
      {fullscreen && (
        <FullscreenMapModal
          token=""
          markers={fullscreenMarkers}
          route={fullscreenRoute}
          onClose={() => setFullscreen(false)}
        />
      )}
    </>
  );
}
