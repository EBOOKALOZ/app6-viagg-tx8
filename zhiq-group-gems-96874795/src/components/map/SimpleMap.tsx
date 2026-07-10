import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Store, MapPin, Bike, User, Navigation } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { supabase } from '@/integrations/supabase/client';
import { calculateRoute as fetchMapboxRoute } from '@/skills/maps/routeService';

// Fix for default markers not showing
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export interface MarkerPopupData {
  title: string;
  address?: string;
  distance?: string;
  value?: string;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  type: 'origin' | 'destination' | 'motoboy' | 'user';
  label?: string;
  /** Segunda linha abaixo do label (ex: endereço do motoboy) */
  sublabel?: string;
  draggable?: boolean;
  popup?: MarkerPopupData;
  /** URL da foto/avatar para exibir no marcador (substitui o ícone) */
  avatar_url?: string;
}

interface SimpleMapProps {
  markers: MapMarker[];
  center?: { lat: number; lng: number };
  zoom?: number;
  className?: string;
  showRoute?: boolean;
  useRealRoute?: boolean;
  focusMarkerId?: string;
  routePhase?: 'to_pickup' | 'to_destination';
  /** Cor da rota principal (2 pontos). Default: 'orange'. */
  routeColor?: 'orange' | 'green';
  preCalculatedPolyline?: [number, number][];
  onMarkerDragEnd?: (markerId: string, lat: number, lng: number) => void;
}

// Professional Mapbox map tile providers (navigation style)
const MAPBOX_STYLE_URL = 'https://api.mapbox.com/styles/v1/mapbox/navigation-day-v1/tiles/{z}/{x}/{y}?access_token=';

// Fallback CartoDB tiles (if Mapbox fails)
const MAP_TILES = {
  voyager: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  positron: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
};

// Create custom div icon for markers with label - POLISHED VERSION
function createCustomIcon(type: MapMarker['type'], label?: string, avatarUrl?: string, popup?: MarkerPopupData, sublabel?: string): L.DivIcon {
  const config = {
    origin: {
      gradient: 'linear-gradient(135deg,#fbbf24 0%,#d97706 100%)',
      shadowColor: 'rgba(245,158,11,0.4)',
      Icon: Store,
      defaultLabel: 'Embarque',
      pulse: false,
    },
    destination: {
      gradient: 'linear-gradient(135deg,#34d399 0%,#059669 100%)',
      shadowColor: 'rgba(16,185,129,0.4)',
      Icon: Navigation,
      defaultLabel: 'Destino',
      pulse: false,
    },
    motoboy: {
      gradient: 'linear-gradient(135deg,#f97316 0%,#ea580c 100%)',
      shadowColor: 'rgba(249,115,22,0.5)',
      Icon: Bike,
      defaultLabel: 'Motoboy',
      pulse: true,
    },
    user: {
      gradient: 'linear-gradient(135deg,#2dd4bf 0%,#0d9488 100%)',
      shadowColor: 'rgba(20,184,166,0.4)',
      Icon: User,
      defaultLabel: 'Você',
      pulse: true,
    },
  };

  const { gradient, shadowColor, Icon, defaultLabel, pulse } = config[type];
  const displayLabel = label || defaultLabel;
  const safeLabel = displayLabel.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeSublabel = sublabel ? sublabel.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
  const sublabelStyle = [
    'margin-top:2px',
    'padding:2px 10px',
    'background:rgba(249,115,22,0.92)',
    'color:#fff',
    'font-size:10px',
    'font-weight:600',
    'border-radius:9999px',
    'white-space:nowrap',
    'max-width:220px',
    'overflow:hidden',
    'text-overflow:ellipsis',
    'box-shadow:0 6px 12px -2px rgba(0,0,0,0.2)',
  ].join(';');
  const sublabelHtml = safeSublabel
    ? `<div style="${sublabelStyle}">${safeSublabel}</div>`
    : '';

  // ═══ MEGA CARD for origin markers with popup data ═══
  if (type === 'origin' && popup) {
    const safeTitle = (popup.title || safeLabel).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safeAddress = popup.address
      ? popup.address.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      : null;

    const wrapper = document.createElement('div');
    wrapper.className = 'marker-container';
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;';

    const storeSvg = renderLucideToSvg(Store);

    const logoHtml = avatarUrl
      ? `<img src="${avatarUrl}" alt="${safeTitle}" referrerpolicy="no-referrer" decoding="async" style="width:40px;height:40px;border-radius:12px;object-fit:cover;border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 8px rgba(0,0,0,0.15);flex-shrink:0;background:#fff;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="display:none;width:40px;height:40px;border-radius:12px;background:${gradient};border:2px solid #fff;flex-shrink:0;align-items:center;justify-content:center;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.15);">${storeSvg}</div>`
      : `<div style="width:40px;height:40px;border-radius:12px;background:${gradient};border:2px solid #fff;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.15);">${storeSvg}</div>`;

    const addressHtml = safeAddress
      ? `<div style="font-size:10px;color:rgba(255,255,255,0.7);margin-top:2px;line-height:1.3;max-width:160px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${safeAddress}</div>`
      : '';

    wrapper.innerHTML = `
      <div style="
        display:flex;align-items:center;gap:10px;
        padding:10px 14px 10px 10px;
        background:rgba(17,24,39,0.92);
        backdrop-filter:blur(12px);
        border-radius:16px;
        border:1px solid rgba(255,255,255,0.12);
        box-shadow:0 12px 40px rgba(0,0,0,0.25),0 4px 12px rgba(0,0,0,0.1);
        white-space:nowrap;
        max-width:260px;
      ">
        ${logoHtml}
        <div style="min-width:0;flex:1;">
          <div style="font-size:13px;font-weight:700;color:#fff;letter-spacing:-0.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;">${safeTitle}</div>
          ${addressHtml}
        </div>
      </div>
      <div style="
        width:0;height:0;margin-top:-2px;
        border-left:10px solid transparent;
        border-right:10px solid transparent;
        border-top:12px solid rgba(17,24,39,0.92);
        filter:drop-shadow(0 2px 3px rgba(0,0,0,0.2));
      "></div>
    `;

    const cardW = safeAddress ? 240 : 180;
    return L.divIcon({
      html: wrapper as unknown as string,
      className: 'custom-marker-pro',
      iconSize: [cardW, 90],
      iconAnchor: [cardW / 2, 88],
    });
  }

  // ═══ MEGA MOTO icon for motoboy type ═══
  if (type === 'motoboy') {
    const nameEl = (label || 'Motoboy').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // FOTO do motoboy quando existir (avatar do perfil); emoji 🏍️ é só fallback
    const safeAvatar = avatarUrl ? avatarUrl.replace(/"/g, '&quot;') : '';
    const innerContent = safeAvatar
      ? `<img src="${safeAvatar}" alt="${nameEl}"
             style="width:100%;height:100%;object-fit:cover;border-radius:50%;"
             onerror="this.outerHTML='🏍️';" />`
      : '🏍️';
    const wrapper = document.createElement('div');
    wrapper.className = 'marker-container marker-pulse';
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
    wrapper.innerHTML = `
      <div style="
        width:64px;height:64px;
        border-radius:50%;
        background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);
        border:3px solid #fff;
        box-shadow:0 0 0 4px rgba(249,115,22,0.3),0 12px 24px -4px rgba(249,115,22,0.5);
        display:flex;align-items:center;justify-content:center;
        font-size:32px;line-height:1;
        overflow:hidden;
      ">${innerContent}</div>
      <div style="
        width:0;height:0;margin-top:-4px;
        border-left:9px solid transparent;border-right:9px solid transparent;
        border-top:11px solid #fff;
        filter:drop-shadow(0 2px 2px rgba(0,0,0,0.15));
      "></div>
      <div style="
        margin-top:4px;padding:4px 12px;
        background:rgba(234,88,12,0.95);
        backdrop-filter:blur(4px);
        color:#fff;font-size:11px;font-weight:700;
        border-radius:9999px;white-space:nowrap;
        box-shadow:0 4px 12px rgba(234,88,12,0.4);
        border:1px solid rgba(255,255,255,0.2);
      ">${nameEl}</div>
    `;
    return L.divIcon({
      html: wrapper as unknown as string,
      className: 'custom-marker-pro',
      iconSize: [64, 96],
      iconAnchor: [32, 84],
    });
  }

  // ═══ Standard circle/avatar marker ═══
  const circleStyle = [
    'position:relative',
    'width:48px',
    'height:48px',
    'border-radius:50%',
    `background:${gradient}`,
    'border:3px solid #fff',
    `box-shadow:0 10px 15px -3px ${shadowColor},0 4px 6px -4px ${shadowColor}`,
    'overflow:hidden',
    'display:flex',
    'align-items:center',
    'justify-content:center',
  ].join(';');

  const pointStyle = [
    'width:0',
    'height:0',
    'margin-top:-4px',
    'border-left:8px solid transparent',
    'border-right:8px solid transparent',
    'border-top:10px solid #fff',
    'filter:drop-shadow(0 2px 2px rgba(0,0,0,0.15))',
  ].join(';');

  const labelStyle = [
    'margin-top:4px',
    'padding:4px 12px',
    'background:rgba(17,24,39,0.9)',
    'backdrop-filter:blur(4px)',
    'color:#fff',
    'font-size:11px',
    'font-weight:600',
    'border-radius:9999px',
    'white-space:nowrap',
    'box-shadow:0 10px 15px -3px rgba(0,0,0,0.1)',
    'border:1px solid rgba(255,255,255,0.1)',
  ].join(';');

  const wrapper = document.createElement('div');
  wrapper.className = `marker-container${pulse ? ' marker-pulse' : ''}`;
  wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;';

  if (avatarUrl) {
    // Image inline inside circle — rendered directly in HTML
    const imgStyle = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;background:#fff;';
    const iconSvg = renderLucideToSvg(Icon);
    wrapper.innerHTML = `
      <div style="${circleStyle}">
        <img
          src="${avatarUrl}"
          alt="${safeLabel}"
          referrerpolicy="no-referrer"
          decoding="async"
          style="${imgStyle}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
        />
        <div style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#fff;">
          ${iconSvg}
        </div>
      </div>
      <div style="${pointStyle}"></div>
      <div style="${labelStyle}">${safeLabel}</div>
      ${sublabelHtml}
    `;
  } else {
    const iconContainer = document.createElement('div');
    const circle = document.createElement('div');
    circle.style.cssText = circleStyle;
    const inner = document.createElement('div');
    inner.style.cssText = 'color:#fff;display:flex;align-items:center;justify-content:center;';
    circle.appendChild(inner);
    const root = createRoot(inner);
    root.render(<Icon size={24} strokeWidth={2.5} />);
    wrapper.appendChild(circle);

    const point = document.createElement('div');
    point.style.cssText = pointStyle;
    wrapper.appendChild(point);

    const labelEl = document.createElement('div');
    labelEl.style.cssText = labelStyle;
    labelEl.textContent = displayLabel;
    wrapper.appendChild(labelEl);

    if (sublabel) {
      const subEl = document.createElement('div');
      subEl.style.cssText = sublabelStyle;
      subEl.textContent = sublabel;
      wrapper.appendChild(subEl);
    }
    iconContainer; // no-op to keep layout
  }

  return L.divIcon({
    html: wrapper as unknown as string,
    className: 'custom-marker-pro',
    iconSize: [48, 72],
    iconAnchor: [24, 60],
  });
}

// Render a lucide icon component to inline SVG string (sync, for HTML embed)
function renderLucideToSvg(IconComponent: any): string {
  // Lucide icons accept className/size/strokeWidth. We build an SVG placeholder.
  // Use a generic bike SVG as safest fallback (motoboy). For other types this is only used on image error.
  const nameMap = new Map<any, string>();
  nameMap.set(Store, '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><line x1="2" x2="22" y1="7" y2="7"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-2.4-1.5A2.7 2.7 0 0 1 15.2 12a2.7 2.7 0 0 1-2.4-1.5A2.7 2.7 0 0 1 10.4 12a2.7 2.7 0 0 1-2.4-1.5A2.7 2.7 0 0 1 5.6 12a2 2 0 0 1-2-2V7"/><path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/></svg>');
  nameMap.set(Navigation, '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>');
  nameMap.set(Bike, '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>');
  nameMap.set(User, '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>');
  return nameMap.get(IconComponent) ?? nameMap.get(Bike)!;
}

export function SimpleMap({ 
  markers, 
  center, 
  zoom = 15, 
  className = '',
  showRoute = false,
  useRealRoute = false,
  focusMarkerId,
  routePhase = 'to_destination',
  routeColor = 'orange',
  preCalculatedPolyline,
  onMarkerDragEnd,
}: SimpleMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);
  const shadowPolylineRef = useRef<L.Polyline | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][] | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const lastBoundsRef = useRef<string>('');

  // ── Rota REAL por vias: Mapbox Directions PRIMEIRO (token do projeto,
  // confiável) e OSRM público como reserva. Linha reta é o ÚLTIMO recurso,
  // só quando os dois serviços falham.
  const fetchRoadRoute = async (pts: [number, number][]): Promise<[number, number][] | null> => {
    const wp = pts.map(([lat, lng]) => `${lng},${lat}`).join(';');
    const mapboxToken =
      (import.meta as any).env?.VITE_MAPBOX_TOKEN ||
      (import.meta as any).env?.VITE_MAPBOX_PUBLIC_TOKEN;
    const parse = (data: any): [number, number][] | null => {
      const coords = data?.routes?.[0]?.geometry?.coordinates;
      return coords && coords.length >= 2
        ? coords.map((c: [number, number]) => [c[1], c[0]] as [number, number])
        : null;
    };
    if (mapboxToken) {
      try {
        const data = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${wp}?geometries=geojson&overview=full&access_token=${mapboxToken}`,
        ).then(r => r.json());
        const coords = parse(data);
        if (coords) return coords;
      } catch { /* cai no OSRM */ }
    }
    try {
      const data = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${wp}?overview=full&geometries=geojson`,
      ).then(r => r.json());
      return parse(data);
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (preCalculatedPolyline && preCalculatedPolyline.length > 0) {
      console.log('[SimpleMap] Polyline recebida:', preCalculatedPolyline.length, 'pontos');

      // Caso especial: 3 waypoints (motoboy → loja → cliente) — buscar DOIS trechos
      // separados para preservar as cores distintas por segmento.
      if (preCalculatedPolyline.length === 3) {
        const [p0, p1, p2] = preCalculatedPolyline;
        Promise.all([fetchRoadRoute([p0, p1]), fetchRoadRoute([p1, p2])]).then(([r1, r2]) => {
          const coords1 = r1 || [p0, p1];
          const coords2 = r2 || [p1, p2];
          console.log('[SimpleMap] ✅ Rotas duplas por vias:', coords1.length, '+', coords2.length, 'pontos');
          setRouteCoordinates({ coords1, coords2 } as any);
        });
        return;
      }

      // Poucos pontos = waypoints (não rota detalhada) → resolver por vias
      if (preCalculatedPolyline.length <= 10) {
        console.log('[SimpleMap] 🛣️ Buscando rota por vias com', preCalculatedPolyline.length, 'waypoints...');
        fetchRoadRoute(preCalculatedPolyline).then((coords) => {
          if (coords) {
            console.log('[SimpleMap] ✅ Rota por vias obtida:', coords.length, 'pontos');
            setRouteCoordinates(coords);
          } else {
            console.log('[SimpleMap] ⚠️ Mapbox e OSRM falharam — último recurso: linha reta');
            setRouteCoordinates(preCalculatedPolyline);
          }
        });
      } else {
        // Polyline com 10+ pontos já é uma rota detalhada
        console.log('[SimpleMap] ✅ Polyline detalhada, usando diretamente');
        setRouteCoordinates(preCalculatedPolyline);
      }
      return;
    }
    
    if (!useRealRoute || !showRoute || markers.length < 2) {
      setRouteCoordinates(null);
      return;
    }

    const fetchRoute = async () => {
      const originMarker = markers.find(m => m.type === 'origin');
      const destMarker = markers.find(m => m.type === 'destination');
      const motoboyMarker = markers.find(m => m.type === 'motoboy');

      setIsLoadingRoute(true);

      try {
        let origin: { lat: number; lng: number };
        let destination: { lat: number; lng: number };

        if (routePhase === 'to_pickup') {
          if (!motoboyMarker || !originMarker) {
            setIsLoadingRoute(false);
            return;
          }
          origin = { lat: motoboyMarker.lat, lng: motoboyMarker.lng };
          destination = { lat: originMarker.lat, lng: originMarker.lng };
        } else {
          if (!originMarker || !destMarker) {
            setIsLoadingRoute(false);
            return;
          }
          origin = { lat: originMarker.lat, lng: originMarker.lng };
          destination = { lat: destMarker.lat, lng: destMarker.lng };
        }

        // Mapbox Directions primeiro; OSRM de reserva (fetchRoadRoute)
        const coords = await fetchRoadRoute([
          [origin.lat, origin.lng],
          [destination.lat, destination.lng],
        ]);
        if (coords) {
          console.log('[SimpleMap] ✅ Rota real por vias:', coords.length, 'pontos');
          setRouteCoordinates(coords);
        }
      } catch (err) {
        console.error('[SimpleMap] Erro OSRM:', err);
      } finally {
        setIsLoadingRoute(false);
      }
    };

    fetchRoute();
  }, [markers, showRoute, useRealRoute, routePhase, preCalculatedPolyline]);

  // Initialize map with professional Mapbox Navigation tiles
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const defaultCenter: [number, number] = center 
      ? [center.lat, center.lng] 
      : [-23.5505, -46.6333];

    const map = L.map(mapRef.current, {
      center: defaultCenter,
      zoom,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true, // Better rendering performance
    });

    // Add zoom control to bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Fetch Mapbox token from edge function env (via public key in URL)
    const mapboxToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;
    
    if (mapboxToken) {
      // Use Mapbox Navigation Day style for professional look
      L.tileLayer(MAPBOX_STYLE_URL + mapboxToken, {
        maxZoom: 20,
        tileSize: 512,
        zoomOffset: -1,
      }).addTo(map);
    } else {
      // Fallback to CartoDB Voyager (free, no key needed)
      L.tileLayer(MAP_TILES.voyager, {
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(map);
    }

    mapInstanceRef.current = map;
    setMapReady(true);

    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Update center with smooth animation – debounced to prevent jitter
  const lastCenterApplied = useRef<string>('');
  useEffect(() => {
    if (!mapInstanceRef.current || !center) return;
    const key = `${center.lat.toFixed(4)},${center.lng.toFixed(4)},${zoom}`;
    if (key === lastCenterApplied.current) return;
    lastCenterApplied.current = key;
    mapInstanceRef.current.flyTo([center.lat, center.lng], zoom, {
      duration: 0.4,
      easeLinearity: 0.25,
    });
  }, [center, zoom]);

  // Focus on specific marker with smooth animation
  useEffect(() => {
    if (!mapInstanceRef.current || !focusMarkerId) return;
    
    const targetMarker = markers.find(m => m.id === focusMarkerId);
    if (targetMarker) {
      mapInstanceRef.current.flyTo([targetMarker.lat, targetMarker.lng], 17, {
        duration: 0.5,
        easeLinearity: 0.25,
      });
    }
  }, [focusMarkerId, markers]);

  // Update markers and route with smooth transitions
  useEffect(() => {
    if (!mapInstanceRef.current || !mapReady) return;

    // Remove old markers with fade effect
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    
    // Remove old polylines (including glow layer)
    const clearPolylines = () => {
      if (shadowPolylineRef.current) {
        if (Array.isArray(shadowPolylineRef.current)) {
          shadowPolylineRef.current.forEach(p => {
             const glow = (p as any)._glowPolyline;
             if (glow) glow.remove();
             p.remove();
          });
        } else {
          const glow = (shadowPolylineRef.current as any)._glowPolyline;
          if (glow) glow.remove();
          shadowPolylineRef.current.remove();
        }
        shadowPolylineRef.current = null;
      }
      if (polylineRef.current) {
        if (Array.isArray(polylineRef.current)) {
          polylineRef.current.forEach(p => p.remove());
        } else {
          polylineRef.current.remove();
        }
        polylineRef.current = null;
      }
    };
    clearPolylines();

    // Draw professional route with premium shadow/glow effect
    const effectiveRoute = routeCoordinates ?? (preCalculatedPolyline && preCalculatedPolyline.length > 0 ? preCalculatedPolyline : null);

    // Helper: draw a route on the map
    const drawRoute = (coords: L.LatLngExpression[], dashed = false, colorScheme: 'orange' | 'green' = 'orange', append = false) => {
      if (!mapInstanceRef.current) return;
      
      // Remove old if not appending
      if (!append) clearPolylines();

      const isOrange = colorScheme === 'orange';
      
      const colors = isOrange ? {
        glow: '#993D00', shadow: '#CC5500', main: '#FF6A00'
      } : {
        glow: '#004400', shadow: '#00AA33', main: '#00CC44'
      };

      // Glow
      const glowPolyline = L.polyline(coords, {
        color: colors.glow, weight: 14, opacity: 0.15, lineCap: 'round', lineJoin: 'round',
      }).addTo(mapInstanceRef.current);

      // Shadow
      const shadowPolyline = L.polyline(coords, {
        color: colors.shadow, weight: 10, opacity: 0.35, lineCap: 'round', lineJoin: 'round',
      }).addTo(mapInstanceRef.current);

      // Main line
      const polyline = L.polyline(coords, {
        color: colors.main, weight: 7, opacity: 1, lineCap: 'round', lineJoin: 'round',
        ...(dashed ? { dashArray: '12, 8' } : {}),
        className: 'route-polyline-animated',
      }).addTo(mapInstanceRef.current);

      (shadowPolyline as any)._glowPolyline = glowPolyline;

      if (append) {
        if (!Array.isArray(polylineRef.current)) {
          polylineRef.current = polylineRef.current ? [polylineRef.current as any] : [];
        }
        if (!Array.isArray(shadowPolylineRef.current)) {
          shadowPolylineRef.current = shadowPolylineRef.current ? [shadowPolylineRef.current as any] : [];
        }
        (polylineRef.current as L.Polyline[]).push(polyline);
        (shadowPolylineRef.current as L.Polyline[]).push(shadowPolyline);
      } else {
        polylineRef.current = polyline;
        shadowPolylineRef.current = shadowPolyline;
      }
    };

    if (showRoute && markers.length >= 2) {
      const cachedDualLeg = routeCoordinates && (routeCoordinates as any).coords1 && (routeCoordinates as any).coords2;
      const cachedArray = Array.isArray(routeCoordinates) && routeCoordinates.length > 5;

      if (cachedDualLeg) {
        drawRoute((routeCoordinates as any).coords1, false, 'orange', false);
        drawRoute((routeCoordinates as any).coords2, false, 'green', true);
      } else if (cachedArray) {
        drawRoute(routeCoordinates as [number, number][], false, routeColor);
      } else if (effectiveRoute && effectiveRoute.length > 0) {
        // If not cached, proceed with fetching
        if (effectiveRoute.length === 3) {
            if (!polylineRef.current) {
              drawRoute([effectiveRoute[0], effectiveRoute[1]], true, 'orange', false);
              drawRoute([effectiveRoute[1], effectiveRoute[2]], true, 'green', true);
            }
            
            const p0 = { lat: effectiveRoute[0][0], lng: effectiveRoute[0][1] };
            const p1 = { lat: effectiveRoute[1][0], lng: effectiveRoute[1][1] };
            const p2 = { lat: effectiveRoute[2][0], lng: effectiveRoute[2][1] };
            
            Promise.all([
              fetchMapboxRoute(p0, p1),
              fetchMapboxRoute(p1, p2)
            ]).then(([data1, data2]) => {
              clearPolylines();
              const coords1 = data1?.geometry?.coordinates?.map((c: any) => [c[1], c[0]] as [number, number]) || [effectiveRoute[0], effectiveRoute[1]];
              const coords2 = data2?.geometry?.coordinates?.map((c: any) => [c[1], c[0]] as [number, number]) || [effectiveRoute[1], effectiveRoute[2]];
              
              drawRoute(coords1, false, 'orange', false);
              drawRoute(coords2, false, 'green', true);
              setRouteCoordinates({ coords1, coords2 } as any);
            });
          } else {
            // General case (2 points or >3 points)
            if (!polylineRef.current) {
              drawRoute(effectiveRoute, true, routeColor, false);
            }

            if (effectiveRoute.length === 2) {
              const p0 = { lat: effectiveRoute[0][0], lng: effectiveRoute[0][1] };
              const p1 = { lat: effectiveRoute[1][0], lng: effectiveRoute[1][1] };
              
              fetchMapboxRoute(p0, p1).then(data => {
                if (data?.geometry?.coordinates) {
                  clearPolylines();
                  const coords: [number, number][] = data.geometry.coordinates.map(
                    (c: [number, number]) => [c[1], c[0]] as [number, number]
                  );
                  drawRoute(coords, false, routeColor, false);
                  setRouteCoordinates(coords);
                }
              }).catch(err => console.warn('[SimpleMap] ⚠️ Rota geral falhou:', err?.message));
            }
        }
      } else if (useRealRoute && isLoadingRoute) {
        console.log('[SimpleMap] ⏳ Loading route from API...');
      } else {
        console.log('[SimpleMap] 🔶 Drawing FALLBACK dashed route');
        const sortOrder = { motoboy: 0, user: 1, origin: 2, destination: 3 };
        const sortedMarkers = [...markers].sort((a, b) => 
          (sortOrder[a.type] ?? 99) - (sortOrder[b.type] ?? 99)
        );
        const routeCoords = sortedMarkers.map(m => [Number(m.lat), Number(m.lng)] as [number, number]);
        
        // Também buscar OSRM para o fallback
        if (routeCoords.length === 3) {
          if (!polylineRef.current) {
            drawRoute([routeCoords[0], routeCoords[1]], true, 'orange', false);
            drawRoute([routeCoords[1], routeCoords[2]], true, 'green', true);
          }
          
          const p0 = { lat: routeCoords[0][0], lng: routeCoords[0][1] };
          const p1 = { lat: routeCoords[1][0], lng: routeCoords[1][1] };
          const p2 = { lat: routeCoords[2][0], lng: routeCoords[2][1] };
          
          Promise.all([
            fetchMapboxRoute(p0, p1),
            fetchMapboxRoute(p1, p2)
          ]).then(([data1, data2]) => {
            clearPolylines();
            const coords1 = data1?.geometry?.coordinates?.map((c: any) => [c[1], c[0]] as [number, number]) || [routeCoords[0], routeCoords[1]];
            const coords2 = data2?.geometry?.coordinates?.map((c: any) => [c[1], c[0]] as [number, number]) || [routeCoords[1], routeCoords[2]];
            
            drawRoute(coords1, false, 'orange', false);
            drawRoute(coords2, false, 'green', true);
            setRouteCoordinates({ coords1, coords2 } as any);
          }).catch(() => {});
        } else if (routeCoords.length === 2) {
          if (!polylineRef.current) {
            drawRoute(routeCoords, true, routeColor, false);
          }
          const p0 = { lat: routeCoords[0][0], lng: routeCoords[0][1] };
          const p1 = { lat: routeCoords[1][0], lng: routeCoords[1][1] };
          
          fetchMapboxRoute(p0, p1).then(data => {
            if (data?.geometry?.coordinates) {
              clearPolylines();
              const coords: [number, number][] = data.geometry.coordinates.map(
                (c: [number, number]) => [c[1], c[0]] as [number, number]
              );
              drawRoute(coords, false, routeColor, false);
              setRouteCoordinates(coords);
            }
          });
        }
      }
    } else {
      console.log('[SimpleMap] ⚠️ Route NOT drawn. showRoute=', showRoute, 'markers.length=', markers.length);
    }

    // Add markers with professional icons
    markers.forEach(markerData => {
      const icon = createCustomIcon(markerData.type, markerData.label, markerData.avatar_url, markerData.popup, markerData.sublabel);
      const marker = L.marker([markerData.lat, markerData.lng], { 
        icon,
        zIndexOffset: markerData.type === 'motoboy' ? 1000 : (markerData.type === 'origin' && markerData.popup ? 500 : 0),
        draggable: markerData.draggable ?? false,
      }).addTo(mapInstanceRef.current!);

      // Add popup if provided (skip for origin mega cards — info already visible)
      if (markerData.popup && markerData.type !== 'origin') {
        const popupContent = `
          <div class="marker-popup-content">
            <h4 class="popup-title">${markerData.popup.title}</h4>
            ${markerData.popup.address ? `<p class="popup-address">${markerData.popup.address}</p>` : ''}
            ${markerData.popup.distance ? `<p class="popup-info"><strong>Distância:</strong> ${markerData.popup.distance}</p>` : ''}
            ${markerData.popup.value ? `<p class="popup-value"><strong>Valor:</strong> ${markerData.popup.value}</p>` : ''}
          </div>
        `;
        marker.bindPopup(popupContent, {
          className: 'custom-popup',
          closeButton: true,
          autoPan: true,
        }).openPopup();
      }

      // Handle drag end event
      if (markerData.draggable && onMarkerDragEnd) {
        marker.on('dragend', (e) => {
          const latlng = e.target.getLatLng();
          onMarkerDragEnd(markerData.id, latlng.lat, latlng.lng);
        });
      }

      markersRef.current.push(marker);
    });

    // Smart fitBounds with smooth animation - always show origin and destination
    const boundsKey = markers.map(m => `${m.lat.toFixed(4)},${m.lng.toFixed(4)}`).join('|') + (effectiveRoute?.length || 0);
    if (boundsKey !== lastBoundsRef.current) {
      lastBoundsRef.current = boundsKey;
      
      // Calcular bounds considerando origem e destino prioritariamente
      const originMarker = markers.find(m => m.type === 'origin');
      const destMarker = markers.find(m => m.type === 'destination');
      
      if (effectiveRoute && effectiveRoute.length > 0) {
        // Usar rota completa para bounds mais precisos
        const bounds = L.latLngBounds(effectiveRoute);
        mapInstanceRef.current.flyToBounds(bounds, { 
          padding: [80, 80],
          duration: 0.5,
          easeLinearity: 0.2,
          maxZoom: 15,
        });
      } else if (originMarker && destMarker) {
        // Garantir que origem e destino sejam sempre visíveis
        const bounds = L.latLngBounds([
          [originMarker.lat, originMarker.lng],
          [destMarker.lat, destMarker.lng]
        ]);
        mapInstanceRef.current.flyToBounds(bounds, { 
          padding: [80, 80], // Padding maior para melhor visualização
          duration: 0.5,
          easeLinearity: 0.2,
          maxZoom: 16,
        });
      } else if (markers.length > 1) {
        const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
        mapInstanceRef.current.flyToBounds(bounds, { 
          padding: [70, 70],
          duration: 0.5,
          easeLinearity: 0.2,
          maxZoom: 16,
        });
      }
    }
  }, [markers, showRoute, useRealRoute, routeCoordinates, isLoadingRoute, preCalculatedPolyline, mapReady]);

  return (
    <div 
      ref={mapRef} 
      className={`w-full h-full ${className}`}
      style={{ minHeight: '300px', height: '100%', zIndex: 0, isolation: 'isolate' }}
    />
  );
}

// Professional CSS for markers and route animation
const style = document.createElement('style');
style.textContent = `
  .custom-marker-pro {
    background: transparent !important;
    border: none !important;
  }
  
  .marker-container {
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.15));
  }
  
  .marker-pulse {
    animation: marker-pulse-anim 2s ease-in-out infinite;
  }
  
  @keyframes marker-pulse-anim {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }
  
  .route-polyline-animated {
    /* Animation removed to prevent missing path segments on long distances */
    stroke-dasharray: none;
  }
  
  @keyframes route-draw {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  
  /* Smooth zoom controls */
  .leaflet-control-zoom {
    border: none !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
    border-radius: 8px !important;
    overflow: hidden;
  }
  
  .leaflet-control-zoom a {
    background: rgba(255,255,255,0.95) !important;
    color: #374151 !important;
    border: none !important;
    width: 36px !important;
    height: 36px !important;
    line-height: 36px !important;
    font-size: 18px !important;
    font-weight: 500 !important;
  }
  
  .leaflet-control-zoom a:hover {
    background: #f3f4f6 !important;
  }
  
  /* Hide default attribution for cleaner look */
  .leaflet-control-attribution {
    display: none !important;
  }
  
  /* Custom popup styles */
  .custom-popup .leaflet-popup-content-wrapper {
    background: rgba(17, 24, 39, 0.95) !important;
    backdrop-filter: blur(8px);
    border-radius: 12px !important;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3) !important;
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 0 !important;
  }
  
  .custom-popup .leaflet-popup-content {
    margin: 0 !important;
    color: #fff;
  }
  
  .custom-popup .leaflet-popup-tip {
    background: rgba(17, 24, 39, 0.95) !important;
  }
  
  .custom-popup .leaflet-popup-close-button {
    color: rgba(255, 255, 255, 0.6) !important;
    font-size: 18px !important;
    top: 6px !important;
    right: 8px !important;
  }
  
  .custom-popup .leaflet-popup-close-button:hover {
    color: #fff !important;
  }
  
  .marker-popup-content {
    padding: 12px 16px;
    min-width: 160px;
  }
  
  .marker-popup-content .popup-title {
    font-size: 14px;
    font-weight: 600;
    color: #10b981;
    margin: 0 0 8px 0;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .marker-popup-content .popup-address {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.8);
    margin: 0 0 6px 0;
    line-height: 1.4;
  }
  
  .marker-popup-content .popup-info {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    margin: 0 0 4px 0;
  }
  
  .marker-popup-content .popup-value {
    font-size: 13px;
    color: #10b981;
    font-weight: 600;
    margin: 6px 0 0 0;
  }
`;
document.head.appendChild(style);
