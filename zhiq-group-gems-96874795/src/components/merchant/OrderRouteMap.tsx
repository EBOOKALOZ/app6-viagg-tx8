import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, MapPin, Navigation } from 'lucide-react';
import { calculateRoute } from '@/skills/maps/routeService';

interface OrderRouteMapProps {
    pickupLat: number;
    pickupLng: number;
    dropLat: number;
    dropLng: number;
    routePolyline?: { coordinates: number[][] } | null;
    height?: string;
}

/* ─── Premium Route Map CSS (injected once) ─── */
const ROUTE_MAP_STYLE_ID = 'route-map-premium-css';
if (!document.getElementById(ROUTE_MAP_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = ROUTE_MAP_STYLE_ID;
    style.textContent = `
    .route-map-container .mapboxgl-ctrl-group {
      border-radius: 12px !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
      border: 1px solid rgba(255,255,255,0.1) !important;
      overflow: hidden;
      backdrop-filter: blur(12px);
      background: rgba(30,41,59,0.9) !important;
    }
    .route-map-container .mapboxgl-ctrl-group button {
      width: 36px !important; height: 36px !important;
      border: none !important;
      transition: background 0.2s ease !important;
    }
    .route-map-container .mapboxgl-ctrl-group button:hover {
      background: rgba(255,255,255,0.1) !important;
    }
    .route-map-container .mapboxgl-ctrl-group button span {
      filter: invert(1) brightness(2) !important;
    }
    .route-map-container .mapboxgl-ctrl-group button + button {
      border-top: 1px solid rgba(255,255,255,0.1) !important;
    }
    .route-map-container .mapboxgl-ctrl-attrib {
      opacity: 0.25 !important; font-size: 9px !important;
      background: transparent !important;
      color: rgba(255,255,255,0.7) !important;
    }
    .route-map-container .mapboxgl-canvas { outline: none !important; }

    /* Custom markers */
    .pickup-marker {
      width: 44px; height: 44px;
      background: linear-gradient(135deg, #22c55e, #16a34a);
      border: 3px solid #1e293b;
      border-radius: 50%;
      box-shadow: 0 0 0 4px rgba(34,197,94,0.2), 0 8px 16px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      position: relative; z-index: 2;
    }
    .dropoff-marker {
      width: 44px; height: 44px;
      background: linear-gradient(135deg, #ef4444, #dc2626);
      border: 3px solid #1e293b;
      border-radius: 50%;
      box-shadow: 0 0 0 4px rgba(239,68,68,0.2), 0 8px 16px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      position: relative; z-index: 2;
    }
    .marker-pulse {
      position: absolute;
      width: 100%; height: 100%;
      border-radius: 50%;
      animation: route-marker-pulse 2s cubic-bezier(0,0,.2,1) infinite;
      z-index: 1;
    }
    .pickup-marker .marker-pulse { border: 2px solid #22c55e; }
    .dropoff-marker .marker-pulse { border: 2px solid #ef4444; }

    @keyframes route-marker-pulse {
      0%   { transform: scale(1);   opacity: 0.8; }
      100% { transform: scale(2.2); opacity: 0; }
    }
  `;
    document.head.appendChild(style);
}

export function OrderRouteMap({
    pickupLat,
    pickupLng,
    dropLat,
    dropLng,
    routePolyline,
    height = '400px'
}: OrderRouteMapProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<mapboxgl.Map | null>(null);

    const [mapboxToken, setMapboxToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 1. Fetch token and init map
    useEffect(() => {
        const token = import.meta.env.VITE_MAPBOX_TOKEN;
        if (!token) {
            setError('Token do Mapbox não configurado no .env local.');
            setIsLoading(false);
            return;
        }
        setMapboxToken(token);
    }, []);

    useEffect(() => {
        if (!mapboxToken || !mapContainerRef.current) return;

        mapboxgl.accessToken = mapboxToken;

        // Inicializa o mapa focado de forma centralizada entre os dois pontos
        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: 'mapbox://styles/mapbox/streets-v12', // Estilo premium unificado claro
            center: [(pickupLng + dropLng) / 2, (pickupLat + dropLat) / 2],
            zoom: 12,
            pitch: 60, // Inclinação forte para 3D
            bearing: 0,
            antialias: true,
            projection: 'globe',
            attributionControl: false
        });

        map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
        mapInstanceRef.current = map;

        // Força resize inicial 
        setTimeout(() => map.resize(), 100);

        map.on('style.load', () => {
            // Configurar prédios 3D
            if (!map.getLayer('3d-buildings')) {
                const layers = map.getStyle().layers;
                const labelLayerId = layers?.find(
                    (layer: any) => layer.type === "symbol" && layer.layout && layer.layout["text-field"]
                )?.id;

                map.addLayer({
                    'id': '3d-buildings',
                    'source': 'composite',
                    'source-layer': 'building',
                    'filter': ['==', 'extrude', 'true'],
                    'type': 'fill-extrusion',
                    'minzoom': 14,
                    'paint': {
                        'fill-extrusion-color': '#1f2937',
                        'fill-extrusion-height': [
                            'interpolate', ['linear'], ['zoom'],
                            14, 0, 15.05, ['get', 'height']
                        ],
                        'fill-extrusion-base': [
                            'interpolate', ['linear'], ['zoom'],
                            14, 0, 15.05, ['get', 'min_height']
                        ],
                        'fill-extrusion-opacity': 0.8
                    }
                }, labelLayerId);
            }

            // Fog atmosférico estilo night drive
            map.setFog({
                'color': 'rgb(15, 23, 42)', // slate-900
                'high-color': 'rgb(2, 6, 23)', // slate-950
                'horizon-blend': 0.1,
                'space-color': 'rgb(0, 0, 0)',
                'star-intensity': 0.6
            });

            // Terrain configuration (opcional, requer raster-dem)
            map.addSource('mapbox-dem', {
                'type': 'raster-dem',
                'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
                'tileSize': 512,
                'maxzoom': 14
            });
            map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.1 });
        });

        let initFired = false;

        const initializeMapDetails = async () => {
            if (initFired) return;
            initFired = true;

            map.resize();

            // Adicionar layers vazias da rota (primeiro a linha grossa pro brilho (glow), depois o centro (core))
            if (!map.getSource('route')) {
                map.addSource('route', {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: []
                        }
                    }
                });
            }

            // Glow layer (azul brilhante)
            if (!map.getLayer('route-glow')) {
                map.addLayer({
                    id: 'route-glow',
                    type: 'line',
                    source: 'route',
                    layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    paint: {
                        'line-color': '#3b82f6', // blue-500
                        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 6, 22, 14],
                        'line-opacity': 0.4,
                        'line-blur': 12
                    }
                });
            }

            // Core layer (linha sólida)
            if (!map.getLayer('route-core')) {
                map.addLayer({
                    id: 'route-core',
                    type: 'line',
                    source: 'route',
                    layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    paint: {
                        'line-color': '#60a5fa', // blue-400
                        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 22, 6]
                    }
                });
            }

            // Adicionar marcadores customizados HTML (via DOM para animações fluidas)
            addDOMMarkers(map);

            // Buscar rota real se geojson não fornecido, ou usar o fornecido
            await fetchAndDrawRoute(map);

            setIsLoading(false);
        };

        // Fallback: se 'load' não disparar, força a renderização para evitar loading infinito
        const fallbackTimeout = setTimeout(() => {
            console.warn("OrderRouteMap 'load' timeout. Forcing initialization.");
            initializeMapDetails();
        }, 3000);

        map.on('load', () => {
            clearTimeout(fallbackTimeout);
            initializeMapDetails();
        });

        map.on('error', (e) => {
            console.error("Mapbox Route Error:", e);
        });

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, [mapboxToken, pickupLat, pickupLng, dropLat, dropLng]);

    const addDOMMarkers = (map: mapboxgl.Map) => {
        // Pickup Marker
        const pickupEl = document.createElement('div');
        pickupEl.className = 'pickup-marker';
        pickupEl.innerHTML = `
      <div class="marker-pulse"></div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
      </svg>
    `;
        new mapboxgl.Marker({ element: pickupEl, anchor: 'center' })
            .setLngLat([pickupLng, pickupLat])
            .addTo(map);

        // Dropoff Marker
        const dropoffEl = document.createElement('div');
        dropoffEl.className = 'dropoff-marker';
        // lucide MapPin
        dropoffEl.innerHTML = `
      <div class="marker-pulse"></div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3"></circle>
      </svg>
    `;
        new mapboxgl.Marker({ element: dropoffEl, anchor: 'bottom' })
            .setLngLat([dropLng, dropLat])
            .addTo(map);
    };

    const fetchAndDrawRoute = async (map: mapboxgl.Map) => {
        let routeCoords: number[][] = [];

        if (routePolyline && routePolyline.coordinates) {
            routeCoords = routePolyline.coordinates;
        } else {
            // Fallback para api se routerPolyline não veio
            try {
                const route = await calculateRoute(
                    { lat: pickupLat, lng: pickupLng },
                    { lat: dropLat, lng: dropLng }
                );
                if (route && route.geometry && route.geometry.coordinates) {
                    routeCoords = route.geometry.coordinates;
                } else {
                    // Fallback para linha reta em ultimo caso se não houver rota
                    routeCoords = [[pickupLng, pickupLat], [dropLng, dropLat]];
                }
            } catch (err: unknown) {
                console.error('Erro buscando rota Real no Mapbox:', err);
                routeCoords = [[pickupLng, pickupLat], [dropLng, dropLat]];
            }
        }

        // Desenhar a linha (atualizando o Data Source do Mapbox GeoJSON)
        const source = map.getSource('route') as mapboxgl.GeoJSONSource;
        if (source) {
            source.setData({
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: routeCoords
                }
            });
        }

        // Ajustar os Bounds com animação suave para cobrir a rota perfeitamente
        const bounds = new mapboxgl.LngLatBounds();
        routeCoords.forEach((coord: number[]) => bounds.extend(coord as [number, number]));

        map.fitBounds(bounds, {
            padding: { top: 60, bottom: 60, left: 60, right: 60 },
            maxZoom: 16,
            pitch: 45,
            speed: 0.8,
            essential: true
        });
    };

    if (error) {
        return (
            <div
                className="w-full flex items-center justify-center bg-slate-900 rounded-xl border border-slate-800"
                style={{ height }}
            >
                <div className="text-center p-6 space-y-3">
                    <Navigation className="h-8 w-8 text-slate-500 mx-auto opacity-50" />
                    <p className="text-slate-400 font-medium text-sm">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl bg-slate-900 route-map-container ring-1 ring-white/10 group">
            {isLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm transition-opacity duration-500">
                    <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-4" />
                    <p className="text-blue-400 font-medium tracking-wide text-sm uppercase">Traçando Rota Real...</p>
                </div>
            )}
            <div
                ref={mapContainerRef}
                style={{ height, width: '100%' }}
                className="transition-opacity duration-1000"
            />
            {/* Overlay gradiente inferior e superior para efeito premium */}
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/80 to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-slate-950/60 to-transparent pointer-events-none" />
        </div>
    );
}
