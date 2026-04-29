import { useMemo } from 'react';
import { SimpleMap } from '@/components/map/SimpleMap';
import type { MapMarker } from '@/components/map/SimpleMap';
import { Bike, Store, MapPin, Clock, Route } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface OfferMiniMapProps {
  motoboyLat?: number | null;
  motoboyLng?: number | null;
  storeLat?: number | null;
  storeLng?: number | null;
  clientLat?: number | null;
  clientLng?: number | null;
  storeName?: string;
  storeLogo?: string | null;
  routePolylineJson?: string | null;
  distanciaKm?: number;
  tempoEstimadoMin?: number;
  fullscreen?: boolean;
  motoboyCity?: string;
  motoboyName?: string;
  motoboyAvatar?: string | null;
  mapHeightClass?: string;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export default function OfferMiniMap({
  motoboyLat, motoboyLng,
  storeLat, storeLng,
  clientLat, clientLng,
  storeName,
  storeLogo,
  routePolylineJson,
  distanciaKm, tempoEstimadoMin,
  fullscreen = false,
  motoboyCity,
  motoboyName,
  motoboyAvatar,
  mapHeightClass = 'h-44',
}: OfferMiniMapProps) {
  const hasMotoboy = motoboyLat != null && motoboyLng != null;
  const hasStore   = storeLat != null && storeLng != null;
  const hasClient  = clientLat != null && clientLng != null;

  // Distâncias
  const distMotoboyToStore = hasMotoboy && hasStore
    ? haversine(motoboyLat!, motoboyLng!, storeLat!, storeLng!)
    : null;

  const distStoreToClient =
    (distanciaKm && distanciaKm > 0)
      ? distanciaKm
      : (hasStore && hasClient ? haversine(storeLat!, storeLng!, clientLat!, clientLng!) : null);

  // Marcadores para o SimpleMap
  const markers: MapMarker[] = useMemo(() => {
    const m: MapMarker[] = [];
    if (hasMotoboy) {
      m.push({
        id: 'motoboy',
        lat: motoboyLat!,
        lng: motoboyLng!,
        type: 'motoboy',
        label: motoboyName ? `Motoboy ${motoboyName}` : 'Motoboy',
        sublabel: motoboyCity || undefined,
        avatar_url: motoboyAvatar || undefined,
      });
    }
    if (hasStore) {
      m.push({
        id: 'pickup',
        lat: storeLat!,
        lng: storeLng!,
        type: 'origin',
        label: storeName || 'Loja',
        avatar_url: storeLogo || undefined,
      });
    }
    if (hasClient) {
      m.push({
        id: 'destination',
        lat: clientLat!,
        lng: clientLng!,
        type: 'destination',
        label: 'Cliente',
      });
    }
    return m;
  }, [hasMotoboy, hasStore, hasClient, motoboyLat, motoboyLng, storeLat, storeLng, clientLat, clientLng, storeName, motoboyCity]);

  // Polyline completa: motoboy → loja → cliente (pontos concatenados)
  const fullPolyline = useMemo<[number, number][] | undefined>(() => {
    const points: [number, number][] = [];
    
    // Ponto 1: motoboy
    if (hasMotoboy) {
      points.push([motoboyLat!, motoboyLng!]);
    }
    
    // Ponto 2: loja
    if (hasStore) {
      points.push([storeLat!, storeLng!]);
    }
    
    // Ponto 3: cliente
    if (hasClient) {
      points.push([clientLat!, clientLng!]);
    }
    
    return points.length >= 2 ? points : undefined;
  }, [hasMotoboy, hasStore, hasClient, motoboyLat, motoboyLng, storeLat, storeLng, clientLat, clientLng]);

  const hasAnyPoint = hasMotoboy || hasStore || hasClient;

  // ── FULLSCREEN ──
  if (fullscreen) {
    return (
      <div className="w-full h-full relative">
        {hasAnyPoint ? (
          <SimpleMap
            markers={markers}
            showRoute={true}
            useRealRoute={true}
            preCalculatedPolyline={fullPolyline}
            routeColor="orange"
            className="w-full h-full"
          />
        ) : (
          <div className="w-full h-full bg-[#111] flex items-center justify-center">
            <p className="text-xs text-white/30 animate-pulse">Obtendo localização…</p>
          </div>
        )}

        {/* Badge de distância */}
        {distStoreToClient != null && hasStore && hasClient && (
          <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none flex justify-center pt-2 px-4">
            <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md border border-[#FF6A00]/50 rounded-full px-4 py-1.5 shadow-lg w-full max-w-xs justify-center">
              <span className="w-2 h-2 rounded-full bg-[#1F6F4A] shrink-0" />
              <span className="text-[11px] font-bold text-white/70">Loja</span>
              <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="w-1.5 h-px bg-[#00ff00]/70" />
                ))}
              </div>
              <span className="text-sm font-black text-[#00ff00]">{fmtKm(distStoreToClient)}</span>
              <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="w-1.5 h-px bg-[#00ff00]/70" />
                ))}
              </div>
              <span className="text-[11px] font-bold text-white/70">Cliente</span>
              <span className="w-2 h-2 rounded-full bg-[#00ff00] shrink-0" />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── MINI (card compacto) ──
  return (
    <div className="space-y-2">
      {/* Mapa */}
      <div className={`rounded-xl overflow-hidden ${mapHeightClass} border border-border relative`}>
        {hasAnyPoint ? (
          <SimpleMap
            markers={markers}
            showRoute={true}
            useRealRoute={true}
            preCalculatedPolyline={fullPolyline}
            routeColor="orange"
            className="w-full h-full"
          />
        ) : (
          <div className="absolute inset-0 bg-muted/60 backdrop-blur-sm flex items-center justify-center">
            <p className="text-xs text-muted-foreground font-medium animate-pulse">Obtendo localização…</p>
          </div>
        )}
      </div>

      {/* 3 pontos */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/30 rounded-lg px-2 py-1.5">
          <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
            <Bike className="h-2.5 w-2.5 text-[#ffb800]" /> Motoboy
          </p>
          {hasMotoboy ? (
            <p className="text-[10px] font-bold text-foreground/80 truncate">
              {motoboyCity || 'Localização'}
            </p>
          ) : (
            <Skeleton className="h-3 w-full mt-0.5" />
          )}
        </div>
        <div className="bg-muted/30 rounded-lg px-2 py-1.5">
          <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
            <Store className="h-2.5 w-2.5 text-[#1F6F4A]" /> Loja
          </p>
          {hasStore ? (
            <p className="text-[10px] font-bold text-foreground/80 truncate">
              {storeName || 'Loja'}
            </p>
          ) : (
            <Skeleton className="h-3 w-full mt-0.5" />
          )}
        </div>
        <div className="bg-muted/30 rounded-lg px-2 py-1.5">
          <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
            <MapPin className="h-2.5 w-2.5 text-[#FF6A00]" /> Cliente
          </p>
          {hasClient ? (
            <p className="text-[10px] font-bold text-foreground/80 truncate">
              📍 Destino
            </p>
          ) : (
            <Skeleton className="h-3 w-full mt-0.5" />
          )}
        </div>
      </div>

      {/* Distâncias */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/30 rounded-lg p-2 text-center">
          <Route className="h-3 w-3 mx-auto text-[#ffb800] mb-0.5" />
          {distMotoboyToStore != null ? (
            <p className="text-xs font-bold">{fmtKm(distMotoboyToStore)}</p>
          ) : (
            <Skeleton className="h-3.5 w-10 mx-auto" />
          )}
          <p className="text-[9px] text-muted-foreground">até a loja</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-2 text-center">
          <Route className="h-3 w-3 mx-auto text-[#1F6F4A] mb-0.5" />
          {distStoreToClient != null ? (
            <p className="text-xs font-bold">{fmtKm(distStoreToClient)}</p>
          ) : (
            <Skeleton className="h-3.5 w-10 mx-auto" />
          )}
          <p className="text-[9px] text-muted-foreground">loja → cliente</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-2 text-center">
          <Clock className="h-3 w-3 mx-auto text-muted-foreground mb-0.5" />
          {tempoEstimadoMin != null && tempoEstimadoMin > 0 ? (
            <p className="text-xs font-bold">{tempoEstimadoMin} min</p>
          ) : (
            <Skeleton className="h-3.5 w-10 mx-auto" />
          )}
          <p className="text-[9px] text-muted-foreground">tempo est.</p>
        </div>
      </div>
    </div>
  );
}
