/**
 * FUNÇÕES GLOBAIS DE BROADCAST
 * 
 * REGRAS ABSOLUTAS:
 * 1. Quando uma entrega/corrida for CRIADA: broadcastNewRideGlobal() ou broadcastNewDeliveryGlobal()
 * 2. Quando uma entrega/corrida for ACEITA: broadcastDeliveryAcceptedGlobal() ou broadcastRideAcceptedGlobal()
 * 
 * Isso garante que o BIP e o modal funcionem em TODOS os dispositivos.
 */

import { supabase } from '@/integrations/supabase/client';

// Nomes dos canais de broadcast global
const BROADCAST_CHANNEL_ACCEPTED = 'delivery-accepted-broadcast';
const BROADCAST_CHANNEL_NEW_RIDE = 'new-ride-broadcast';
const BROADCAST_CHANNEL_NEW_DELIVERY = 'new-delivery-broadcast';

/**
 * Dispara broadcast de NOVA CORRIDA criada para TODOS os moto-táxis conectados.
 * DEVE ser chamado SEMPRE que um passageiro criar uma corrida.
 */
export async function broadcastNewRideGlobal(ride: {
  id: string;
  passenger_id: string;
  pickup_location: string;
  destination: string;
  estimated_value: number;
  service_type: string;
  // Coordenadas GPS para exibição de mapa
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
}): Promise<void> {
  console.log('[BroadcastGlobal] 📣 Enviando broadcast NEW_RIDE:', ride.id);
  
  try {
    const channel = supabase.channel(BROADCAST_CHANNEL_NEW_RIDE, {
      config: { broadcast: { self: false, ack: true } } // self: false - não notifica o próprio passageiro
    });
    
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout ao conectar canal')), 5000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    
    const result = await channel.send({
      type: 'broadcast',
      event: 'new_ride',
      payload: ride,
    });
    
    console.log('[BroadcastGlobal] 📣 Broadcast NEW_RIDE enviado, resultado:', result);
    
    setTimeout(() => {
      supabase.removeChannel(channel);
    }, 1000);
  } catch (error) {
    console.error('[BroadcastGlobal] ❌ Erro ao enviar broadcast NEW_RIDE:', error);
  }
}

/**
 * Dispara broadcast de NOVA ENTREGA criada para TODOS os motoboys conectados.
 * DEVE ser chamado SEMPRE que um lojista criar uma entrega.
 */
export async function broadcastNewDeliveryGlobal(delivery: {
  id: string;
  customer_name: string;
  pickup_location: string;
  destination: string;
  estimated_value: number;
  service_type: string;
  vehicle_type: string;
  distance_km?: number;
  estimated_time_min?: number;
  loja_nome?: string;
  loja_logo?: string;
  loja_endereco?: string;
}): Promise<void> {
  console.log('[BroadcastGlobal] 📣 Enviando broadcast NEW_DELIVERY:', delivery.id);
  
  try {
    const channel = supabase.channel(BROADCAST_CHANNEL_NEW_DELIVERY, {
      config: { broadcast: { self: false, ack: true } }
    });
    
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout ao conectar canal')), 5000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    
    const result = await channel.send({
      type: 'broadcast',
      event: 'new_delivery',
      payload: delivery,
    });
    
    console.log('[BroadcastGlobal] 📣 Broadcast NEW_DELIVERY enviado, resultado:', result);
    
    setTimeout(() => {
      supabase.removeChannel(channel);
    }, 1000);
  } catch (error) {
    console.error('[BroadcastGlobal] ❌ Erro ao enviar broadcast NEW_DELIVERY:', error);
  }
}

/**
 * Dispara broadcast de entrega aceita para TODOS os clientes conectados.
 * Deve ser chamado SEMPRE que uma entrega for aceita, independente do fluxo.
 */
export async function broadcastDeliveryAcceptedGlobal(deliveryId: string, acceptedBy?: string): Promise<void> {
  console.log('[BroadcastGlobal] 📣 Enviando broadcast delivery_accepted:', deliveryId);
  
  try {
    const channel = supabase.channel(BROADCAST_CHANNEL_ACCEPTED, {
      config: { broadcast: { self: true, ack: true } }
    });
    
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout ao conectar canal')), 5000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    
    const result = await channel.send({
      type: 'broadcast',
      event: 'delivery_accepted',
      payload: { deliveryId, acceptedBy: acceptedBy || 'unknown' },
    });
    
    console.log('[BroadcastGlobal] 📣 Broadcast enviado, resultado:', result);
    
    setTimeout(() => {
      supabase.removeChannel(channel);
    }, 1000);
  } catch (error) {
    console.error('[BroadcastGlobal] ❌ Erro ao enviar broadcast:', error);
  }
}

/**
 * Dispara broadcast de corrida aceita para TODOS os clientes conectados.
 */
export async function broadcastRideAcceptedGlobal(rideId: string, acceptedBy?: string): Promise<void> {
  console.log('[BroadcastGlobal] 📣 Enviando broadcast ride_accepted:', rideId);
  
  try {
    const channel = supabase.channel(BROADCAST_CHANNEL_ACCEPTED, {
      config: { broadcast: { self: true, ack: true } }
    });
    
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout ao conectar canal')), 5000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    
    const result = await channel.send({
      type: 'broadcast',
      event: 'ride_accepted',
      payload: { rideId, acceptedBy: acceptedBy || 'unknown' },
    });
    
    console.log('[BroadcastGlobal] 📣 Broadcast enviado, resultado:', result);
    
    setTimeout(() => {
      supabase.removeChannel(channel);
    }, 1000);
  } catch (error) {
    console.error('[BroadcastGlobal] ❌ Erro ao enviar broadcast:', error);
  }
}
