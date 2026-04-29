import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import polyline from '@mapbox/polyline';
import 'mapbox-gl/dist/mapbox-gl.css';

interface RouteLayer {
  color: string;
  outlineColor: string;
  coordinates: [number, number][];
}

interface MarkerDef {
  color: string;
  lngLat: [number, number];
}

interface Props {
  token: string;
  markers: MarkerDef[];
  route: RouteLayer | null;
  onClose: () => void;
}

export default function FullscreenMapModal({ token, markers, route, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      attributionControl: false,
      pitchWithRotate: false,
      dragRotate: false,
      minZoom: 11,
      maxZoom: 18,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      markers.forEach(m => {
        new mapboxgl.Marker({ color: m.color, scale: 0.8 })
          .setLngLat(m.lngLat)
          .addTo(map);
      });

      if (route) {
        map.addSource('route', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.coordinates } },
        });
        map.addLayer({ id: 'route-outline', type: 'line', source: 'route', paint: { 'line-color': route.outlineColor, 'line-width': 7, 'line-opacity': 0.3 } });
        map.addLayer({ id: 'route-main', type: 'line', source: 'route', paint: { 'line-color': route.color, 'line-width': 4, 'line-opacity': 0.95 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      }

      const bounds = new mapboxgl.LngLatBounds();
      markers.forEach(m => bounds.extend(m.lngLat));
      if (route) route.coordinates.forEach(c => bounds.extend(c as [number, number]));
      map.fitBounds(bounds, { padding: 50, duration: 400 });
    });

    return () => map.remove();
  }, [token, markers, route]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16, zIndex: 10,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(255,255,255,0.95)', border: 'none',
          fontSize: 20, fontWeight: 'bold', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        ✕
      </button>
    </div>
  );
}
