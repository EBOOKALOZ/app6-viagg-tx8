import React, { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createMap, mapboxgl } from "@/skills/maps/mapboxClient";
import { addStoreMarker, addMotoboyMarker, addDropMarker } from "@/skills/maps/markersService";
import { drawRoute } from "@/skills/maps/drawRoute";

export interface OperationalMapProps {
    className?: string;
}

export function OperationalMap({ className }: OperationalMapProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const markersRef = useRef<{ [key: string]: mapboxgl.Marker }>({});

    useEffect(() => {
        if (!mapContainer.current || mapRef.current) return;

        // Inicializa o mapa com um zoom na cidade principal (ajustável)
        const map = createMap(mapContainer.current, [-49.2733, -26.9194], 12);
        mapRef.current = map;

        map.on('load', () => {
            fetchStores();
            fetchMotoboys();
            fetchOrders();
        });

        // Supabase Realtime Subscriptions
        const storesSub = supabase.channel('merchant_stores-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_stores' }, () => {
                fetchStores();
            }).subscribe();

        const motoboysSub = supabase.channel('motoboys-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'motoboy_locations' }, () => {
                fetchMotoboys();
            }).subscribe();

        const ordersSub = supabase.channel('orders-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders' }, () => {
                fetchOrders();
            }).subscribe();

        return () => {
            storesSub.unsubscribe();
            motoboysSub.unsubscribe();
            ordersSub.unsubscribe();
            if (map) {
                map.remove();
            }
            mapRef.current = null;
        };
    }, []);

    const fetchStores = async () => {
        const { data, error } = await supabase
            .from('merchant_stores')
            .select('id, nome_loja, latitude, longitude')
            .eq('status', 'active');

        if (error || !data) return;

        // Remove marcadores e rotas antigas
        Object.keys(markersRef.current).forEach(key => {
            if (key.startsWith('store-')) {
                markersRef.current[key].remove();
                delete markersRef.current[key];
            }
        });

        data.forEach(store => {
            if (store.latitude && store.longitude && mapRef.current) {
                const marker = addStoreMarker(mapRef.current, store.latitude, store.longitude);
                markersRef.current[`store-${store.id}`] = marker;
            }
        });
    };

    const fetchMotoboys = async () => {
        const { data, error } = await supabase
            .from('motoboy_locations')
            .select('id, lat, lng, status')
            .eq('status', 'online');

        if (error || !data) return;

        Object.keys(markersRef.current).forEach(key => {
            if (key.startsWith('motoboy-')) {
                markersRef.current[key].remove();
                delete markersRef.current[key];
            }
        });

        data.forEach(motoboy => {
            if (motoboy.lat && motoboy.lng && mapRef.current) {
                const marker = addMotoboyMarker(mapRef.current, motoboy.lat, motoboy.lng);
                markersRef.current[`motoboy-${motoboy.id}`] = marker;
            }
        });
    };

    const fetchOrders = async () => {
        const { data, error } = await supabase
            .from('delivery_orders')
            .select('id, pickup_lat, pickup_lng, drop_lat, drop_lng, status, route_geometry')
            .in('status', ['open', 'accepted', 'in_progress']);

        if (error || !data) return;

        Object.keys(markersRef.current).forEach(key => {
            if (key.startsWith('drop-')) {
                markersRef.current[key].remove();
                delete markersRef.current[key];
            }
        });

        // Limpar rotas antigas do mapa
        if (mapRef.current) {
            const map = mapRef.current;
            const layers = map.getStyle()?.layers || [];
            layers.forEach(layer => {
                if (layer.id.startsWith('route-line-')) {
                    map.removeLayer(layer.id);
                }
            });
            const sources = map.getStyle()?.sources || {};
            Object.keys(sources).forEach(sourceId => {
                if (sourceId.startsWith('route-')) {
                    map.removeSource(sourceId);
                }
            });
        }

        data.forEach(order => {
            if (order.drop_lat && order.drop_lng && mapRef.current) {
                // Opcional: só botar destino se a entrega for pendente/andamento
                const marker = addDropMarker(mapRef.current, order.drop_lat, order.drop_lng);
                markersRef.current[`drop-${order.id}`] = marker;
            }

            if (['accepted', 'in_progress'].includes(order.status) && order.route_geometry && mapRef.current) {
                try {
                    let geom = order.route_geometry;
                    if (typeof geom === 'string') {
                        geom = JSON.parse(geom);
                    }
                    drawRoute(mapRef.current, geom, `route-${order.id}`, `route-line-${order.id}`);
                } catch (e) {
                    console.error("Erro ao desenhar rota operacional da ordem", order.id, e);
                }
            }
        });
    };

    return (
        <div className={`w-full h-full min-h-[400px] relative rounded-lg overflow-hidden border border-border shadow-sm ${className || ""}`}>
            <div ref={mapContainer} className="absolute inset-0 z-0" />

            {/* Elementos de UI extras sobre o mapa (legenda) */}
            <div className="absolute top-4 left-4 z-10 bg-background/90 backdrop-blur-sm p-3 rounded-md shadow-md border border-border flex flex-col gap-2 text-sm">
                <h3 className="font-semibold text-foreground mb-1">Operação em Tempo Real</h3>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#ff6a00]"></div>
                    <span className="text-muted-foreground">Lojas ativas</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#3498db]"></div>
                    <span className="text-muted-foreground">Motoboys online</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#2ecc71]"></div>
                    <span className="text-muted-foreground">Entregas e Destinos</span>
                </div>
            </div>
        </div>
    );
}
