import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import polyline from '@mapbox/polyline';
import { supabase } from '@/integrations/supabase/client';
import { MapPin } from 'lucide-react';
import 'mapbox-gl/dist/mapbox-gl.css';

interface RouteMapCanvasProps {
  /** Unique ID to isolate mapbox sources/layers per instance */
  instanceId: string;
  originLat: number | null;
  originLng: number | null;
  destinationLat: number | null;
  destinationLng: number | null;
  /** Encoded polyline string from the backend */
  encodedPolyline: string | null;
  /** Main route line color */
  routeColor: string;
  /** Route outline color */
  outlineColor: string;
  /** Origin marker color */
  originMarkerColor: string;
  /** Destination marker color */
  destinationMarkerColor: string;
  /** Placeholder text when polyline is missing */
  placeholderText?: string;
  /** Allow map interaction (drag/zoom) */
  interactive?: boolean;
}

export default function RouteMapCanvas({
  instanceId,
  originLat, originLng,
  destinationLat, destinationLng,
  encodedPolyline,
  routeColor,
  outlineColor,
  originMarkerColor,
  destinationMarkerColor,
  placeholderText = 'Calculando rota real…',
  interactive = false,
}: RouteMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [dynamicRouteCoords, setDynamicRouteCoords] = useState<[number, number][] | null>(null);

  const hasOrigin = originLat != null && originLng != null;
  const hasDest = destinationLat != null && destinationLng != null;
  // Mostra o mapa com QUALQUER ponto disponível (loja/solicitante) — a rota
  // completa só desenha quando os dois existem, mas a localização nunca some.
  const hasAny = hasOrigin || hasDest;

  const routeCoords: [number, number][] | null = (() => {
    if (!encodedPolyline) return null;
    try {
      const decoded = polyline.decode(encodedPolyline);
      return decoded.map(([lat, lng]) => [lng, lat] as [number, number]);
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    if (routeCoords && routeCoords.length >= 2) {
      setDynamicRouteCoords(null);
      return;
    }
    if (!hasOrigin || !hasDest) return;
    let cancelled = false;

    // ROTA REAL POR VIAS: Mapbox Directions (mesmo token do mapa) com OSRM
    // público de reserva. NUNCA ficar na linha reta quando há rota.
    const mapboxToken =
      (import.meta as any).env?.VITE_MAPBOX_TOKEN ||
      (import.meta as any).env?.VITE_MAPBOX_PUBLIC_TOKEN;

    const tryMapbox = async (): Promise<[number, number][] | null> => {
      if (!mapboxToken) return null;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${originLng},${originLat};${destinationLng},${destinationLat}?geometries=geojson&overview=full&access_token=${mapboxToken}`;
      const data = await fetch(url).then(r => r.json());
      const coords = data.routes?.[0]?.geometry?.coordinates;
      return coords && coords.length >= 2 ? coords : null;
    };
    const tryOsrm = async (): Promise<[number, number][] | null> => {
      const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destinationLng},${destinationLat}?overview=full&geometries=geojson`;
      const data = await fetch(url).then(r => r.json());
      const coords = data.routes?.[0]?.geometry?.coordinates;
      return coords && coords.length >= 2 ? coords : null;
    };

    (async () => {
      try {
        const coords = (await tryMapbox().catch(() => null)) ?? (await tryOsrm());
        if (!cancelled && coords) setDynamicRouteCoords(coords);
      } catch (err) {
        console.warn('[RouteMapCanvas] rota real indisponível:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [hasOrigin, hasDest, originLat, originLng, destinationLat, destinationLng, routeCoords]);

  // Log for debugging
  useEffect(() => {
    console.log(`[RouteMapCanvas:${instanceId}] POLYLINE:`, encodedPolyline ? `${encodedPolyline.substring(0, 40)}… (${encodedPolyline.length} chars)` : null);
  }, [encodedPolyline, instanceId]);

  useEffect(() => {
    // Token: env local primeiro (mesma env do routeService — funciona em dev
    // sem depender de edge function); edge get-mapbox-token como fallback.
    const envToken =
      (import.meta as any).env?.VITE_MAPBOX_TOKEN ||
      (import.meta as any).env?.VITE_MAPBOX_PUBLIC_TOKEN;
    if (envToken) { setToken(envToken); return; }
    supabase.functions.invoke('get-mapbox-token').then(({ data }) => {
      if (data?.token) setToken(data.token);
      else setError(true);
    }).catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (!token || error || !containerRef.current) return;
    if (!hasAny) return; // com UM ponto já renderiza (loja/solicitante)
    const el = containerRef.current;
    if (el.clientWidth === 0 || el.clientHeight === 0) return;

    const sourceId = `route-${instanceId}`;
    const layerOutlineId = `${sourceId}-outline`;
    const layerMainId = `${sourceId}-main`;

    const placeMarkers = (map: mapboxgl.Map) => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      if (hasOrigin) {
        markersRef.current.push(
          new mapboxgl.Marker({ color: originMarkerColor, scale: 0.7 })
            .setLngLat([originLng!, originLat!]).addTo(map));
      }
      if (hasDest) {
        markersRef.current.push(
          new mapboxgl.Marker({ color: destinationMarkerColor, scale: 0.7 })
            .setLngLat([destinationLng!, destinationLat!]).addTo(map));
      }
    };

    const activeRouteCoords = (routeCoords && routeCoords.length >= 2)
      ? routeCoords
      : (dynamicRouteCoords && dynamicRouteCoords.length >= 2 ? dynamicRouteCoords : null);

    const fitToRoute = (map: mapboxgl.Map) => {
      // Um ponto só → centraliza nele (fitBounds de 1 ponto estoura o zoom)
      if (!(hasOrigin && hasDest)) {
        const center: [number, number] = hasDest
          ? [destinationLng!, destinationLat!]
          : [originLng!, originLat!];
        map.jumpTo({ center, zoom: 15 });
        return;
      }
      const bounds = new mapboxgl.LngLatBounds();
      if (activeRouteCoords && activeRouteCoords.length >= 2) {
        activeRouteCoords.forEach(c => bounds.extend(c as [number, number]));
      } else {
        bounds.extend([originLng!, originLat!]);
        bounds.extend([destinationLng!, destinationLat!]);
      }
      map.fitBounds(bounds, { padding: 40, duration: 400 });
    };

    const isFallback = !activeRouteCoords || activeRouteCoords.length < 2;
    const finalRouteCoords = isFallback
      ? (hasOrigin && hasDest
          ? [[originLng!, originLat!], [destinationLng!, destinationLat!]]
          : null)
      : activeRouteCoords!;

    const routeGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: finalRouteCoords ? [{
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: finalRouteCoords },
      }] : [],
    };

    // Update existing map
    if (mapRef.current) {
      const map = mapRef.current;
      const src = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(routeGeoJSON);
      
      const mainLayer = map.getLayer(layerMainId);
      if (mainLayer) {
        if (isFallback) {
          map.setPaintProperty(layerMainId, 'line-dasharray', [4, 4]);
          map.setPaintProperty(layerMainId, 'line-opacity', 0.6);
        } else {
          // It's important to set it to an empty array to reset the dasharray
          // If the mapbox spec throws an error with null, we use undefined or [1] 
          // Usually setting it to undefined or removing the property works, but mapbox gl js can be tricky.
          // Let's use `undefined` or just an empty dash array?
          // The best way to remove the dash array is by setting it to a solid line representation or passing null
          map.setPaintProperty(layerMainId, 'line-dasharray', [1, 0]);
          map.setPaintProperty(layerMainId, 'line-opacity', 0.95);
        }
      }
      
      placeMarkers(map);
      fitToRoute(map);
      return;
    }

    // Create new map
    try {
      mapboxgl.accessToken = token;
      const map = new mapboxgl.Map({
        container: el,
        style: 'mapbox://styles/mapbox/streets-v12',
        interactive,
        attributionControl: false,
        pitchWithRotate: false,
        dragRotate: false,
        scrollZoom: interactive,
        minZoom: 11,
        maxZoom: 18,
      });
      mapRef.current = map;

      map.on('load', () => {
        placeMarkers(map);
        map.addSource(sourceId, { type: 'geojson', data: routeGeoJSON });
        map.addLayer({
          id: layerOutlineId, type: 'line', source: sourceId,
          paint: { 'line-color': outlineColor, 'line-width': 7, 'line-opacity': 0.25 },
        });

        // Initialize dashed or solid based on isFallback
        const paintProps: any = { 
            'line-color': routeColor, 
            'line-width': 4, 
            'line-opacity': isFallback ? 0.6 : 0.95 
        };
        if (isFallback) paintProps['line-dasharray'] = [4, 4];

        map.addLayer({
          id: layerMainId, type: 'line', source: sourceId,
          paint: paintProps,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        fitToRoute(map);
      });

      return () => {
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];
        map.remove();
        mapRef.current = null;
      };
    } catch {
      setError(true);
    }
    // dynamicRouteCoords NAS DEPS é essencial: sem ele, a rota real chegava
    // e o mapa ficava na linha reta de fallback pra sempre (bug original).
  }, [token, error, hasAny, hasOrigin, hasDest, originLat, originLng, destinationLat, destinationLng, routeCoords, dynamicRouteCoords, instanceId, interactive, routeColor, outlineColor, originMarkerColor, destinationMarkerColor]);

  if (!hasAny || error) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-1">
          <MapPin className="h-4 w-4 text-muted-foreground/50 animate-pulse" />
          <span className="text-[11px] text-muted-foreground">{placeholderText}</span>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}
