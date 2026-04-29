import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// Tipos base para o painel de operações
export interface OpsMotoboy {
    id: string; // auth.users.id
    name: string;
    status: 'online' | 'offline' | 'in_delivery';
    lat: number | null;
    lng: number | null;
    onlineTime?: number;
    deliveriesToday?: number;
    updatedAt: string;
}

export interface OpsStore {
    id: string;
    name: string;
    lat: number;
    lng: number;
    active: boolean;
    walletBalance: number;
    deliveriesToday: number;
}

export interface OpsOrder {
    id: string;
    status: string; // 'waiting_motoboy', 'accepted', 'in_progress', etc.
    merchant_id: string;
    professional_uid: string | null;
    pickup_lat: number;
    pickup_lng: number;
    destination_lat: number;
    destination_lng: number;
    route_polyline: string | null;
    price: number;
    created_at: string;
    neighborhood?: string;
    city_id?: string;
}

export type TimeWindow = '10m' | '30m' | '1h' | '24h';

export function useAdminRealtimeOps() {
    const [timeWindow, setTimeWindow] = useState<TimeWindow>('24h');
    const [motoboys, setMotoboys] = useState<Record<string, OpsMotoboy>>({});
    const [stores, setStores] = useState<Record<string, OpsStore>>({});
    const [orders, setOrders] = useState<Record<string, OpsOrder>>({});
    const [isLoading, setIsLoading] = useState(true);

    const initData = async () => {
        try {
            // 1. Fetch active professionals presence
            const { data: prosData } = await supabase
                .from("professional_presence")
                .select("user_id, status, last_location, updated_at");

            // Fetch names for active pros
            const userIds = prosData?.map(p => p.user_id).filter(Boolean) || [];
            const profilesDict: Record<string, string> = {};
            if (userIds.length > 0) {
                const { data: profiles } = await supabase
                    .from("profiles")
                    .select("id, full_name")
                    .in("id", userIds);
                profiles?.forEach(p => {
                    profilesDict[p.id] = p.full_name || "Desconhecido";
                });
            }

            const initialMotoboys: Record<string, OpsMotoboy> = {};
            prosData?.forEach(p => {
                if (!p.user_id) return;

                // Parse last_location if it's a point string like "POINT(lng lat)" 
                // However, without postgis, it might just be stored differently or need custom parsing.
                // Assuming standard fallback or we'll fetch lat/lng if we add them to the table.
                let lat = null, lng = null;
                if (typeof p.last_location === 'string' && p.last_location.startsWith('POINT(')) {
                    const match = p.last_location.match(/POINT\(([^ ]+) ([^)]+)\)/);
                    if (match) {
                        lng = parseFloat(match[1]);
                        lat = parseFloat(match[2]);
                    }
                }

                initialMotoboys[p.user_id] = {
                    id: p.user_id,
                    name: profilesDict[p.user_id] || "Motoboy Ativo",
                    status: p.status === 'online' ? 'online' : (p.status as any),
                    lat,
                    lng,
                    updatedAt: p.updated_at
                };
            });
            setMotoboys(initialMotoboys);

            // 2. Fetch active today's orders
            const now = new Date();
            const gteDate = new Date();
            switch (timeWindow) {
                case '10m': gteDate.setMinutes(now.getMinutes() - 10); break;
                case '30m': gteDate.setMinutes(now.getMinutes() - 30); break;
                case '1h': gteDate.setHours(now.getHours() - 1); break;
                case '24h': gteDate.setHours(now.getHours() - 24); break;
            }

            const { data: activeOrders } = await supabase
                .from("service_orders")
                .select("*")
                .in("status", ["waiting_motoboy", "accepted", "in_progress", "created_a"])
                .gte("created_at", gteDate.toISOString());

            const initialOrders: Record<string, OpsOrder> = {};
            activeOrders?.forEach(o => {
                initialOrders[o.id] = {
                    id: o.id,
                    status: o.status,
                    merchant_id: o.merchant_id || '',
                    professional_uid: o.professional_uid,
                    pickup_lat: Number(o.pickup_lat) || 0,
                    pickup_lng: Number(o.pickup_lng) || 0,
                    destination_lat: Number(o.destination_lat) || 0,
                    destination_lng: Number(o.destination_lng) || 0,
                    route_polyline: o.route_polyline,
                    price: (Number(o.price_total_cents) || 0) / 100,
                    created_at: o.created_at,
                    city_id: o.city_id,
                    neighborhood: o.metadata?.store_neighborhood || 'Bairro Desconhecido'
                };

                // If order is active and has a pro, mark pro as in_delivery
                if (o.professional_uid && initialMotoboys[o.professional_uid]) {
                    initialMotoboys[o.professional_uid].status = 'in_delivery';
                }
            });
            setOrders(initialOrders);

            // 3. Update state finally with marked delivery statuses
            setMotoboys(prev => ({ ...prev, ...initialMotoboys }));

            // 4. Fetch merchants
            const storeIds = [...new Set(activeOrders?.map(o => o.merchant_id).filter(Boolean))] as string[];
            if (storeIds.length > 0) {
                const { data: storesData } = await supabase
                    .from("merchant_stores")
                    .select("id, name, lat, lng")
                    .in("id", storeIds);

                const initialsStores: Record<string, OpsStore> = {};
                storesData?.forEach(s => {
                    initialsStores[s.id] = {
                        id: s.id,
                        name: s.name,
                        lat: Number(s.lat) || 0,
                        lng: Number(s.lng) || 0,
                        active: true,
                        walletBalance: 0,
                        deliveriesToday: 0
                    };
                });
                setStores(initialsStores);
            }
        } catch (e) {
            console.error("Error loading ops data", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        initData();

        // Subscriptions
        const channel = supabase.channel('admin-ops-center')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'service_orders' }, payload => {
                const newRec = payload.new as any;
                if (!newRec || !newRec.id) return;

                setOrders(prev => {
                    if (['delivered', 'canceled'].includes(newRec.status)) {
                        const next = { ...prev };
                        delete next[newRec.id];
                        return next;
                    }

                    return {
                        ...prev,
                        [newRec.id]: {
                            ...prev[newRec.id],
                            id: newRec.id,
                            status: newRec.status,
                            merchant_id: newRec.merchant_id || '',
                            professional_uid: newRec.professional_uid,
                            pickup_lat: Number(newRec.pickup_lat) || prev[newRec.id]?.pickup_lat || 0,
                            pickup_lng: Number(newRec.pickup_lng) || prev[newRec.id]?.pickup_lng || 0,
                            destination_lat: Number(newRec.destination_lat) || prev[newRec.id]?.destination_lat || 0,
                            destination_lng: Number(newRec.destination_lng) || prev[newRec.id]?.destination_lng || 0,
                            route_polyline: newRec.route_polyline || prev[newRec.id]?.route_polyline,
                            price: (Number(newRec.price_total_cents) || 0) / 100,
                            created_at: newRec.created_at || prev[newRec.id]?.created_at
                        }
                    };
                });

                // Update motoboy status if taking/dropping order
                if (newRec.professional_uid) {
                    setMotoboys(prev => {
                        const m = prev[newRec.professional_uid];
                        if (!m) return prev;

                        const newStatus = ['delivered', 'canceled'].includes(newRec.status) ? 'online' : 'in_delivery';
                        return {
                            ...prev,
                            [newRec.professional_uid]: { ...m, status: newStatus }
                        };
                    });
                }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'professional_presence' }, payload => {
                const newRec = payload.new as any;
                if (!newRec || !newRec.user_id) return;

                setMotoboys(prev => {
                    const existing = prev[newRec.user_id] || { id: newRec.user_id, name: "Motoboy", deliveriesToday: 0 };

                    let lat = existing.lat, lng = existing.lng;
                    if (typeof newRec.last_location === 'string' && newRec.last_location.startsWith('POINT(')) {
                        const match = newRec.last_location.match(/POINT\(([^ ]+) ([^)]+)\)/);
                        if (match) {
                            lng = parseFloat(match[1]);
                            lat = parseFloat(match[2]);
                        }
                    }

                    // Avoid overriding 'in_delivery' if they are just sending a heartbeat
                    const computedStatus = existing.status === 'in_delivery' && newRec.status === 'online'
                        ? 'in_delivery'
                        : (newRec.status === 'online' ? 'online' : 'offline');

                    if (computedStatus === 'offline') {
                        const next = { ...prev };
                        delete next[newRec.user_id]; // Only track online
                        return next;
                    }

                    return {
                        ...prev,
                        [newRec.user_id]: {
                            ...existing,
                            status: computedStatus,
                            lat,
                            lng,
                            updatedAt: newRec.updated_at
                        }
                    };
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [timeWindow]); // Re-fetch and re-subscribe when timeWindow changes

    const values = {
        motoboysList: Object.values(motoboys),
        storesList: Object.values(stores),
        ordersList: Object.values(orders),
        isLoading,
        stats: {
            waiting: Object.values(orders).filter(o => o.status === 'waiting_motoboy' || o.status === 'created_a').length,
            inProgress: Object.values(orders).filter(o => ['accepted', 'in_progress'].includes(o.status)).length,
            onlineDrivers: Object.values(motoboys).filter(m => m.status === 'online').length,
            deliveringDrivers: Object.values(motoboys).filter(m => m.status === 'in_delivery').length,
        },
        timeWindow,
        setTimeWindow
    };

    return values;
}
