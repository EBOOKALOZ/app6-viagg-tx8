import React, { useEffect, useRef, useState, useCallback, Component, type ErrorInfo, type ReactNode } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import { createMarkerElement } from '@/skills/maps/markersService';
import { drawRoutePremium, drawSegmentedRoutes, clearAllRoutes, type RouteSegment } from '@/skills/maps/routeRenderer';

// ---------- Isolated Error Boundary for Map ----------
interface MapErrorBoundaryProps { children: ReactNode; className?: string }
interface MapErrorBoundaryState { hasError: boolean }

class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[MapErrorBoundary] Caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className={`flex items-center justify-center bg-muted rounded-xl ${this.props.className || ''}`} style={{ height: 600 }}>
          <p className="text-muted-foreground text-sm">Mapa indisponível</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export { MapErrorBoundary };

export interface PremiumMapMarker {
  id: string;
  draggable?: boolean;
  lat: number;
  lng: number;
  type: 'store' | 'motoboy' | 'customer' | 'origin' | 'destination';
  label?: string;
  heading?: number; // rotation degrees for motoboy
  popupHtml?: string; // custom popup HTML — replaces default tooltip
  autoPopup?: boolean; // open popup automatically on load
  slogan?: string; // short branding slogan for store markers
  nativeColor?: string; // override rendering with native mapbox pin color
  // NOVAS PROPRIEDADES PARA O CARD DA LOJA
  logo_url?: string;
  photo_url?: string;
  distance_km?: number;
  eta_min?: number;
  popupClassName?: string;
  /** Quando true, o marcador é exibido no mapa mas excluído do cálculo de fitBounds */
  skipBounds?: boolean;
}

interface MapboxPremiumMapProps {
  markers: PremiumMapMarker[];
  center?: { lat: number; lng: number };
  zoom?: number;
  minZoom?: number;
  className?: string;
  showRoute?: boolean;
  routePolyline?: [number, number][]; // [lat, lng][]
  /** Cor da linha principal da rota (default verde do lojista) */
  routeColor?: string;
  /** Trechos independentes com cores distintas — substitui routePolyline quando fornecido */
  routeSegments?: RouteSegment[];
  onReady?: () => void;
  onMarkerDragEnd?: (id: string, lat: number, lng: number) => void;
  onMapClick?: (lat: number, lng: number) => void;
  /** Clique/toque num marcador → recebe o id (ex.: card de profissional). */
  onMarkerClick?: (id: string) => void;
  onMapMouseMove?: (lat: number, lng: number) => void;
  isMapSelectMode?: boolean;
  /** Quando true, ativa modo de qualidade máxima: pixel ratio 2x mínimo,
   * zoom mais aproximado em fitBounds/flyTo, tiles HD e 3D mais detalhado */
  hqMode?: boolean;
}

// SVG marker creators are now centralized in skills/maps/markersService.ts

function createTooltip(marker: PremiumMapMarker): mapboxgl.Popup {
  if (marker.popupHtml) {
    return new mapboxgl.Popup({
      offset: 28,
      closeButton: true,
      closeOnClick: false,
      className: marker.popupClassName || 'premium-tooltip',
      maxWidth: '300px',
    }).setHTML(marker.popupHtml);
  }

  const typeLabels: Record<string, string> = {
    store: '🏪 Loja',
    origin: '🏪 Loja',
    motoboy: '🏍️ Motoboy',
    customer: '📍 Ponto do cliente',
    destination: '📍 Ponto do cliente',
  };

  let html = '';

  if (marker.type === 'store' || marker.type === 'origin') {
    const logoHtml = marker.logo_url
      ? `<img src="${marker.logo_url}" alt="Logo" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1.5px solid white; flex-shrink: 0;" />`
      : `<div style="width: 36px; height: 36px; border-radius: 50%; background-color: rgba(255,255,255,0.2); border: 1.5px solid white; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0;">🏪</div>`;

    html = `
      <div style="
        background-color: #1F6F4A;
        border-radius: 12px;
        padding: 8px 12px;
        font-family: 'Inter', system-ui, sans-serif;
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 160px;
        box-shadow: 0 4px 12px rgba(31, 111, 74, 0.3);
      ">
        ${logoHtml}
        <div style="display: flex; flex-direction: column; min-width: 0;">
          <span style="font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.9); text-transform: uppercase; letter-spacing: 0.5px; line-height: 1;">LOJA</span>
          <span style="font-size: 13px; font-weight: 800; color: #FFFFFF; line-height: 1.2; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${marker.label || 'Loja'}</span>
        </div>
      </div>
    `;

    // Para o card da loja, configuramos um popup com fundo transparente, já que o HTML interno faz o card
    return new mapboxgl.Popup({
      offset: 28,
      closeButton: false,
      closeOnClick: false,
      className: 'premium-tooltip store-green-tooltip',
      maxWidth: '260px',
    }).setHTML(html);
  }

  html = `
    <div style="
      padding: 10px 14px;
      font-family: 'Inter', system-ui, sans-serif;
      min-width: 160px;
    ">
      <div style="
        font-size: 13px; font-weight: 600;
        color: #111827; margin-bottom: 6px;
        padding-bottom: 6px;
        border-bottom: 1px solid #e5e7eb;
      ">${typeLabels[marker.type] || marker.type}</div>
      ${marker.label ? `<div style="font-size: 12px; color: #4b5563; margin-bottom: 4px;">${marker.label}</div>` : ''}
    </div>
  `;

  return new mapboxgl.Popup({
    offset: 28,
    closeButton: false,
    closeOnClick: false,
    className: 'premium-tooltip',
    maxWidth: '260px',
  }).setHTML(html);
}

// Inject premium CSS
const premiumStyle = document.createElement('style');
premiumStyle.textContent = `
  /* ESTILOS DO PIN DA LOJA */
  .store-marker-card {
    background: white;
    border-radius: 14px;
    padding: 10px 12px;
    display: flex;
    gap: 10px;
    align-items: center;
    box-shadow: 0 10px 25px rgba(0,0,0,0.15);
  }

  .store-logo {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    object-fit: cover;
    border: 1px solid #e5e7eb;
  }

  .store-info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .store-name {
    font-size: 13px;
    font-weight: 700;
    color: #111827;
    white-space: nowrap;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .store-badge {
    font-size: 10px;
    font-weight: 600;
    color: #059669;
    background: #d1fae5;
    padding: 2px 6px;
    border-radius: 4px;
    margin-top: 2px;
    text-transform: uppercase;
  }

  @keyframes motoboy-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.06); }
  }

  @keyframes motoboy-ring-pulse {
    0% { transform: scale(1); opacity: 0.6; }
    100% { transform: scale(2.2); opacity: 0; }
  }

  @keyframes marker-drop {
    0% { transform: translateY(-30px); opacity: 0; }
    60% { transform: translateY(4px); opacity: 1; }
    80% { transform: translateY(-2px); }
    100% { transform: translateY(0); }
  }

  @keyframes shadow-pulse {
    0%, 100% { transform: scale(1); opacity: 0.3; }
    50% { transform: scale(1.15); opacity: 0.15; }
  }

  .mapbox-premium-marker {
    animation: marker-drop 0.5s cubic-bezier(.34,1.56,.64,1) forwards;
  }

  .premium-marker-shadow {
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 32px;
    height: 8px;
    background: radial-gradient(ellipse, rgba(0,0,0,0.25) 0%, transparent 70%);
    border-radius: 50%;
    animation: shadow-pulse 2.5s ease-in-out infinite;
    z-index: 0;
  }

  .motoboy-ring {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 52px;
    height: 52px;
    margin-top: -26px;
    margin-left: -26px;
    border-radius: 50%;
    border: 2px solid rgba(249,115,22,0.5);
    animation: motoboy-ring-pulse 2s cubic-bezier(0,0,.2,1) infinite;
    z-index: 1;
    pointer-events: none;
  }

  @media (max-width: 640px) {
    .store-slogan-pill span {
      font-size: 9px !important;
    }
  }

  .premium-tooltip .mapboxgl-popup-content {
    background: rgba(255,255,255,0.98);
    backdrop-filter: blur(16px) saturate(1.8);
    border-radius: 14px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06);
    border: 1px solid rgba(0,0,0,0.05);
    padding: 0;
  }

  .premium-tooltip .mapboxgl-popup-tip {
    border-top-color: rgba(255,255,255,0.98);
  }

  /* TOOLTIP VERDE DA LOJA */
  .store-green-tooltip .mapboxgl-popup-content {
    background: transparent !important;
    backdrop-filter: none !important;
    box-shadow: none !important;
    border: none !important;
    padding: 0 !important;
  }
  .store-green-tooltip .mapboxgl-popup-tip {
    border-top-color: #1F6F4A !important;
  }
  .store-green-tooltip .mapboxgl-popup-close-button {
    color: white !important;
    font-size: 18px !important;
    right: 6px !important;
    top: 6px !important;
    width: 24px !important;
    height: 24px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: all 0.2s ease;
  }
  .store-green-tooltip .mapboxgl-popup-close-button:hover {
    background-color: rgba(255,255,255,0.2) !important;
    border-radius: 50%;
  }

  /* TOOLTIP DOS PROFISSIONAIS NO MAPA AO VIVO (motoboy/mototaxi/driver) —
     mesma técnica do store-green-tooltip (fundo transparente, o card colorido
     do popupHtml é quem desenha o balão), mas cor-agnóstica: a cor vem do
     nativeColor de cada categoria, não fixa no CSS. */
  .pro-marker-tooltip .mapboxgl-popup-content {
    background: transparent !important;
    backdrop-filter: none !important;
    box-shadow: none !important;
    border: none !important;
    padding: 0 !important;
  }
  .pro-marker-tooltip .mapboxgl-popup-close-button {
    color: white !important;
    font-size: 18px !important;
    right: 6px !important;
    top: 6px !important;
    width: 24px !important;
    height: 24px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: all 0.2s ease;
  }
  .pro-marker-tooltip .mapboxgl-popup-close-button:hover {
    background-color: rgba(255,255,255,0.2) !important;
    border-radius: 50%;
  }

  .mapboxgl-ctrl-attrib {
    opacity: 0.4 !important;
    font-size: 10px !important;
  }

  .mapboxgl-ctrl-group {
    border-radius: 12px !important;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06) !important;
    border: none !important;
    overflow: hidden;
    backdrop-filter: blur(8px);
  }

  .mapboxgl-ctrl-group button {
    width: 40px !important;
    height: 40px !important;
    border: none !important;
    transition: background 0.15s ease !important;
  }

  .mapboxgl-ctrl-group button:hover {
    background: rgba(0,0,0,0.04) !important;
  }

  .mapboxgl-ctrl-group button + button {
    border-top: 1px solid rgba(0,0,0,0.06) !important;
  }

  .mapboxgl-canvas {
    outline: none !important;
  }
`;
if (!document.querySelector('[data-premium-map-style]')) {
  premiumStyle.setAttribute('data-premium-map-style', 'true');
  document.head.appendChild(premiumStyle);
}

export function MapboxPremiumMap({
  markers,
  center,
  zoom = 15,
  minZoom = 11,
  className = '',
  showRoute = false,
  routePolyline,
  routeColor,
  routeSegments,
  onReady,
  onMarkerDragEnd,
  onMapClick,
  onMarkerClick,
  onMapMouseMove,
  isMapSelectMode,
  hqMode = false,
}: MapboxPremiumMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersMapRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const popupsRef = useRef<Map<string, mapboxgl.Popup>>(new Map());
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const isMobile = useIsMobile();
  const initializedRef = useRef(false);
  const onMarkerDragEndRef = useRef(onMarkerDragEnd);
  onMarkerDragEndRef.current = onMarkerDragEnd;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;

  const onMapMouseMoveRef = useRef(onMapMouseMove);
  onMapMouseMoveRef.current = onMapMouseMove;

  const centerRef = useRef(center);
  centerRef.current = center;

  // Refs to always carry the latest route values inside event listeners
  // (avoids stale closures when style.load fires after the effect ran)
  const routeSegmentsRef = useRef(routeSegments);
  routeSegmentsRef.current = routeSegments;
  const showRouteRef = useRef(showRoute);
  showRouteRef.current = showRoute;
  const routePolylineRef = useRef(routePolyline);
  routePolylineRef.current = routePolyline;
  const routeColorRef = useRef(routeColor);
  routeColorRef.current = routeColor;

  // Setup token directly from env
  useEffect(() => {
    const envToken = import.meta.env.VITE_MAPBOX_TOKEN;
    if (envToken) {
      setToken(envToken);
    } else {
      console.error('[MapboxPremium] VITE_MAPBOX_TOKEN is missing');
      setError(true);
    }
  }, []);

  // Initialize map
  useEffect(() => {
    if (!token || !containerRef.current || initializedRef.current) return;

    initializedRef.current = true;

    mapboxgl.accessToken = token;

    const defaultCenter: [number, number] = center
      ? [center.lng, center.lat]
      : [-46.6333, -23.5505];

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        // Standard v3 no hqMode: prédios 3D foto-realistas, iluminação dinâmica,
        // árvores, landmarks — supera o nível visual de Uber/99.
        style: hqMode ? 'mapbox://styles/mapbox/standard' : 'mapbox://styles/mapbox/navigation-night-v1',
        center: defaultCenter,
        zoom,
        pitch: isMobile ? (hqMode ? 45 : 0) : (hqMode ? 62 : 50),
        bearing: isMobile ? 0 : -15,
        antialias: true,
        projection: 'globe',
        maxZoom: 22,
        minZoom,
        maxPitch: hqMode ? 85 : 60,
        fadeDuration: hqMode ? 80 : 200,
        localIdeographFontFamily: "'Inter', 'Noto Sans', sans-serif",
        refreshExpiredTiles: true,
        attributionControl: false,
      });

      // Attribution control compacto (padrão Uber/99)
      map.addControl(new mapboxgl.AttributionControl({ compact: true }));

      // Força pixel ratio alto para renderização HD/Retina (2x mínimo, 3x em telas 4K)
      if (hqMode) {
        const dpr = Math.max(window.devicePixelRatio || 1, 2);
        try { map.setPixelRatio?.(dpr); } catch { }
      }
    } catch (err) {
      console.error('[MapboxPremium] Failed to initialize map (WebGL?):', err);
      setError(true);
      initializedRef.current = false;
      return;
    }

    // Navigation controls
    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      'bottom-right'
    );

    // Scale bar
    if (!isMobile) {
      map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120 }), 'bottom-left');
    }

    map.on('style.load', () => {
      try {
        // Force night theme to perfectly blend with the platform's dark mode
        const lightPreset = 'night';
        map.setConfigProperty('basemap', 'lightPreset', lightPreset);
        map.setConfigProperty('basemap', 'showPlaceLabels', true);
        map.setConfigProperty('basemap', 'showRoadLabels', true);
        map.setConfigProperty('basemap', 'showPointOfInterestLabels', true);
        map.setConfigProperty('basemap', 'showTransitLabels', true);
        map.setConfigProperty('basemap', 'show3dObjects', true);
        if (hqMode) {
          // Mapbox Standard v3 – configurações premium
          map.setConfigProperty('basemap', 'theme', 'default');
          map.setConfigProperty('basemap', 'font', 'Inter');
          map.setConfigProperty('basemap', 'showPedestrianRoads', true);
          map.setConfigProperty('basemap', 'colorMotorways', '#2B7FFF');
          map.setConfigProperty('basemap', 'colorTrunks', '#3B82F6');
        }
      } catch {
        // Standard style config may not be available on all versions
      }

      // Atmosfera premium para o globo (padrão Uber/99 superior)
      try {
        map.setFog({
          'range': [0.5, 10],
          'color': '#0a0e27',
          'high-color': '#245cdf',
          'space-color': '#000000',
          'horizon-blend': hqMode ? 0.04 : 0.02,
          'star-intensity': hqMode ? 0.6 : 0.15,
        });
      } catch { }

      // Terrain 3D — exaggeration maior no hqMode
      try {
        map.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        });
        map.setTerrain({ source: 'mapbox-dem', exaggeration: hqMode ? 1.5 : 1.2 });
      } catch { }

      // Sky layer realista
      try {
        map.addLayer({
          id: 'sky',
          type: 'sky',
          paint: {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 90.0],
            'sky-atmosphere-sun-intensity': hqMode ? 20 : 15,
          },
        });
      } catch { }

      onReady?.();
      // Sinaliza que o estilo está pronto — efeitos de rota só disparam aqui
      setMapReady(true);
    });

    mapRef.current = map;

    // Ensure sharp rendering: resize after load + ResizeObserver for responsive containers
    map.on('load', () => {
      map.resize();
      // Double-tap resize to catch late layout shifts (cards, tabs, etc.)
      requestAnimationFrame(() => map.resize());
    });

    // ResizeObserver ensures resize() fires whenever the container dimensions change
    const ro = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.resize();
    });
    if (containerRef.current) ro.observe(containerRef.current);

    // Map ready

    // Map click handler — uses ref to avoid stale closure
    map.on('click', (e) => {
      onMapClickRef.current?.(e.lngLat.lat, e.lngLat.lng);
    });

    // Map mouse move handler
    map.on('mousemove', (e) => {
      onMapMouseMoveRef.current?.(e.lngLat.lat, e.lngLat.lng);
    });

    // Enforce origin store snapping (REMOVED)

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      initializedRef.current = false;
      setMapReady(false);
      markersMapRef.current.clear();
      popupsRef.current.clear();
    };
  }, [token]);

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existingIds = new Set(markersMapRef.current.keys());
    const newIds = new Set(markers.map(m => m.id));

    // Remove old markers
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        markersMapRef.current.get(id)?.remove();
        markersMapRef.current.delete(id);
        popupsRef.current.get(id)?.remove();
        popupsRef.current.delete(id);
      }
    });

    // Add/update markers
    markers.forEach(markerData => {
      const existing = markersMapRef.current.get(markerData.id);

      if (existing) {
        // Update existing marker position smoothly
        const lngLat = existing.getLngLat();
        if (
          Math.abs(lngLat.lng - markerData.lng) > 0.00001 ||
          Math.abs(lngLat.lat - markerData.lat) > 0.00001
        ) {
          existing.setLngLat([markerData.lng, markerData.lat]);
        }
      } else {
        // Create new marker
        const el = createMarkerElement(markerData);
        const marker = new mapboxgl.Marker({
          element: el,
          anchor: markerData.type === 'motoboy' ? 'center' : 'bottom',
          draggable: !!markerData.draggable,
        });

        marker
          .setLngLat([markerData.lng, markerData.lat])
          .addTo(map);

        // Drag end callback
        if (markerData.draggable) {
          marker.on('dragend', () => {
            const lngLat = marker.getLngLat();
            onMarkerDragEndRef.current?.(markerData.id, lngLat.lat, lngLat.lng);
          });
        }

        // Clique/toque no marcador → callback (ex.: card de profissional).
        el.style.cursor = 'pointer';
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onMarkerClickRef.current?.(markerData.id);
        });

        // Attach popup permanently if autoPopup is true, otherwise use mapbox's default or hover.
        const popup = createTooltip(markerData);
        popupsRef.current.set(markerData.id, popup);
        marker.setPopup(popup);

        if (markerData.autoPopup) {
          // Fix popup permanently to the marker
          setTimeout(() => {
            if (!popup.isOpen()) {
              marker.togglePopup();
            }
          }, 800);
        } else if (!isMobile) {
          // Only add hover behavior for standard non-fixed tooltips
          marker.getElement().addEventListener('mouseenter', () => {
            if (!popup.isOpen()) marker.togglePopup();
          });
          marker.getElement().addEventListener('mouseleave', () => {
            if (popup.isOpen()) marker.togglePopup();
          });
        }

        markersMapRef.current.set(markerData.id, marker);
      }
    });

    // fitBounds: exclui ghost markers e markers com skipBounds=true
    const boundsMarkers = markers.filter(m => m.id !== 'destination-ghost' && !m.skipBounds);

    if (!isMapSelectMode) {
      if (boundsMarkers.length >= 2) {
        const bounds = new mapboxgl.LngLatBounds();
        boundsMarkers.forEach(m => bounds.extend([m.lng, m.lat]));
        map.fitBounds(bounds, {
          padding: hqMode ? 60 : 80,
          maxZoom: hqMode ? 16 : 14.5,
          duration: 1200,
          easing: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
        });
      } else if (boundsMarkers.length === 1) {
        map.flyTo({
          center: [boundsMarkers[0].lng, boundsMarkers[0].lat],
          zoom: hqMode ? 15.5 : 14,
          duration: 1000,
          speed: 1,
          easing: (t: number) => 1 - Math.pow(1 - t, 4),
        });
      }
    }
  }, [markers, isMobile, mapReady, isMapSelectMode, hqMode]);

  // Parte 1: listener permanente no style.load que lê SEMPRE do ref atual.
  // Registrado uma única vez por vida do mapa (só muda com mapReady).
  // Garante que ao recarregar o estilo (terrain, sky, tiles) a rota seja
  // redesenhada com os segmentos mais recentes — sem stale closure.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const renderFromRef = () => {
      if (!map.isStyleLoaded()) return;
      const segs = routeSegmentsRef.current;
      const show = showRouteRef.current;
      const poly = routePolylineRef.current;
      const hasSegs = !!segs && segs.length > 0;
      const hasPoly = !!poly && poly.length >= 2;
      if (!show || (!hasSegs && !hasPoly)) {
        clearAllRoutes(map);
        return;
      }
      if (hasSegs) {
        drawSegmentedRoutes(map, segs, true);
      } else {
        const coordinates = (poly || []).map(([lat, lng]) => [lng, lat] as [number, number]);
        drawRoutePremium(map, coordinates, true, routeColorRef.current);
      }
    };

    map.on('style.load', renderFromRef);
    return () => { map.off('style.load', renderFromRef); };
  }, [mapReady]);

  // Parte 2: redesenho imediato quando os dados de rota mudam.
  // mapReady só fica true depois do style.load, então isStyleLoaded() é sempre true aqui.
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    const draw = () => {
      try {
        const hasSegs = !!routeSegments && routeSegments.length > 0;
        const hasPoly = !!routePolyline && routePolyline.length >= 2;
        if (!showRoute || (!hasSegs && !hasPoly)) {
          clearAllRoutes(map);
          return;
        }
        if (hasSegs) {
          drawSegmentedRoutes(map, routeSegments!, true);
        } else {
          const coordinates = (routePolyline || []).map(([lat, lng]) => [lng, lat] as [number, number]);
          drawRoutePremium(map, coordinates, true, routeColor);
        }
      } catch (err) {
        console.warn('[MapboxPremiumMap] draw error (style mid-reload?):', err);
      }
    };

    draw();

    // Re-desenha se o estilo recarregar (ex: troca de tema)
    map.on('style.load', draw);
    return () => { map.off('style.load', draw); };
  }, [showRoute, routePolyline, routeSegments, routeColor, mapReady]);

  // Update center smoothly
  const lastCenterRef = useRef('');
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    const key = `${typeof center.lat === 'number' ? center.lat.toFixed(4) : '0'},${typeof center.lng === 'number' ? center.lng.toFixed(4) : '0'}`;
    if (key === lastCenterRef.current) return;
    lastCenterRef.current = key;
    map.flyTo({
      center: [center.lng, center.lat],
      duration: 900,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
    });
  }, [center]);

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-muted rounded-xl ${className}`} style={{ minHeight: 300 }}>
        <p className="text-muted-foreground text-sm">Mapa indisponível</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className={`flex items-center justify-center bg-muted rounded-xl animate-pulse ${className}`} style={{ minHeight: 300 }}>
        <div className="text-center space-y-2">
          <div className="w-8 h-8 rounded-full bg-merchant/20 mx-auto animate-spin border-2 border-merchant border-t-transparent" />
          <p className="text-muted-foreground text-xs">Carregando mapa...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full h-full min-h-[400px] ${className}`}
      style={{ minHeight: 400 }}
    />
  );
}
