import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface StoreMapUltraProps {
    lat?: number | null;
    lng?: number | null;
}

export function StoreMapUltra({ lat, lng }: StoreMapUltraProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const marker = useRef<mapboxgl.Marker | null>(null);

    useEffect(() => {
        // 1. Validate coordinates
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
            return;
        }

        // 2. Mapbox Token Setup
        const token = import.meta.env.VITE_MAPBOX_TOKEN;
        if (!token) {
            console.error("StoreMapUltra: VITE_MAPBOX_TOKEN is missing.");
            return;
        }
        mapboxgl.accessToken = token;

        if (!mapContainer.current) return;

        // 3. Initialize Ultra Premium Map (mapbox/standard)
        try {
            map.current = new mapboxgl.Map({
                container: mapContainer.current,
                style: 'mapbox://styles/mapbox/standard',
                center: [lng, lat],
                zoom: 15,
                pitch: 60,
                bearing: -20,
                antialias: true, // helps with 3D edges
            });

            // 4. Wait for map style to load before adding 3D layers and markers
            map.current.on('style.load', () => {
                if (!map.current) return;

                // Custom Corporate Marker Element (Verde Institucional #16a34a)
                const el = document.createElement('div');
                el.className = 'custom-marker';
                el.style.width = '32px';
                el.style.height = '32px';
                el.style.borderRadius = '50% 50% 50% 0';
                el.style.backgroundColor = '#16a34a'; // Institutional Green
                el.style.transform = 'rotate(-45deg)';
                el.style.boxShadow = '0 8px 16px rgba(0,0,0,0.3)';
                el.style.border = '3px solid white';

                // Inner dot
                const innerDot = document.createElement('div');
                innerDot.style.width = '12px';
                innerDot.style.height = '12px';
                innerDot.style.backgroundColor = 'white';
                innerDot.style.borderRadius = '50%';
                innerDot.style.position = 'absolute';
                innerDot.style.top = '50%';
                innerDot.style.left = '50%';
                innerDot.style.transform = 'translate(-50%, -50%)';
                el.appendChild(innerDot);

                // Add Marker
                marker.current = new mapboxgl.Marker({ element: el })
                    .setLngLat([lng, lat])
                    .addTo(map.current);

                // Add 3D Building Extrusions (Institutional Green)
                const layers = map.current.getStyle()?.layers;
                if (!layers) return;

                let labelLayerId: string | undefined;
                for (let i = 0; i < layers.length; i++) {
                    if (layers[i].type === 'symbol' && layers[i].layout && layers[i].layout?.['text-field']) {
                        labelLayerId = layers[i].id;
                        break;
                    }
                }

                map.current.addLayer(
                    {
                        id: '3d-buildings-ultra',
                        source: 'composite',
                        'source-layer': 'building',
                        filter: ['==', 'extrude', 'true'],
                        type: 'fill-extrusion',
                        minzoom: 15,
                        paint: {
                            'fill-extrusion-color': '#16a34a', // Institutional Green
                            'fill-extrusion-height': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                15,
                                0,
                                15.05,
                                ['get', 'height']
                            ],
                            'fill-extrusion-base': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                15,
                                0,
                                15.05,
                                ['get', 'min_height']
                            ],
                            'fill-extrusion-opacity': 0.6
                        }
                    },
                    labelLayerId // Insert below labels so text is readable
                );
            });
        } catch (error) {
            console.error("StoreMapUltra Initialization Error:", error);
        }

        // 5. Cleanup memory on unmount
        return () => {
            if (marker.current) {
                marker.current.remove();
            }
            if (map.current) {
                map.current.remove();
            }
        };
    }, [lat, lng]);

    // Fallback for missing coordinates
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        return (
            <div className="w-full h-[400px] flex items-center justify-center bg-muted/20 border border-dashed border-border rounded-xl">
                <p className="text-muted-foreground text-sm font-medium">Localização não configurada</p>
            </div>
        );
    }

    return (
        <div className="w-full h-[400px] rounded-xl overflow-hidden shadow-2xl border border-merchant/40 relative">
            <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
        </div>
    );
}
