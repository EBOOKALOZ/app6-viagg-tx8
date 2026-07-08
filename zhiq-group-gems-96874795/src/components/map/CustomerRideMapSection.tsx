import { useMemo, useEffect, useCallback, useRef } from "react";
import { MapboxPremiumMap, PremiumMapMarker, MapErrorBoundary } from "@/components/map/MapboxPremiumMap";
import { parseCoordinates } from "@/lib/coordinateParser";
import { toast } from "sonner";

// Espelha o DeliveryMapSection do LOJISTA, adaptado para o CLIENTE anônimo
// chamar motoboy: balão verde = COLETA (quem chama), balão laranja = DESTINO
// com o campo "colar coordenadas do WhatsApp" embutido + rota animada.

/** Profissional online exibido como marcador ao vivo no mapa (só visualização). */
export interface LiveProfessionalMarker {
  id: string;
  lat: number;
  lng: number;
  category: "motoboy" | "mototaxi" | "driver";
  name: string;
  vehicle: string;
  distanceKm: number;
  etaMin: number;
  rating: number;
  status?: string;
}

// Cores/labels por categoria — combinam com os balões de coleta (verde) e
// destino (laranja) já usados neste mapa, e não têm relação com fluxo
// financeiro/regras de aceite: é só a cor do pin.
const PRO_CATEGORY_COLOR: Record<LiveProfessionalMarker["category"], string> = {
  motoboy: "#22C55E",
  mototaxi: "#FF6A00",
  driver: "#3B82F6",
};
const PRO_CATEGORY_LABEL: Record<LiveProfessionalMarker["category"], string> = {
  motoboy: "Motoboy",
  mototaxi: "Moto-Táxi",
  driver: "Motorista",
};

function buildProfessionalPopupHtml(p: LiveProfessionalMarker): string {
  const color = PRO_CATEGORY_COLOR[p.category] || "#6B7280";
  const label = PRO_CATEGORY_LABEL[p.category] || "Profissional";
  const isBusy = p.status === "in_delivery";
  const statusLabel = isBusy ? "Em atendimento" : "Online";
  const statusColor = isBusy ? "#F59E0B" : "#22C55E";
  return `<div style="background-color:${color};border-radius:12px;padding:10px 14px;font-family:'Inter',sans-serif;display:flex;flex-direction:column;gap:5px;color:#FFF;min-width:190px;box-shadow:0 4px 16px rgba(0,0,0,0.25);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:5px;">
        <span style="font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;">${p.name || label}</span>
        <span style="font-size:9px;font-weight:700;background:rgba(255,255,255,0.2);border-radius:6px;padding:2px 6px;text-transform:uppercase;white-space:nowrap;">${label}</span>
      </div>
      ${p.vehicle ? `<div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.9);">${p.vehicle}</div>` : ''}
      <div style="display:flex;gap:8px;font-size:11px;font-weight:700;">
        <span>📍 ${p.distanceKm.toFixed(1)}km</span>
        <span>⏱ ${p.etaMin}min</span>
        <span>⭐ ${p.rating.toFixed(1)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="width:6px;height:6px;border-radius:50%;background:${statusColor};display:inline-block;"></span>
        <span style="font-size:10px;font-weight:700;">${statusLabel}</span>
      </div>
    </div>`;
}

interface CustomerRideMapSectionProps {
  center: { lat: number; lng: number };
  pickup?: { lat: number; lng: number } | null;
  destCoords: { lat: number; lng: number } | null;
  routeInfo: { distanceKm: number; durationMin: number; polyline: [number, number][] } | null;
  customerName?: string;
  /** Arrastar/clicar/colar → atualiza coleta (id='pickup') ou destino (id='destination') */
  onMarkerDragEnd: (id: string, lat: number, lng: number) => void;
  className?: string;
  /** Profissionais online (motoboy/mototaxi/driver) exibidos ao vivo no mapa — só visualização. */
  professionals?: LiveProfessionalMarker[];
  /** Toque num marcador de profissional (ids 'pickup'/'destination' são ignorados). */
  onProfessionalClick?: (id: string) => void;
}

export function CustomerRideMapSection({
  center: centerProp, pickup, destCoords, routeInfo, customerName, onMarkerDragEnd, className = "",
  professionals, onProfessionalClick,
}: CustomerRideMapSectionProps) {
  // Handlers globais dos inputs dentro dos balões (popup é HTML puro):
  // um para o DESTINO e outro para a COLETA (quem chama).
  useEffect(() => {
    const apply = (raw: string, target: "pickup" | "destination") => {
      const text = String(raw || "").trim();
      if (!text) return;
      const parsed = parseCoordinates(text);
      if (!parsed.success || !parsed.coordinates) {
        toast.error(parsed.error || 'Cole um link do WhatsApp/Google Maps ou "lat, lng".');
        return;
      }
      const { latitude, longitude } = parsed.coordinates;
      onMarkerDragEnd(target, latitude, longitude);
      toast.success(`${target === "pickup" ? "Coleta" : "Destino"} atualizado: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    };
    (window as any).__viaggPasteCustomerCoords = (raw: string) => apply(raw, "destination");
    (window as any).__viaggPasteCustomerPickup = (raw: string) => apply(raw, "pickup");
    return () => {
      delete (window as any).__viaggPasteCustomerCoords;
      delete (window as any).__viaggPasteCustomerPickup;
    };
  }, [onMarkerDragEnd]);

  const anchor = pickup ?? centerProp;
  const lastCenterRef = useRef<{ lat: number; lng: number }>({ lat: anchor.lat, lng: anchor.lng });

  const markers: PremiumMapMarker[] = useMemo(() => {
    const list: PremiumMapMarker[] = [];
    if (pickup) {
      list.push({
        id: "pickup",
        lat: pickup.lat,
        lng: pickup.lng,
        type: "store",
        label: "Coleta",
        draggable: true,
        autoPopup: true,
        popupClassName: "store-green-tooltip",
        nativeColor: "#1F6F4A",
        popupHtml: `<div style="background-color:#1F6F4A;border-radius:12px;padding:10px 14px;font-family:'Inter',sans-serif;display:flex;flex-direction:column;gap:6px;color:#FFF;min-width:210px;box-shadow:0 4px 16px rgba(31,111,74,0.3);">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.2);border:1.5px solid white;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;">📍</div>
              <div style="flex:1;">
                <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.8);text-transform:uppercase;">Coleta</div>
                <div style="font-size:14px;font-weight:800;margin-top:1px;">Quem chama</div>
              </div>
            </div>
            <div style="padding-top:4px;border-top:1px solid rgba(255,255,255,0.2);">
              <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">📍 Colar coordenadas do WhatsApp</div>
              <input type="text" placeholder="Cole o link ou lat, lng aqui..."
                onpaste="setTimeout(() => { if (window.__viaggPasteCustomerPickup) window.__viaggPasteCustomerPickup(event.target.value || event.clipboardData?.getData('text') || ''); }, 50)"
                onchange="if (window.__viaggPasteCustomerPickup) window.__viaggPasteCustomerPickup(this.value)"
                style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.4);background:rgba(0,0,0,0.25);color:#FFF;font-size:11px;outline:none;box-sizing:border-box;" />
            </div>
          </div>`,
      });
    }
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
        popupHtml: `<div style="background-color:#FF6A00;border-radius:12px;padding:10px 14px;font-family:'Inter',sans-serif;display:flex;flex-direction:column;gap:4px;color:#FFF;min-width:210px;box-shadow:0 4px 16px rgba(255,106,0,0.3);">
            <div style="font-size:13px;font-weight:800;letter-spacing:0.5px;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:6px;margin-bottom:4px;">
              ${customerName ? customerName.toUpperCase() : 'DESTINO DA ENTREGA'}
            </div>
            <div style="margin-top:2px;">
              <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">📍 Colar coordenadas do WhatsApp</div>
              <input type="text" placeholder="Cole o link ou lat, lng aqui..."
                onpaste="setTimeout(() => { if (window.__viaggPasteCustomerCoords) window.__viaggPasteCustomerCoords(event.target.value || event.clipboardData?.getData('text') || ''); }, 50)"
                onchange="if (window.__viaggPasteCustomerCoords) window.__viaggPasteCustomerCoords(this.value)"
                style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.4);background:rgba(0,0,0,0.25);color:#FFF;font-size:11px;outline:none;box-sizing:border-box;" />
            </div>
            ${routeInfo?.distanceKm ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;gap:4px;">
              <span style="font-size:12px;">📍</span><span style="font-size:12px;font-weight:700;">${routeInfo.distanceKm.toFixed(1)} km</span>
            </div>` : ''}
          </div>`,
      });
    }
    return list;
  }, [pickup, destCoords, routeInfo?.distanceKm, customerName]);

  // Marcadores de profissionais online — extras, concatenados aos de coleta/destino.
  // skipBounds: true para não afetar o fitBounds/zoom do mapa (que deve seguir
  // coleta+destino), só a visualização de quem está por perto.
  const professionalMarkers: PremiumMapMarker[] = useMemo(() => {
    return (professionals || []).map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      type: "motoboy" as const,
      nativeColor: PRO_CATEGORY_COLOR[p.category] || "#6B7280",
      popupHtml: buildProfessionalPopupHtml(p),
      popupClassName: "pro-marker-tooltip",
      skipBounds: true,
    }));
  }, [professionals]);

  const allMarkers: PremiumMapMarker[] = useMemo(
    () => [...markers, ...professionalMarkers],
    [markers, professionalMarkers],
  );

  // Toque num marcador → se for profissional (não 'pickup'/'destination'), notifica o pai.
  const handleMarkerClick = useCallback((id: string) => {
    if (id === "pickup" || id === "destination") return;
    onProfessionalClick?.(id);
  }, [onProfessionalClick]);

  const center = useMemo(() => {
    const c = { lat: anchor.lat, lng: anchor.lng };
    const prev = lastCenterRef.current;
    if (Math.abs(prev.lat - c.lat) > 0.0001 || Math.abs(prev.lng - c.lng) > 0.0001) {
      lastCenterRef.current = c;
      return c;
    }
    return prev;
  }, [anchor.lat, anchor.lng]);

  const polyline = useMemo(() => {
    if (!destCoords || !routeInfo?.polyline || routeInfo.polyline.length < 2) return undefined;
    return routeInfo.polyline;
  }, [destCoords, routeInfo?.polyline]);

  const showRoute = !!destCoords && !!polyline && markers.length >= 2;

  const handleMapClick = useCallback((lat: number, lng: number) => {
    // Clicar move o balão MAIS PRÓXIMO do ponto clicado (coleta ou destino)
    const dist = (aLat: number, aLng: number, bLat: number, bLng: number) =>
      Math.hypot(aLat - bLat, aLng - bLng);
    const dPickup = pickup ? dist(lat, lng, pickup.lat, pickup.lng) : Infinity;
    const dDest = destCoords ? dist(lat, lng, destCoords.lat, destCoords.lng) : Infinity;
    if (!destCoords) {
      // ainda não há destino → o clique define o destino
      onMarkerDragEnd("destination", lat, lng);
    } else if (dPickup <= dDest) {
      onMarkerDragEnd("pickup", lat, lng);
    } else {
      onMarkerDragEnd("destination", lat, lng);
    }
  }, [pickup, destCoords, onMarkerDragEnd]);

  return (
    <div className={`customer-ride-map relative w-full h-full ${className}`}>
      {/* Clareia ~30% só as tiles do mapa (canvas) + reduz os balões em 50% */}
      <style>{`
        .customer-ride-map .mapboxgl-canvas { filter: brightness(1.3) saturate(1.05); }
        .customer-ride-map .mapboxgl-popup-content { transform: scale(0.575); transform-origin: bottom center; }
      `}</style>

      {/* Mini-informação: como ajustar os balões de endereço */}
      <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-[500]">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm border border-white/10 text-white text-[11px] font-semibold shadow-lg whitespace-nowrap">
          <span>👆</span>
          <span>Clique perto de um balão (ou arraste-o) para ajustar o endereço</span>
        </div>
      </div>

      <MapErrorBoundary className="w-full h-full">
        <MapboxPremiumMap
          markers={allMarkers}
          center={center}
          zoom={destCoords ? 14 : 15.5}
          showRoute={showRoute}
          routePolyline={polyline}
          routeColor="#FF6A00"
          className="w-full h-full"
          onMarkerDragEnd={onMarkerDragEnd}
          onMapClick={handleMapClick}
          onMarkerClick={handleMarkerClick}
          hqMode
        />
      </MapErrorBoundary>
    </div>
  );
}
