import { useMemo, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { MapboxPremiumMap, PremiumMapMarker, MapErrorBoundary } from "@/components/map/MapboxPremiumMap";

interface StoreCoords {
  latitude: number;
  longitude: number;
  nome_loja: string;
  logo_url?: string;
}

interface RouteInfo {
  distanceKm: number;
  durationMin: number;
  polyline: [number, number][];
}

interface DeliveryMapSectionProps {
  store: StoreCoords;
  destCoords: { lat: number; lng: number } | null;
  routeInfo: RouteInfo | null;
  onMarkerDragEnd: (id: string, lat: number, lng: number) => void;
  isDesktopFullHeight?: boolean;
  isMapSelectMode?: boolean;
  tempDestCoords?: { lat: number; lng: number } | null;
  onMapMouseMove?: (lat: number, lng: number) => void;
  destDetails?: { bairro: string; cidade: string; estado: string } | null;
  customerName?: string;
  customerPhone?: string;
}

export function DeliveryMapSection({ store, destCoords, routeInfo, onMarkerDragEnd, isDesktopFullHeight, isMapSelectMode, tempDestCoords, onMapMouseMove, destDetails, customerName, customerPhone }: DeliveryMapSectionProps) {
  const lastCenterRef = useRef<{ lat: number; lng: number }>({ lat: store.latitude, lng: store.longitude });

  const markers: PremiumMapMarker[] = useMemo(() => {
    const list: PremiumMapMarker[] = [
      {
        id: "store",
        lat: store.latitude,
        lng: store.longitude,
        type: "store",
        label: store.nome_loja,
        autoPopup: true,
        popupClassName: "store-green-tooltip",
        popupHtml: `<div style="background-color: #1F6F4A; border-radius: 12px; padding: 10px 14px; font-family: 'Inter', sans-serif; display: flex; align-items: center; gap: 10px; color: #FFFFFF; min-width: 180px; box-shadow: 0 4px 16px rgba(31,111,74,0.3); position: relative;">
                        ${store.logo_url
            ? `<img src="${store.logo_url}" alt="Logo" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1.5px solid white; flex-shrink: 0;" />`
            : `<div style="width: 32px; height: 32px; border-radius: 50%; background-color: rgba(255,255,255,0.2); border: 1.5px solid white; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0;">🏪</div>`}
                        <div style="flex: 1; padding-right: 8px;">
                            <div style="font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.8); text-transform: uppercase;">Loja</div>
                            <div style="font-size: 14px; font-weight: 800; margin-top: 1px;">${store.nome_loja || 'Sem Nome'}</div>
                        </div>
                    </div>`,
        distance_km: routeInfo?.distanceKm || 0,
        eta_min: routeInfo?.durationMin || 0,
        logo_url: store.logo_url,
        nativeColor: "#1F6F4A",
      },
    ];
    if (destCoords) {
      list.push({
        id: "destination",
        lat: destCoords.lat,
        lng: destCoords.lng,
        type: "destination",
        label: "Destino",
        draggable: true,
        autoPopup: true,
        popupClassName: "store-orange-tooltip",
        popupHtml: `<div style="background-color: #FF6A00; border-radius: 12px; padding: 10px 14px; font-family: 'Inter', sans-serif; display: flex; flex-direction: column; gap: 4px; color: #FFFFFF; min-width: 200px; box-shadow: 0 4px 16px rgba(255,106,0,0.3); position: relative;">
                        <div style="font-size: 13px; font-weight: 800; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 6px; margin-bottom: 4px;">
                          ${customerName ? customerName.toUpperCase() : 'CLIENTE'}
                        </div>

                        ${customerPhone ? `
                        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                            <span style="font-size: 14px;">📱</span>
                            <div>
                              <div style="font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.75); text-transform: uppercase; letter-spacing: 0.05em;">WhatsApp</div>
                              <div style="font-size: 13px; font-weight: 800; color: #FFFFFF;">
                                ${customerPhone.replace(/\D/g, "").replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3")}
                              </div>
                            </div>
                        </div>` : `
                        <div style="font-size: 11px; color: rgba(255,255,255,0.6); font-style: italic;">Telefone não informado</div>`}

                        ${destDetails ? `
                        <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.15);">
                            <div style="font-size: 11px; font-weight: 700; color: #FFFFFF;">${destDetails.bairro || ''} — ${destDetails.cidade || ''}</div>
                        </div>` : ''}

                        ${routeInfo?.distanceKm ? `
                        <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.15); display: flex; align-items: center; gap: 4px;">
                          <span style="font-size: 12px;">📍</span>
                          <span style="font-size: 12px; font-weight: 700;">${routeInfo.distanceKm.toFixed(1)} km da loja</span>
                        </div>` : ''}
                    </div>`,
      });
    }

    if (isMapSelectMode && tempDestCoords) {
      list.push({
        id: "destination-ghost",
        lat: tempDestCoords.lat,
        lng: tempDestCoords.lng,
        type: "destination",
        label: "Destino",
        nativeColor: "rgba(255, 106, 0, 0.5)",
        autoPopup: false,
        popupClassName: "store-orange-tooltip",
        popupHtml: `<div style="background-color: #FF6A00; border-radius: 12px; padding: 10px 14px; font-family: 'Inter', sans-serif; display: flex; flex-direction: column; gap: 4px; color: #FFFFFF; min-width: 180px; box-shadow: 0 4px 16px rgba(255,106,0,0.3); position: relative; opacity: 0.8;">
                        <div style="font-size: 13px; font-weight: 800; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 6px; margin-bottom: 2px;">CLIENTE</div>
                        <div style="font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.9);">Coordenadas do destino:</div>
                        <div style="font-size: 11px; font-family: monospace; color: #FFFFFF;">Lat: ${tempDestCoords.lat.toFixed(6)}</div>
                        <div style="font-size: 11px; font-family: monospace; color: #FFFFFF;">Lng: ${tempDestCoords.lng.toFixed(6)}</div>
                    </div>`,
      });
    }

    return list;
  }, [store.latitude, store.longitude, store.nome_loja, destCoords, routeInfo?.distanceKm, routeInfo?.durationMin, isMapSelectMode, tempDestCoords, destDetails, customerName, customerPhone]);

  const center = useMemo(() => {
    const c = { lat: store.latitude, lng: store.longitude };
    const prev = lastCenterRef.current;
    if (Math.abs(prev.lat - c.lat) > 0.0001 || Math.abs(prev.lng - c.lng) > 0.0001) {
      lastCenterRef.current = c;
      return c;
    }
    return prev;
  }, [store.latitude, store.longitude]);

  const polyline = useMemo(() => {
    if (!destCoords || !routeInfo?.polyline || routeInfo.polyline.length < 2) return undefined;
    return routeInfo.polyline;
  }, [destCoords, routeInfo?.polyline]);
  const showRoute = !!destCoords && !!polyline && markers.length >= 2;

  const handleMapClick = useCallback((lat: number, lng: number) => {
    onMarkerDragEnd("destination", lat, lng);
  }, [onMarkerDragEnd]);

  if (isDesktopFullHeight) {
    return (
      <div className="relative w-full h-full min-h-[500px]">
        <MapErrorBoundary className="w-full h-full min-h-[500px]">
          <MapboxPremiumMap
            markers={markers}
            center={center}
            zoom={destCoords ? 14 : 15.5}
            showRoute={showRoute}
            routePolyline={polyline}
            className="w-full h-full"
            onMarkerDragEnd={onMarkerDragEnd}
            onMapClick={handleMapClick}
            onMapMouseMove={onMapMouseMove}
            isMapSelectMode={isMapSelectMode}
            hqMode
          />
        </MapErrorBoundary>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden rounded-xl shadow-2xl shadow-black/50 border border-white/5 bg-zinc-950/50">
      <CardContent className="p-0">
        <div className="relative w-full h-[600px] min-h-[600px] rounded-xl flex-shrink-0">
          <MapErrorBoundary className="w-full h-full rounded-xl">
            <MapboxPremiumMap
              markers={markers}
              center={center}
              zoom={destCoords ? 14 : 15.5}
              showRoute={showRoute}
              routePolyline={polyline}
              className="rounded-xl"
              onMarkerDragEnd={onMarkerDragEnd}
              onMapClick={handleMapClick}
              onMapMouseMove={onMapMouseMove}
              isMapSelectMode={isMapSelectMode}
              hqMode
            />
          </MapErrorBoundary>
        </div>
      </CardContent>
    </Card>
  );
}
