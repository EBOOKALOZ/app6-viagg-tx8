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

  const hasOrigin = originLat != null && originLng != null;
  const hasDest = destinationLat != null && destinationLng != null;

  const routeCoords: [number, number][] | null = (() => {
    if (!encodedPolyline) return null;
    try {
      const decoded = polyline.decode(encodedPolyline);
      return decoded.map(([lat, lng]) => [lng, lat] as [number, number]);
    } catch {
      return null;
    }
  })();

  // Log for debugging
  useEffect(() => {
    console.log(`[RouteMapCanvas:${instanceId}] POLYLINE:`, encodedPolyline ? `${encodedPolyline.substring(0, 40)}… (${encodedPolyline.length} chars)` : null);
  }, [encodedPolyline, instanceId]);

  useEffect(() => {
    supabase.functions.invoke('get-mapbox-token').then(({ data }) => {
      if (data?.token) setToken(data.token);
      else setError(true);
    }).catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (!token || error || !containerRef.current) return;
    if (!hasOrigin || !hasDest) return;
    const el = containerRef.current;
    if (el.clientWidth === 0 || el.clientHeight === 0) return;

    const sourceId = `route-${instanceId}`;
    const layerOutlineId = `${sourceId}-outline`;
    const layerMainId = `${sourceId}-main`;

    const placeMarkers = (map: mapboxgl.Map) => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [
        new mapboxgl.Marker({ color: originMarkerColor, scale: 0.7 })
          .setLngLat([originLng!, originLat!]).addTo(map),
        new mapboxgl.Marker({ color: destinationMarkerColor, scale: 0.7 })
          .setLngLat([destinationLng!, destinationLat!]).addTo(map),
      ];
    };

    const fitToRoute = (map: mapboxgl.Map) => {
      const bounds = new mapboxgl.LngLatBounds();
      if (routeCoords && routeCoords.length >= 2) {
        routeCoords.forEach(c => bounds.extend(c));
      } else {
        bounds.extend([originLng!, originLat!]);
        bounds.extend([destinationLng!, destinationLat!]);
      }
      map.fitBounds(bounds, { padding: 40, duration: 400 });
    };

    const isFallback = !routeCoords || routeCoords.length < 2;
    const finalRouteCoords = isFallback 
      ? [[originLng!, originLat!], [destinationLng!, destinationLat!]]
      : routeCoords!;

    const routeGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: finalRouteCoords },
      }],
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
  }, [token, error, hasOrigin, hasDest, originLat, originLng, destinationLat, destinationLng, routeCoords, instanceId, interactive, routeColor, outlineColor, originMarkerColor, destinationMarkerColor]);

  if (!hasOrigin || !hasDest || error) {
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
