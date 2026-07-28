import React, { useEffect, useRef, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAdminRealtimeOps, OpsMotoboy, OpsStore, OpsOrder, TimeWindow } from '@/hooks/useAdminRealtimeOps';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import polyline from '@mapbox/polyline';

// Provide your default mapbox token here or via env
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || "";

export function AdminOperationalMap() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const markersRef = useRef<{ [key: string]: mapboxgl.Marker }>({});
    const imbalanceMarkersRef = useRef<{ [key: string]: mapboxgl.Marker }>({});

    const { motoboysList, storesList, ordersList, stats, isLoading, timeWindow, setTimeWindow } = useAdminRealtimeOps();

    useEffect(() => {
        if (!mapContainer.current || mapRef.current) return;

        mapboxgl.accessToken = MAPBOX_TOKEN;
        const initialMap = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/mapbox/dark-v11', // Dark style for Ops Dashboard
            center: [-49.0661, -26.9194], // Default Blumenau SC
            zoom: 12,
            pitch: 45,
        });

        initialMap.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

        initialMap.on('load', () => {
            mapRef.current = initialMap;
            // Additional setup if necessary, like adding empty routing layer
            if (!initialMap.getSource('routes')) {
                initialMap.addSource('routes', {
                    type: 'geojson',
                    data: {
                        type: 'FeatureCollection',
                        features: []
                    }
                });
                initialMap.addLayer({
                    id: 'routes-layer',
                    type: 'line',
                    source: 'routes',
                    layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    paint: {
                        'line-color': '#f97316', // Orange
                        'line-width': 4,
                        'line-opacity': 0.8
                    }
                });
            }

            // Add Heatmap Source & Layer
            if (!initialMap.getSource('demand-heatmap')) {
                initialMap.addSource('demand-heatmap', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });

                initialMap.addLayer({
                    id: 'demand-heat',
                    type: 'heatmap',
                    source: 'demand-heatmap',
                    maxzoom: 15,
                    paint: {
                        // Increase weight based on some property if needed, currently uniform
                        'heatmap-weight': 1,
                        // Color ramp: blue (low), yellow (medium), orange (high), red (severe)
                        'heatmap-color': [
                            'interpolate',
                            ['linear'],
                            ['heatmap-density'],
                            0, 'rgba(33,102,172,0)',
                            0.2, 'rgb(103,169,207)',
                            0.4, 'rgb(209,229,240)',
                            0.6, 'rgb(253,219,199)',
                            0.8, 'rgb(239,138,98)',
                            1, 'rgb(178,24,43)'
                        ],
                        'heatmap-radius': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            0, 10,
                            15, 40
                        ],
                        'heatmap-opacity': 0.6
                    }
                });
            }
        });

        const currentMarkers = markersRef.current;
        return () => {
            Object.values(currentMarkers).forEach(m => m.remove());
            initialMap.remove();
        };
    }, []);

    // Update Markers when data changes
    useEffect(() => {
        if (!mapRef.current) return;

        const currentIds = new Set<string>();

        const statusMap: Record<string, string> = {
            'online': '🟢 Disponível',
            'offline': '🔴 Offline',
            'in_delivery': '🛵 Em Entrega'
        };

        // 1. Draw Stores (Merchants) - Blue
        storesList.forEach(store => {
            if (!store.lat || !store.lng) return;
            const id = `store_${store.id}`;
            currentIds.add(id);

            if (!markersRef.current[id]) {
                const el = document.createElement('div');
                el.className = 'w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-lg cursor-pointer transition-transform hover:scale-125';

                const popup = new mapboxgl.Popup({ offset: 15 }).setHTML(`
                    <div class="p-2 min-w-[150px]">
                        <h3 class="font-bold text-sm">${store.name}</h3>
                        <p class="text-xs text-gray-500">Corridas: ${store.deliveriesToday}</p>
                    </div>
                `);

                markersRef.current[id] = new mapboxgl.Marker(el)
                    .setLngLat([store.lng, store.lat])
                    .setPopup(popup)
                    .addTo(mapRef.current!);
            } else {
                markersRef.current[id].setLngLat([store.lng, store.lat]);
            }
        });

        // 2. Draw Motoboys
        motoboysList.forEach(moto => {
            if (!moto.lat || !moto.lng) return;
            const id = `moto_${moto.id}`;
            currentIds.add(id);

            const colorClass = moto.status === 'online' ? 'bg-green-500' :
                moto.status === 'in_delivery' ? 'bg-orange-500' : 'bg-gray-500';

            if (!markersRef.current[id]) {
                const el = document.createElement('div');
                el.className = `w-4 h-4 rounded-full ${colorClass} border-2 border-white shadow-lg cursor-pointer transition-transform animate-pulse`;

                const popup = new mapboxgl.Popup({ offset: 15 }).setHTML(`
                    <div class="p-2 min-w-[150px]">
                        <h3 class="font-bold text-sm text-black">${moto.name}</h3>
                        <p class="text-xs text-gray-700 font-medium">Status: <span class="capitalize">${statusMap[moto.status] || moto.status}</span></p>
                    </div>
                `);

                markersRef.current[id] = new mapboxgl.Marker({ element: el })
                    .setLngLat([moto.lng, moto.lat])
                    .setPopup(popup)
                    .addTo(mapRef.current!);
            } else {
                markersRef.current[id].setLngLat([moto.lng, moto.lat]);
                // update color
                const el = markersRef.current[id].getElement();
                el.className = `w-4 h-4 rounded-full ${colorClass} border-2 border-white shadow-lg cursor-pointer transition-transform animate-pulse`;

                // update popup text
                const popup = markersRef.current[id].getPopup();
                if (popup) {
                    popup.setHTML(`
                        <div class="p-2 min-w-[150px]">
                            <h3 class="font-bold text-sm text-black">${moto.name}</h3>
                            <p class="text-xs text-gray-700 font-medium">Status: <span class="capitalize">${statusMap[moto.status] || moto.status}</span></p>
                        </div>
                    `);
                }
            }
        });

        // 3. Draw Pending Orders (Waiting Motoboy)
        ordersList.forEach(order => {
            if (order.status !== 'waiting_motoboy' && order.status !== 'created_a') return;
            if (!order.pickup_lat || !order.pickup_lng) return;
            const id = `order_${order.id}`;
            currentIds.add(id);

            if (!markersRef.current[id]) {
                const el = document.createElement('div');
                el.className = `w-5 h-5 rounded flex items-center justify-center bg-red-600 border border-white shadow-lg cursor-pointer animate-bounce`;
                el.innerHTML = `<span class="text-[10px] text-white font-bold">!</span>`;

                const popup = new mapboxgl.Popup({ offset: 15 }).setHTML(`
                    <div class="p-2 min-w-[150px] text-black">
                        <h3 class="font-bold text-[13px] text-red-600">Aguardando Motoboy</h3>
                        <p class="text-xs text-gray-700 mt-1">Valor: R$ ${order.price.toFixed(2)}</p>
                    </div>
                `);

                markersRef.current[id] = new mapboxgl.Marker({ element: el })
                    .setLngLat([order.pickup_lng, order.pickup_lat])
                    .setPopup(popup)
                    .addTo(mapRef.current!);
            }
        });

        // Cleanup removed markers
        Object.keys(markersRef.current).forEach(key => {
            if (!currentIds.has(key)) {
                markersRef.current[key].remove();
                delete markersRef.current[key];
            }
        });

        // Update Heatmap Source
        const heatmapSource = mapRef.current.getSource('demand-heatmap') as mapboxgl.GeoJSONSource;
        if (heatmapSource) {
            const heatmapFeatures = ordersList.filter(o => o.pickup_lat && o.pickup_lng).map(o => ({
                type: 'Feature',
                properties: { id: o.id },
                geometry: {
                    type: 'Point',
                    coordinates: [o.pickup_lng, o.pickup_lat]
                }
            }));
            heatmapSource.setData({
                type: 'FeatureCollection',
                features: heatmapFeatures as GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>[]
            });
        }

    }, [motoboysList, storesList, ordersList]);

    // Update Routes layer
    useEffect(() => {
        if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;

        const activeRoutes = ordersList
            .filter(o => ['accepted', 'in_progress'].includes(o.status) && o.route_polyline)
            .map(o => {
                try {
                    const coords = polyline.decode(o.route_polyline!).map(c => [c[1], c[0]]);
                    return {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: coords
                        }
                    };
                } catch (e) { return null; }
            }).filter(Boolean);

        const source = mapRef.current.getSource('routes') as mapboxgl.GeoJSONSource;
        if (source) {
            source.setData({
                type: 'FeatureCollection',
                features: activeRoutes as GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>[]
            });
        }
    }, [ordersList]);

    // Data Aggregation for Demand Panel & Imbalance
    const neighborhoodStats = useMemo(() => {
        const stats: Record<string, { name: string; count: number; waitTimeMs: number; waitingCount: number; lats: number[]; lngs: number[] }> = {};
        const now = Date.now();

        ordersList.forEach(o => {
            const nb = o.neighborhood || 'Desconhecido';
            if (!stats[nb]) {
                stats[nb] = { name: nb, count: 0, waitTimeMs: 0, waitingCount: 0, lats: [], lngs: [] };
            }
            stats[nb].count++;

            if (o.status === 'waiting_motoboy') {
                stats[nb].waitingCount++;
                const createdTs = new Date(o.created_at).getTime();
                stats[nb].waitTimeMs += (now - createdTs);
            }

            if (o.pickup_lat && o.pickup_lng) {
                stats[nb].lats.push(o.pickup_lat);
                stats[nb].lngs.push(o.pickup_lng);
            }
        });

        const array = Object.values(stats).map(s => {
            const avgWaitMin = s.waitingCount > 0 ? (s.waitTimeMs / s.waitingCount) / 60000 : 0;
            const avgLat = s.lats.length > 0 ? s.lats.reduce((a, b) => a + b, 0) / s.lats.length : null;
            const avgLng = s.lngs.length > 0 ? s.lngs.reduce((a, b) => a + b, 0) / s.lngs.length : null;
            return { ...s, avgWaitMin, avgLat, avgLng };
        });

        // Top demand highest to lowest
        array.sort((a, b) => b.count - a.count);
        return array;
    }, [ordersList]);

    // Update Imbalance Map Markers (Blinking Alerts)
    useEffect(() => {
        if (!mapRef.current) return;

        const currentIds = new Set<string>();
        const onlineCount = stats.onlineDrivers; // Total online in the city

        neighborhoodStats.forEach(nb => {
            // Imbalance Condition: Waiting orders in this neighborhood > total online motoboys globally
            if (nb.waitingCount > onlineCount && nb.avgLat && nb.avgLng) {
                const id = `imbalance_${nb.name}`;
                currentIds.add(id);

                if (!imbalanceMarkersRef.current[id]) {
                    const el = document.createElement('div');
                    el.className = 'w-16 h-16 rounded-full bg-red-600/30 border-2 border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.8)] animate-pulse flex items-center justify-center cursor-pointer pointer-events-auto';
                    el.innerHTML = `<span class="text-red-900 font-bold text-xs bg-white/70 px-1 rounded">Alta Demanda</span>`;

                    imbalanceMarkersRef.current[id] = new mapboxgl.Marker({ element: el })
                        .setLngLat([nb.avgLng, nb.avgLat])
                        .addTo(mapRef.current!);
                } else {
                    imbalanceMarkersRef.current[id].setLngLat([nb.avgLng, nb.avgLat]);
                }
            }
        });

        Object.keys(imbalanceMarkersRef.current).forEach(key => {
            if (!currentIds.has(key)) {
                imbalanceMarkersRef.current[key].remove();
                delete imbalanceMarkersRef.current[key];
            }
        });

    }, [neighborhoodStats, stats.onlineDrivers]);

    return (
        <div className="relative w-full h-[800px] rounded-xl overflow-hidden shadow-2xl border border-border">
            {/* Map Container */}
            <div ref={mapContainer} className="absolute inset-0 w-full h-full bg-muted" />

            {/* Top Status Filters / Bar */}
            <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none z-10">
                <div className="flex gap-2 pointer-events-auto">
                    <Badge variant="secondary" className="bg-background/80 backdrop-blur shadow h-9 flex items-center px-3 text-sm">
                        📍 Blumenau SC
                    </Badge>
                    <Select value={timeWindow} onValueChange={(val) => setTimeWindow(val as TimeWindow)}>
                        <SelectTrigger className="w-[140px] bg-background/80 backdrop-blur shadow border-none h-9">
                            <SelectValue placeholder="Período" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="10m">Últimos 10 Minutos</SelectItem>
                            <SelectItem value="30m">Últimos 30 Minutos</SelectItem>
                            <SelectItem value="1h">Última 1 Hora</SelectItem>
                            <SelectItem value="24h">Últimas 24 Horas</SelectItem>
                        </SelectContent>
                    </Select>
                    {isLoading && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/50 backdrop-blur shadow animate-pulse h-9 flex items-center">
                            Carregando mapa...
                        </Badge>
                    )}
                </div>
            </div>

            {/* Right Sidebar (Ops Stats) */}
            <div className="absolute top-4 right-4 bottom-4 w-72 flex flex-col gap-3 pointer-events-auto z-10">

                {/* Aguardando Card */}
                <Card className="bg-background/80 backdrop-blur-md border border-border/50 shadow-lg">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center justify-between text-red-500">
                            Aguardando Motoboy
                            <span className="flex h-3 w-3 relative">
                                {stats.waiting > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
                                <span className={`relative inline-flex rounded-full h-3 w-3 ${stats.waiting > 0 ? 'bg-red-500' : 'bg-muted'}`}></span>
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{stats.waiting}</div>
                    </CardContent>
                </Card>

                {/* Em Andamento Card */}
                <Card className="bg-background/80 backdrop-blur-md border border-border/50 shadow-lg">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center justify-between text-orange-500">
                            Em Andamento
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{stats.inProgress}</div>
                    </CardContent>
                </Card>

                {/* Motoboys Online / Ativos */}
                <Card className="bg-background/80 backdrop-blur-md border border-border/50 shadow-lg">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center justify-between text-green-500">
                            Motoboys Online
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex justify-between items-end">
                            <div className="text-3xl font-bold">{stats.onlineDrivers}</div>
                            <div className="text-xs text-muted-foreground pb-1">
                                {stats.deliveringDrivers} ocupados
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Top Demand Neighborhoods */}
                <Card className="bg-background/80 backdrop-blur-md border border-border/50 shadow-lg flex-1 overflow-hidden flex flex-col">
                    <CardHeader className="pb-2 shrink-0">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <span className="text-blue-500">🔥 Top Bairros de Demanda</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {neighborhoodStats.length === 0 ? (
                            <div className="text-xs text-muted-foreground text-center pt-4">Sem dados no período</div>
                        ) : (
                            <div className="space-y-3">
                                {neighborhoodStats.slice(0, 10).map((nb, i) => {
                                    const isCritical = nb.waitingCount > stats.onlineDrivers;
                                    return (
                                        <div key={nb.name} className={`flex flex-col gap-1 p-2 rounded-md border ${isCritical ? 'bg-red-500/10 border-red-500/30' : 'bg-muted/50 border-border/50'}`}>
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-bold truncate max-w-[140px]" title={nb.name}>
                                                    {i + 1}. {nb.name}
                                                </span>
                                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                                    {nb.count} ped
                                                </Badge>
                                            </div>
                                            {isCritical && (
                                                <span className="text-[10px] text-red-500 font-semibold animate-pulse">
                                                    ⚠️ Alerta de Desequilíbrio
                                                </span>
                                            )}
                                            {nb.waitingCount > 0 && (
                                                <span className="text-[10px] text-muted-foreground">
                                                    Média espera: {nb.avgWaitMin.toFixed(0)} min
                                                </span>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

            </div>
        </div>
    );
}

