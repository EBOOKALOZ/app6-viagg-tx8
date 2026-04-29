import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminH3Expansion, H3Cell, H3Status } from '@/hooks/useAdminH3Expansion';
import { cellToBoundary } from 'h3-js';
import { Badge } from '@/components/ui/badge';
import { Map as MapIcon, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Substitua pelo seu token. Idealmente pego de uma env var
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || "";

export function H3ExpansionMap() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const { cells } = useAdminH3Expansion();
    const [mapLoaded, setMapLoaded] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Initialize Map
    useEffect(() => {
        if (map.current || !mapContainer.current) return;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [-49.0661, -26.9194], // Blumenau default
            zoom: 11,
            pitch: 45
        });

        map.current.on('load', () => {
            setMapLoaded(true);

            // Add source for H3 polygons
            map.current?.addSource('h3-cells', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            });

            // Add layer for H3 polygons
            map.current?.addLayer({
                id: 'h3-cells-fill',
                type: 'fill',
                source: 'h3-cells',
                paint: {
                    'fill-color': ['get', 'color'],
                    'fill-opacity': 0.6
                }
            });

            // Add inner borders
            map.current?.addLayer({
                id: 'h3-cells-line',
                type: 'line',
                source: 'h3-cells',
                paint: {
                    'line-color': '#ffffff',
                    'line-width': 1,
                    'line-opacity': 0.3
                }
            });

            // Add popup interaction
            map.current?.on('click', 'h3-cells-fill', (e) => {
                if (!e.features || e.features.length === 0) return;
                const props = e.features[0].properties;

                new mapboxgl.Popup()
                    .setLngLat(e.lngLat)
                    .setHTML(`
                        <div class="p-2 min-w-[200px] text-zinc-900">
                            <h3 class="font-bold border-b pb-1 mb-2">H3: ${props?.h3_index}</h3>
                            <div class="space-y-1 text-sm">
                                <p><span class="font-semibold">Cidade:</span> ${props?.city_name || 'N/A'}</p>
                                <p><span class="font-semibold">Status:</span> ${props?.status}</p>
                                <p><span class="font-semibold">Motoboys:</span> ${props?.motoboys_registered} / 3</p>
                                <p><span class="font-semibold">Lojistas:</span> ${props?.merchants_registered} / 2</p>
                                <p><span class="font-semibold">Entregas:</span> ${props?.deliveries_completed}</p>
                            </div>
                        </div>
                    `)
                    .addTo(map.current!);
            });

            map.current?.on('mouseenter', 'h3-cells-fill', () => {
                if (map.current) map.current.getCanvas().style.cursor = 'pointer';
            });
            map.current?.on('mouseleave', 'h3-cells-fill', () => {
                if (map.current) map.current.getCanvas().style.cursor = '';
            });

        });

        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, []);

    // Update Data
    useEffect(() => {
        if (!mapLoaded || !map.current || !cells.length) return;

        const features = cells.map(cell => {
            // cellToBoundary returns coordinates as [lat, lng]. Mapbox needs [lng, lat]
            const boundary = cellToBoundary(cell.h3_index).map(coord => [coord[1], coord[0]]);
            // Close the polygon
            boundary.push(boundary[0]);

            let color = '#3b82f6'; // blue (downloads)
            if (cell.status === 'em_espera') color = '#eab308'; // yellow
            else if (cell.status === 'ativo') color = '#22c55e'; // green

            return {
                type: 'Feature',
                properties: {
                    ...cell,
                    color
                },
                geometry: {
                    type: 'Polygon',
                    coordinates: [boundary]
                }
            };
        });

        const geojson: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: features as GeoJSON.Feature[]
        };

        const source = map.current.getSource('h3-cells') as mapboxgl.GeoJSONSource;
        if (source) {
            source.setData(geojson);
        }

    }, [cells, mapLoaded]);

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
        setTimeout(() => map.current?.resize(), 100);
    };

    return (
        <Card className={`bg-background border-border/50 shadow-sm overflow-hidden ${isFullscreen ? 'fixed inset-4 z-50' : 'relative h-[500px]'}`}>
            <CardHeader className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent border-none text-white pb-6 rounded-t-lg">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                        <MapIcon className="h-5 w-5 text-blue-400" />
                        Mapa TÃ¡tico H3 de ExpansÃ£o
                    </CardTitle>
                    <div className="flex gap-2 items-center bg-black/40 backdrop-blur-md p-1 rounded-md border border-white/10">
                        <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-500/50">CaptaÃ§Ã£o</Badge>
                        <Badge variant="outline" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/50">Em Espera</Badge>
                        <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-500/50">Ativo</Badge>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:bg-white/20" onClick={toggleFullscreen}>
                            <Maximize2 className="h-3 w-3" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0 h-full w-full">
                <div ref={mapContainer} className="w-full h-full rounded-b-lg" />
            </CardContent>
        </Card>
    );
}

