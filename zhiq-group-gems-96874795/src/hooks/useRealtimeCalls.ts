import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { RealtimeChannel } from '@supabase/supabase-js';

import { ServiceType } from '@/lib/serviceTypes';

export interface IncomingDeliveryCall {
  type: 'delivery';
  id: string;
  customer_name: string;
  customer_phone: string | null;
  pickup_location: string;
  destination: string;
  estimated_value: number;
  order_description: string | null;
  vehicle_type: string;
  service_type: ServiceType;
  created_at: string;
  current_motoboy_id?: string | null;
  // Dados da loja
  store_name?: string | null;
  store_logo_url?: string | null;
  // Coordenadas para cálculo de distância
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  distancia_km?: number | null;
}

export interface IncomingRideCall {
  type: 'ride';
  id: string;
  passenger_id: string;
  pickup_location: string;
  destination: string;
  estimated_value: number | null;
  service_type: ServiceType;
  created_at: string;
  motoboy_id?: string | null;
  // Coordenadas para exibir mapa
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  // Dados do passageiro para exibição no modal
  passenger_name?: string | null;
  passenger_avatar_url?: string | null;
  // Métricas de rota
  distance_km?: number | null;
  // Número de passageiros (serviço Carro)
  passenger_count?: number | null;
}

export type IncomingCall = IncomingDeliveryCall | IncomingRideCall;

interface UseRealtimeCallsOptions {
  /** Whether to listen for delivery calls */
  listenDeliveries?: boolean;
  /** Whether to listen for ride calls */
  listenRides?: boolean;
  /** Vehicle type filter for deliveries ('moto' | 'carro') */
  vehicleType?: 'moto' | 'carro';
  /** Service type filter - which types of service to accept */
  serviceTypes?: ServiceType[];
  /** Callback when a new call arrives */
  onNewCall?: (call: IncomingCall) => void;
  /** CORREÇÃO CONCORRÊNCIA: Callback when a call is removed (e.g., accepted by another provider) 
   * @param callId - ID da chamada removida
   * @param acceptedBy - ID do prestador que aceitou (undefined se não soubermos)
   */
  onCallRemoved?: (callId: string, acceptedBy?: string) => void;
  /** Callback when a call status changes (e.g., pendente -> reserva) */
  onStatusChange?: (callId: string, newStatus: string) => void;
  /** Whether the subscription is enabled */
  enabled?: boolean;
  /** Set of rejected delivery IDs to filter out */
  rejectedDeliveryIds?: Set<string>;
  /** Active profile ID for filtering calls */
  activeProfileId?: string;
}

/**
 * Hook for real-time call notifications via Supabase Realtime.
 * 
 * Subscribes to:
 * - delivery_orders (INSERT with status 'pending')
 * - motoboy_passenger_rides (INSERT with status 'pending')
 * 
 * CORREÇÃO: Agora filtra chamadas pelo current_motoboy_id ou motoboy_id
 */
export function useRealtimeCalls({
  listenDeliveries = true,
  listenRides = false,
  vehicleType,
  serviceTypes,
  onNewCall,
  onCallRemoved, // CORREÇÃO CONCORRÊNCIA
  onStatusChange, // Callback para mudança de status (ex: pendente -> reserva)
  enabled = true,
  rejectedDeliveryIds,
  activeProfileId,
}: UseRealtimeCallsOptions = {}) {
  const { user, activeProfile } = useAuth();
  const [incomingCalls, setIncomingCalls] = useState<IncomingCall[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const broadcastChannelRef = useRef<RealtimeChannel | null>(null);
  const newRideBroadcastChannelRef = useRef<RealtimeChannel | null>(null);
  const onNewCallRef = useRef(onNewCall);
  const onCallRemovedRef = useRef(onCallRemoved);
  const onStatusChangeRef = useRef(onStatusChange);

  // Keep callback refs updated
  useEffect(() => {
    onNewCallRef.current = onNewCall;
    onCallRemovedRef.current = onCallRemoved;
    onStatusChangeRef.current = onStatusChange;
  }, [onNewCall, onCallRemoved, onStatusChange]);

  // Ref for addCall to avoid recreation
  const addCallRef = useRef<(call: IncomingCall) => void>();
  
  // Add a new call to the queue - stable function
  addCallRef.current = (call: IncomingCall) => {
    setIncomingCalls(prev => {
      // Avoid duplicates
      if (prev.some(c => c.id === call.id)) {
        return prev;
      }
      return [...prev, call];
    });
    
    // Trigger callback
    onNewCallRef.current?.(call);
  };
  
  const addCall = useCallback((call: IncomingCall) => {
    addCallRef.current?.(call);
  }, []);

  // Remove a call from the queue and notify via callback
  // CORREÇÃO CRÍTICA: Sempre notificar remoção, independente se estava na lista
  // CORREÇÃO OWNERSHIP: Passar acceptedBy para evitar falso positivo de "outro prestador aceitou"
  const removeCall = useCallback((callId: string, acceptedBy?: string) => {
    console.log('[useRealtimeCalls] 🔴 removeCall chamado para:', callId, 'acceptedBy:', acceptedBy);
    
    // Remover da lista interna (se existir)
    setIncomingCalls(prev => {
      const newList = prev.filter(c => c.id !== callId);
      console.log('[useRealtimeCalls] Lista anterior:', prev.length, '-> nova:', newList.length);
      return newList;
    });
    
    // CORREÇÃO CONCORRÊNCIA: SEMPRE notificar que a chamada foi removida
    // CORREÇÃO OWNERSHIP: Passar acceptedBy para que o contexto saiba se foi o próprio usuário
    console.log('[useRealtimeCalls] 🔔 Disparando onCallRemoved para:', callId, 'acceptedBy:', acceptedBy);
    onCallRemovedRef.current?.(callId, acceptedBy);
  }, []);

  // Clear all calls
  const clearCalls = useCallback(() => {
    console.log('[useRealtimeCalls] Limpando todas as chamadas');
    setIncomingCalls([]);
  }, []);

  // CORREÇÃO: Limpar chamadas ao trocar de perfil
  useEffect(() => {
    console.log('[useRealtimeCalls] Perfil ativo mudou para:', activeProfile, '- limpando chamadas anteriores');
    setIncomingCalls([]);
  }, [activeProfile]);

  // Setup realtime subscriptions
  useEffect(() => {
    const effectiveProfileId = activeProfileId || user?.id;
    
    console.log('[useRealtimeCalls] Effect triggered');
    console.log('[useRealtimeCalls] - enabled:', enabled);
    console.log('[useRealtimeCalls] - userId:', user?.id);
    console.log('[useRealtimeCalls] - activeProfile:', activeProfile);
    console.log('[useRealtimeCalls] - activeProfileId (filter):', effectiveProfileId);
    
    if (!enabled) {
      console.log('[useRealtimeCalls] Subscription disabled, skipping');
      return;
    }
    
    if (!user?.id) {
      console.log('[useRealtimeCalls] No user ID, skipping subscription');
      return;
    }

    console.log('[useRealtimeCalls] Setting up channel');
    console.log('[useRealtimeCalls] - listenDeliveries:', listenDeliveries);
    console.log('[useRealtimeCalls] - listenRides:', listenRides);
    console.log('[useRealtimeCalls] - vehicleType:', vehicleType);
    console.log('[useRealtimeCalls] - serviceTypes:', serviceTypes);

    // CORREÇÃO: Nome único do canal por usuário para evitar conflitos
    const channelName = `incoming-calls-${user.id}-${activeProfile || 'default'}`;
    console.log('[useRealtimeCalls] Channel name:', channelName);

    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: true },
      },
    });

    // Subscribe to delivery_offers - INSERT (new offers for THIS professional)
    if (listenDeliveries) {
      console.log('[Realtime] 🚀 ATIVANDO listener de DELIVERY_OFFERS para:', effectiveProfileId);
      
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'delivery_offers',
          filter: `professional_uid=eq.${effectiveProfileId}`,
        },
        async (payload) => {
          const record = payload.new as any;
          
          console.log('[Realtime] 🔔 Delivery OFFER recebida:', record.id, 'para Order:', record.service_order_id);
          
          if (record.offer_status !== 'pending') {
            console.log('[Realtime] ❌ Offer ignorada - status não é pending:', record.offer_status);
            return;
          }

          // Buscar detalhes do pedido em service_orders
          try {
            const { data: order, error } = await supabase
              .from('service_orders')
              .select('*')
              .eq('id', record.service_order_id)
              .single();

            if (error || !order) {
              console.error('[Realtime] ❌ Erro ao buscar service_order para a oferta:', error);
              return;
            }

            const call: IncomingDeliveryCall = {
              type: 'delivery',
              id: order.id, 
              customer_name: order.customer_id || "Cliente",
              customer_phone: order.customer_phone,
              pickup_location: order.pickup_location || "Endereço de Coleta",
              destination: order.destination || "Destino",
              estimated_value: order.estimated_value || order.total_price || 0,
              order_description: order.notes,
              vehicle_type: order.vehicle_type || 'moto',
              service_type: order.service_type || 'delivery',
              created_at: order.created_at,
              current_motoboy_id: effectiveProfileId,
              pickup_lat: order.pickup_lat,
              pickup_lng: order.pickup_lng,
              destination_lat: order.destination_lat,
              destination_lng: order.destination_lng,
              distancia_km: order.distance_km,
            };

            if (order.merchant_id) {
              const { data: storeData } = await supabase
                .from('merchant_stores')
                .select('nome_loja, logo_url')
                .eq('user_id', order.merchant_id)
                .maybeSingle();
              if (storeData) {
                call.store_name = storeData.nome_loja;
                call.store_logo_url = storeData.logo_url;
              }
            }

            console.log('[Realtime] ✅ Nova oferta aceita para exibição:', call.id);
            addCall(call);
          } catch (err) {
            console.error('[Realtime] Erro no processamento da oferta:', err);
          }
        }
      );

      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'delivery_offers',
          filter: `professional_uid=eq.${effectiveProfileId}`,
        },
        (payload) => {
          const record = payload.new as any;
          if (record.offer_status !== 'pending') {
            console.log('[Realtime] ❌ Offer não mais disponível:', record.service_order_id, 'status:', record.offer_status);
            removeCall(record.service_order_id);
          }
        }
      );
    }

    // Subscribe to moto_taxi_corridas - INSERT (new calls)
    // CORREÇÃO: Usar nova tabela moto_taxi_corridas
    if (listenRides) {
      console.log('[Realtime] 🚀 ATIVANDO listener de RIDES (moto_taxi_corridas)');
      
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'moto_taxi_corridas',
        },
        (payload) => {
          const record = payload.new as any;

          console.log('[Realtime] 🔔 Ride INSERT recebido:', record.id);
          console.log('[Realtime] - status:', record.status);
          console.log('[Realtime] - passenger_id:', record.passenger_id);

          // Verificar se status é pesquisando (português)
          if (record.status !== 'pesquisando') {
            console.log('[Realtime] ❌ Ride ignorada - status não é pesquisando:', record.status);
            return;
          }

          // Se passenger_id === effectiveProfileId, ignorar (é o próprio passageiro)
          if (record.passenger_id === effectiveProfileId) {
            console.log('[Realtime] ❌ Ride ignorada - é do próprio passageiro');
            return;
          }

          // Filter by service type
          const recordServiceType = 'mototaxi';
          if (serviceTypes && serviceTypes.length > 0 && !serviceTypes.includes(recordServiceType)) {
            console.log('[Realtime] ❌ Ride filtered out by service_type');
            return;
          }

          const call: IncomingRideCall = {
            type: 'ride',
            id: record.id,
            passenger_id: record.passenger_id,
            pickup_location: record.origin_address,
            destination: record.destination_address,
            estimated_value: record.estimated_price,
            service_type: recordServiceType,
            created_at: record.created_at,
            motoboy_id: record.moto_taxi_id,
            pickup_lat: record.origin_lat,
            pickup_lng: record.origin_lng,
            destination_lat: record.destination_lat,
            destination_lng: record.destination_lng,
            passenger_count: record.passenger_count,
          };

          console.log('[Realtime] ✅ Nova ride call:', call.id);
          addCall(call);
        }
      );

      // Subscribe to moto_taxi_corridas - UPDATE (when moto-taxi accepts)
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'moto_taxi_corridas',
        },
        (payload) => {
          const record = payload.new as any;
          // Se status mudou de pesquisando, remover da fila
          if (record.status !== 'pesquisando') {
            console.log('[Realtime] ❌ Ride status changed, removing:', record.id);
            removeCall(record.id, record.moto_taxi_id);
          }
        }
      );

      // ===== MOTORISTA_CORRIDAS: Corridas de CARRO =====
      // CORREÇÃO: Usar event: '*' para escutar INSERT e UPDATE juntos
      console.log('[Realtime] 🚗 ATIVANDO listener de CARRO (motorista_corridas) - event: *');
      
      channel.on(
        'postgres_changes',
        {
          event: '*', // INSERT e UPDATE
          schema: 'public',
          table: 'motorista_corridas',
        },
        (payload) => {
          const record = payload.new as any;
          const oldRecord = payload.old as any;
          const eventType = payload.eventType;

          console.log('[Realtime] 🚗 Corrida CARRO', eventType, 'recebido:', record.id);
          console.log('[Realtime] - status:', oldRecord?.status, '->', record.status);
          console.log('[Realtime] - motorista_id:', record.motorista_id);
          console.log('[Realtime] - passenger_id:', record.passenger_id);

          // Ignorar corridas do próprio passageiro
          if (record.passenger_id === effectiveProfileId) {
            console.log('[Realtime] ❌ Corrida CARRO ignorada - é do próprio passageiro');
            return;
          }

          // Status válidos para exibição
          const validStatuses = ['pendente', 'reserva'];
          const isAvailable = validStatuses.includes(record.status) && record.motorista_id === null;

          // === INSERT: Nova corrida ===
          if (eventType === 'INSERT') {
            if (!isAvailable) {
              console.log('[Realtime] ❌ Corrida CARRO INSERT ignorada - não disponível');
              return;
            }

            // Filter by service type
            const recordServiceType: ServiceType = 'motorista';
            if (serviceTypes && serviceTypes.length > 0 && !serviceTypes.includes(recordServiceType)) {
              console.log('[Realtime] ❌ Corrida CARRO filtered out by service_type');
              return;
            }

            const call: IncomingRideCall = {
              type: 'ride',
              id: record.id,
              passenger_id: record.passenger_id,
              pickup_location: record.origem || '',
              destination: record.destino || '',
              estimated_value: record.valor,
              service_type: recordServiceType,
              created_at: record.created_at,
              motoboy_id: record.motorista_id,
              pickup_lat: null,
              pickup_lng: null,
              destination_lat: null,
              destination_lng: null,
              passenger_count: record.passenger_count || null,
            };

            console.log('[Realtime] ✅ Nova corrida CARRO:', call.id);
            addCall(call);
            return;
          }

          // === UPDATE: Mudança de status ===
          if (eventType === 'UPDATE') {
            // Detectar mudança pendente -> reserva (parar BIP, manter visível)
            if (oldRecord?.status === 'pendente' && record.status === 'reserva' && record.motorista_id === null) {
              console.log('[Realtime] 📦 Corrida CARRO mudou para RESERVA:', record.id);
              onStatusChangeRef.current?.(record.id, 'reserva');
              return; // Não remover - ainda disponível
            }

            // Se ainda disponível, manter na lista
            if (isAvailable) {
              console.log('[Realtime] ✅ Corrida CARRO ainda disponível:', record.id, record.status);
              return;
            }

            // Não mais disponível - remover
            console.log('[Realtime] ❌ Corrida CARRO não mais disponível (status:', record.status, 'motorista:', record.motorista_id, '), removendo:', record.id);
            removeCall(record.id, record.motorista_id);
          }
        }
      );
    }

    // Subscribe and track connection status
    channel.subscribe((status) => {
      console.log('[Realtime] Subscription status:', status);
      setIsConnected(status === 'SUBSCRIBED');
    });

    channelRef.current = channel;

    // ===== CORREÇÃO CONCORRÊNCIA: Canal BROADCAST COMPARTILHADO =====
    // Este canal é compartilhado por TODOS os motoboys para receber notificações de aceite
    // Não depende de RLS - broadcast funciona independente de permissões de tabela
    // CORREÇÃO: Usar self: true para garantir que o próprio motoboy também receba (para debug)
    // A lógica de ignorar próprias mensagens é feita no handler
    const broadcastChannel = supabase.channel('delivery-accepted-broadcast', {
      config: {
        broadcast: { self: true, ack: true }, // self: true para debug, ack para confirmação
      },
    });

    broadcastChannel.on(
      'broadcast',
      { event: 'delivery_accepted' },
      (payload) => {
        const { deliveryId, acceptedBy } = payload.payload as { deliveryId: string; acceptedBy: string };
        console.log('[Broadcast] 📢 Evento delivery_accepted recebido:', deliveryId, 'por:', acceptedBy);
        console.log('[Broadcast] 📢 Meu ID:', effectiveProfileId);
        
        // CORREÇÃO OWNERSHIP: Passar acceptedBy para evitar falso positivo
        console.log('[Broadcast] 🔴 Removendo chamada da fila local:', deliveryId, 'acceptedBy:', acceptedBy);
        removeCall(deliveryId, acceptedBy);
      }
    );

    // ===== CANAL DE BROADCAST PARA NOVAS CORRIDAS =====
    // Recebe notificações de novas corridas criadas por passageiros
    // CORREÇÃO CRÍTICA: Sempre criar e subscrever o canal, listener é condicional
    if (listenRides) {
      console.log('[Broadcast] 🚀 ATIVANDO listener de NOVAS CORRIDAS via broadcast');
      
      const newRideBroadcastChannel = supabase.channel('new-ride-broadcast', {
        config: {
          broadcast: { self: false, ack: true }, // self: false - passageiro não recebe própria corrida
        },
      });
      
      newRideBroadcastChannel.on(
        'broadcast',
        { event: 'new_ride' },
        (payload) => {
          const ride = payload.payload as {
            id: string;
            passenger_id: string;
            pickup_location: string;
            destination: string;
            estimated_value: number;
            service_type: string;
            // Coordenadas GPS
            pickup_lat?: number | null;
            pickup_lng?: number | null;
            destination_lat?: number | null;
            destination_lng?: number | null;
            // Dados do passageiro
            passenger_name?: string | null;
            passenger_avatar_url?: string | null;
            // Métricas
            distance_km?: number | null;
            // Número de passageiros (serviço Carro)
            passenger_count?: number | null;
          };
          
          console.log('[Broadcast] 🔔 NOVA CORRIDA recebida via broadcast:', ride.id);
          console.log('[Broadcast] - passenger_id:', ride.passenger_id);
          console.log('[Broadcast] - passenger_name:', ride.passenger_name);
          console.log('[Broadcast] - service_type:', ride.service_type);
          console.log('[Broadcast] - distance_km:', ride.distance_km);
          console.log('[Broadcast] - coordenadas origem:', ride.pickup_lat, ride.pickup_lng);
          console.log('[Broadcast] - coordenadas destino:', ride.destination_lat, ride.destination_lng);
          console.log('[Broadcast] - effectiveProfileId:', effectiveProfileId);
          
          // Ignorar se for o próprio passageiro (já deveria ser filtrado por self: false)
          if (ride.passenger_id === effectiveProfileId) {
            console.log('[Broadcast] ❌ Corrida ignorada - é do próprio passageiro');
            return;
          }
          
          // Verificar service_type
          if (serviceTypes && serviceTypes.length > 0 && !serviceTypes.includes(ride.service_type as any)) {
            console.log('[Broadcast] ❌ Corrida filtrada por service_type:', ride.service_type);
            return;
          }
          
          const call: IncomingRideCall = {
            type: 'ride',
            id: ride.id,
            passenger_id: ride.passenger_id,
            pickup_location: ride.pickup_location,
            destination: ride.destination,
            estimated_value: ride.estimated_value,
            service_type: ride.service_type as any,
            created_at: new Date().toISOString(),
            motoboy_id: null,
            // Incluir coordenadas no objeto de chamada
            pickup_lat: ride.pickup_lat,
            pickup_lng: ride.pickup_lng,
            destination_lat: ride.destination_lat,
            destination_lng: ride.destination_lng,
            // Dados do passageiro
            passenger_name: ride.passenger_name,
            passenger_avatar_url: ride.passenger_avatar_url,
            // Métricas
            distance_km: ride.distance_km,
            // Número de passageiros (serviço Carro)
            passenger_count: ride.passenger_count,
          };
          
          console.log('[Broadcast] ✅ Nova corrida aceita via broadcast, disparando addCall:', call.id);
          addCall(call);
        }
      );
      
      // CORREÇÃO CRÍTICA: Subscribe DENTRO do if para garantir que o canal seja ativado
      newRideBroadcastChannel.subscribe((status) => {
        console.log('[Broadcast] NEW_RIDE channel status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[Broadcast] ✅ Canal NEW_RIDE conectado e PRONTO para receber corridas!');
        }
      });
      
      newRideBroadcastChannelRef.current = newRideBroadcastChannel;
    }

    broadcastChannel.on(
      'broadcast',
      { event: 'ride_accepted' },
      (payload) => {
        const { rideId, acceptedBy } = payload.payload as { rideId: string; acceptedBy: string };
        console.log('[Broadcast] 📢 Evento ride_accepted recebido:', rideId, 'por:', acceptedBy);
        console.log('[Broadcast] 📢 Meu ID:', effectiveProfileId);
        
        // CORREÇÃO OWNERSHIP: Passar acceptedBy para evitar falso positivo
        console.log('[Broadcast] 🔴 Removendo chamada da fila local:', rideId, 'acceptedBy:', acceptedBy);
        removeCall(rideId, acceptedBy);
      }
    );

    broadcastChannel.subscribe((status) => {
      console.log('[Broadcast] Subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('[Broadcast] ✅ Canal de broadcast conectado e pronto');
      }
    });

    broadcastChannelRef.current = broadcastChannel;

    // Cleanup on unmount or when dependencies change
    return () => {
      console.log('[Realtime] Unsubscribing from channel:', channelName);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (broadcastChannelRef.current) {
        console.log('[Broadcast] Unsubscribing from broadcast channel');
        supabase.removeChannel(broadcastChannelRef.current);
        broadcastChannelRef.current = null;
      }
      if (newRideBroadcastChannelRef.current) {
        console.log('[Broadcast] Unsubscribing from new-ride-broadcast channel');
        supabase.removeChannel(newRideBroadcastChannelRef.current);
        newRideBroadcastChannelRef.current = null;
      }
      setIsConnected(false);
    };
  // CRITICAL: activeProfile é importante para resubscribe ao trocar perfil
  }, [enabled, user?.id, activeProfile, activeProfileId, listenDeliveries, listenRides, vehicleType, JSON.stringify(serviceTypes)]);

  // Função para broadcast de aceite de entrega
  // CORREÇÃO: Verificar se canal está subscribed antes de enviar
  const broadcastDeliveryAccepted = useCallback(async (deliveryId: string) => {
    if (!user?.id) {
      console.warn('[Broadcast] ❌ Sem user.id para enviar broadcast');
      return;
    }
    
    console.log('[Broadcast] 📣 Preparando envio de broadcast delivery_accepted:', deliveryId);
    
    // CORREÇÃO: Criar um novo canal temporário se o principal não estiver pronto
    // Isso garante que o broadcast seja enviado IMEDIATAMENTE
    const channel = broadcastChannelRef.current || supabase.channel('delivery-accepted-broadcast');
    
    try {
      const result = await channel.send({
        type: 'broadcast',
        event: 'delivery_accepted',
        payload: { deliveryId, acceptedBy: user.id },
      });
      console.log('[Broadcast] 📣 Broadcast delivery_accepted enviado, resultado:', result);
    } catch (error) {
      console.error('[Broadcast] ❌ Erro ao enviar broadcast:', error);
    }
  }, [user?.id]);

  // Função para broadcast de aceite de corrida
  const broadcastRideAccepted = useCallback(async (rideId: string) => {
    if (!user?.id) {
      console.warn('[Broadcast] ❌ Sem user.id para enviar broadcast de corrida');
      return;
    }
    
    console.log('[Broadcast] 📣 Preparando envio de broadcast ride_accepted:', rideId);
    
    const channel = broadcastChannelRef.current || supabase.channel('delivery-accepted-broadcast');
    
    try {
      const result = await channel.send({
        type: 'broadcast',
        event: 'ride_accepted',
        payload: { rideId, acceptedBy: user.id },
      });
      console.log('[Broadcast] 📣 Broadcast ride_accepted enviado, resultado:', result);
    } catch (error) {
      console.error('[Broadcast] ❌ Erro ao enviar broadcast:', error);
    }
  }, [user?.id]);

  return {
    incomingCalls,
    currentCall: incomingCalls[0] || null,
    isConnected,
    removeCall,
    clearCalls,
    hasIncomingCalls: incomingCalls.length > 0,
    // CORREÇÃO CONCORRÊNCIA: Exportar funções de broadcast
    broadcastDeliveryAccepted,
    broadcastRideAccepted,
  };
}

export default useRealtimeCalls;
