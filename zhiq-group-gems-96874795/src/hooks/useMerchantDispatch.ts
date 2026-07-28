import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DispatchOffer {
    id: string;
    offer_status: string;
    expires_at: string;
    distance_km: number | null;
    radius_km: number | null;
    round_no: number;
    created_at: string;
    motoboy_id: string | null;
    motoboy?: {
        nome_completo: string | null;
    };
}

export interface ServiceOrder {
    id: string;
    status: string;
    pickup_lat: number;
    pickup_lng: number;
    destination_lat: number;
    destination_lng: number;
    distance_km?: number | null;
    professional_uid?: string | null;
    [key: string]: unknown;
}

export interface DispatchPayload {
    region_id: string;
    city_id: string | null;
    pickup_lat: number;
    pickup_lng: number;
    destination_lat: number;
    destination_lng: number;
    merchant_id: string;
    distance_km?: number;
    estimated_minutes?: number;
    service_level?: 'standard' | 'express';
    base_fee?: number;
    km_fee?: number;
    priority_fee?: number;
    total_price?: number;
    route_polyline?: string | null;
    [key: string]: unknown; // Outros campos suportados por service_orders, se houver
}

export function useMerchantDispatch() {
    const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
    const [activeOrder, setActiveOrder] = useState<ServiceOrder | null>(null);
    const [offers, setOffers] = useState<DispatchOffer[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const previewRouteAndPrice = async (
        pickupLat: number, pickupLng: number,
        destLat: number, destLng: number,
        serviceLevel: 'standard' | 'express' = 'standard'
    ) => {
        try {
            const { data, error } = await supabase.rpc('calculate_route_and_price_v2', {
                p_pickup_lat: pickupLat,
                p_pickup_lng: pickupLng,
                p_drop_lat: destLat,
                p_drop_lng: destLng,
                p_service_level: serviceLevel
            });
            if (error) throw error;
            return data; // returns json: { distance_km, eta_minutes, total_price, ... }
        } catch (err: Error | unknown) {
            console.error('[previewRouteAndPrice] error:', err);
            throw new Error(err instanceof Error ? err.message : 'Erro ao calcular rota');
        }
    };

    // Subscribe to service_orders updates
    const subscribeOrder = useCallback((orderId: string) => {
        const channel = supabase
            .channel(`merchant-order-${orderId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'service_orders', filter: `id=eq.${orderId}` },
                (payload) => {
                    setActiveOrder(payload.new as ServiceOrder);
                }
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Subscribe to delivery_offers updates
    const subscribeOffers = useCallback((orderId: string) => {
        const channel = supabase
            .channel(`merchant-offers-${orderId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'delivery_offers', filter: `delivery_order_id=eq.${orderId}` },
                () => {
                    refetchOffers(orderId);
                }
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const refetchOffers = async (orderId: string) => {
        try {
      // @ts-expect-error - Some schemas might not be fully typed yet
            const { data, error: fetchErr } = await supabase
                .from('delivery_offers')
                .select(`
          id, status, expires_at, motoboy_id, created_at,
          motoboy:profiles!motoboy_id (name)
        `)
                .eq('delivery_order_id', orderId)
                .order('created_at', { ascending: false });

            if (fetchErr) throw fetchErr;

            const formattedData = (data ?? []).map((row: Record<string, unknown>) => ({
                id: row.id as string,
                offer_status: row.status as string,
                expires_at: row.expires_at as string,
                distance_km: null,
                radius_km: null,
                round_no: 1,
                created_at: row.created_at as string,
                motoboy_id: row.motoboy_id as string,
                motoboy: {
                    nome_completo: Array.isArray(row.motoboy) ? (row.motoboy[0] as Record<string, unknown>)?.name as string : (row.motoboy as Record<string, unknown>)?.name as string
                },
            }));

            setOffers(formattedData);
        } catch (err: Error | unknown) {
            console.error('[useMerchantDispatch] get offers error:', err);
        }
    };

    const createAndDispatchOrder = async (payload: DispatchPayload) => {
        setLoading(true);
        setError(null);
        try {
            if (!payload.merchant_id || !payload.pickup_lat || !payload.pickup_lng || !payload.destination_lat || !payload.destination_lng) {
                toast("Localização inválida para entrega");
                setLoading(false);
                return;
            }

            // Fetch the proper store ID
            const { data: storeData, error: storeError } = await supabase
                .from('merchant_stores')
                .select('id')
                .eq('user_id', payload.merchant_id)
                .single();

            if (storeError || !storeData) {
                throw new Error("Loja não encontrada para este usuário");
            }

            const storeId = storeData.id;

            const rpcPayload = {
                p_store_id: storeId,
                pickup_lat: payload.pickup_lat,
                pickup_lng: payload.pickup_lng,
                drop_lat: payload.destination_lat,
                drop_lng: payload.destination_lng,
                p_distance_km: payload.distance_km,
            };

            console.log('RPC payload', rpcPayload);

            // @ts-expect-error - RPC dynamic call
            const { data, error } = await supabase.rpc('create_delivery_order', rpcPayload);

            if (error) {
                console.error('create_delivery_order error', error);
                toast('Erro ao solicitar motoboy', {
                    description: error.message,
                    className: 'destructive'
                });
                return;
            }

            console.log('order created', data);

            const orderId = data as string;

            // Fetch the newly created order
            const { data: order, error: fetchErr } = await supabase
                .from('service_orders')
                .select('*')
                .eq('id', orderId)
                .maybeSingle();

            if (fetchErr || !order) {
                throw new Error('Falha ao buscar detalhes do pedido criado');
            }

            setActiveOrderId(order.id);
            setActiveOrder(order as ServiceOrder);

            // Assinar os canais realtime imediatamente
            subscribeOrder(order.id);
            subscribeOffers(order.id);

            // Inicia a maquina inteligente do backend (Dispatch Realtime)
            const { error: rpcOfferErr } = await supabase.rpc('create_delivery_offers_for_order', {
                p_delivery_order_id: order.id
            });

            if (rpcOfferErr) {
                console.error('[create_delivery_offers_for_order] error:', rpcOfferErr);
                toast.warning('Erro ao disparar ofertas automáticas, mas o pedido foi criado.');
            }

            // Inicia a maquina inteligente legado/secundaria (v2 dispatch)
            // @ts-expect-error - RPC dynamic call
            const { error: rpcErr } = await supabase.rpc('run_dispatch_cycle');
            if (rpcErr) {
                console.error('[run_dispatch_cycle] error:', rpcErr);
            } else {
                toast.success('Pedido criado', { description: 'Motoboy solicitado com sucesso.' });
            }

            // Fetch immediately once
            await refetchOffers(order.id);
        } catch (err: Error | unknown) {
            console.error('[createAndDispatchOrder]', err);
            const msg = err instanceof Error ? err.message : 'Erro ao solicitar motoboy';
            setError(msg);
            toast.error(msg);
            setActiveOrderId(null);
        } finally {
            setLoading(false);
        }
    };


    const forceDispatchCycle = async () => {
        if (!activeOrderId) return;
        try {
            // @ts-expect-error - RPC dynamic call
            const { error } = await supabase.rpc('run_dispatch_cycle');
            if (error) throw error;
            toast.success('Nova varredura por motoboys iniciada!');
            refetchOffers(activeOrderId);
        } catch (err: Error | unknown) {
            console.error('[forceDispatchCycle]', err);
            toast.error('Não foi possível forçar varredura agora.');
        }
    };

    // Cleanup effect se desmontar
    useEffect(() => {
        let orderUnsub: () => void;
        let offersUnsub: () => void;

        if (activeOrderId) {
            orderUnsub = subscribeOrder(activeOrderId);
            offersUnsub = subscribeOffers(activeOrderId);
        }

        return () => {
            if (orderUnsub) orderUnsub();
            if (offersUnsub) offersUnsub();
        };
    }, [activeOrderId, subscribeOrder, subscribeOffers]);

    return {
        activeOrderId,
        activeOrder,
        offers,
        loading,
        error,
        previewRouteAndPrice,
        createAndDispatchOrder,
        forceDispatchCycle,
    };
}
