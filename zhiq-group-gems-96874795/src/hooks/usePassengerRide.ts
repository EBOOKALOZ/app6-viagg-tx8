/**
 * Hook para gerenciar corrida do PASSAGEIRO usando moto_taxi_corridas
 * FONTE ÚNICA DE VERDADE para corridas de passageiro
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ServiceType } from '@/lib/serviceTypes';
import { broadcastNewRideGlobal } from '@/lib/broadcastDeliveryAccepted';
import { sendRidePushNotification } from '@/lib/sendPushNotification';
import { handleChannelStatus, clearReconnectTimeout } from '@/hooks/realtime/reconnect';

export interface PassengerRide {
  id: string;
  passenger_id: string;
  moto_taxi_id: string | null;
  status: 'pesquisando' | 'aceita' | 'a_caminho' | 'em_andamento' | 'finalizada' | 'cancelada';
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
  estimated_km: number | null;
  estimated_time_minutes: number | null;
  estimated_price: number | null;
  passenger_count: number | null; // NOVO: Número de passageiros (para Carro)
  created_at: string;
  accepted_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  canceled_at: string | null;
  canceled_by: string | null;
}

export interface MotoTaxiInfo {
  name: string;
  avatarUrl?: string;
  phone?: string;
  vehicleModel?: string;
  vehiclePlate?: string;
  vehicleColor?: string;
  vehicleYear?: number;
  rating: number;
}

interface CreateRideParams {
  originAddress: string;
  originLat: number;
  originLng: number;
  destinationAddress: string;
  destinationLat: number;
  destinationLng: number;
  estimatedKm?: number;
  estimatedTimeMinutes?: number;
  estimatedPrice?: number;
  passengerCount?: number; // Número de passageiros (para Carro)
  serviceType: ServiceType; // Tipo de serviço: 'mototaxi' ou 'motorista'
}

export function usePassengerRide() {
  const { user } = useAuth();
  const [currentRide, setCurrentRide] = useState<PassengerRide | null>(null);
  const [motoTaxiInfo, setMotoTaxiInfo] = useState<MotoTaxiInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingMotoTaxi, setIsLoadingMotoTaxi] = useState(false);
  
  const lastProcessedStatusRef = useRef<string | null>(null);
  const motoTaxiFetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // CORREÇÃO A-6: reconexão automática do canal realtime em
  // CHANNEL_ERROR/TIMED_OUT/CLOSED (mesmo padrão de RealtimeService.ts:31-42).
  const [reconnectTick, setReconnectTick] = useState(0);
  const isMountedRef = useRef(true);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Buscar informações do moto-táxi com retry e timeout
   */
  const fetchMotoTaxiInfo = useCallback(async (motoTaxiId: string, retryCount = 0): Promise<boolean> => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000;
    
    try {
      console.log('[usePassengerRide] Buscando info do moto-táxi:', motoTaxiId, 'tentativa:', retryCount + 1);
      setIsLoadingMotoTaxi(true);
      
      // Buscar perfil básico
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('name, avatar_url, telefone')
        .eq('id', motoTaxiId)
        .single();
      
      if (profileError) {
        console.warn('[usePassengerRide] Erro ao buscar profile:', profileError);
      }
      
      // Buscar dados do motoboy
      const { data: motoboyProfile, error: motoboyError } = await supabase
        .from('motoboy_profiles')
        .select('veiculo_marca, veiculo_modelo, veiculo_ano, veiculo_cor, veiculo_placa, whatsapp')
        .eq('user_id', motoTaxiId)
        .single();
      
      if (motoboyError && motoboyError.code !== 'PGRST116') {
        console.warn('[usePassengerRide] Erro ao buscar motoboy_profile:', motoboyError);
      }
      
      // Se pelo menos temos o profile, montamos os dados
      if (profile) {
        const info: MotoTaxiInfo = {
          name: profile.name || 'Moto-táxi',
          avatarUrl: profile.avatar_url || undefined,
          phone: motoboyProfile?.whatsapp || profile.telefone || undefined,
          vehicleModel: motoboyProfile ? `${motoboyProfile.veiculo_marca || ''} ${motoboyProfile.veiculo_modelo || ''}`.trim() || undefined : undefined,
          vehiclePlate: motoboyProfile?.veiculo_placa || undefined,
          vehicleColor: motoboyProfile?.veiculo_cor || undefined,
          vehicleYear: motoboyProfile?.veiculo_ano || undefined,
          rating: 4.9,
        };
        
        console.log('[usePassengerRide] ✅ Info do moto-táxi carregada:', info.name);
        setMotoTaxiInfo(info);
        setIsLoadingMotoTaxi(false);
        return true;
      }
      
      // Se não encontrou profile, tenta retry
      if (retryCount < MAX_RETRIES - 1) {
        console.log('[usePassengerRide] ⚠️ Profile não encontrado, tentando novamente em', RETRY_DELAY, 'ms');
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchMotoTaxiInfo(motoTaxiId, retryCount + 1);
      }
      
      // Fallback: usar dados mínimos
      console.log('[usePassengerRide] ⚠️ Usando dados mínimos do moto-táxi');
      setMotoTaxiInfo({
        name: 'Moto-táxi',
        rating: 4.9,
      });
      setIsLoadingMotoTaxi(false);
      return true;
      
    } catch (error) {
      console.error('[usePassengerRide] Erro ao buscar moto-táxi:', error);
      
      if (retryCount < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchMotoTaxiInfo(motoTaxiId, retryCount + 1);
      }
      
      // Fallback em caso de erro total
      setMotoTaxiInfo({
        name: 'Moto-táxi',
        rating: 4.9,
      });
      setIsLoadingMotoTaxi(false);
      return false;
    }
  }, []);

  /**
   * Buscar corrida ativa do passageiro
   */
  const loadActiveRide = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      console.log('[usePassengerRide] Buscando corrida ativa para passageiro:', user.id);
      
      // Query ÚNICA na tabela moto_taxi_corridas_legacy
      // @ts-expect-error - Type definitions may be missing
      const { data, error } = await supabase
        .from('moto_taxi_corridas_legacy')
        .select('*')
        .eq('passenger_id', user.id)
        .in('status', ['pesquisando', 'aceita', 'a_caminho', 'em_andamento'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.error('[usePassengerRide] Erro ao buscar corrida:', error);
        return;
      }
      
      if (data) {
        console.log('[usePassengerRide] ✅ Corrida ativa encontrada:', data.id, 'status:', data.status);
        setCurrentRide(data as PassengerRide);
        lastProcessedStatusRef.current = data.status;
        
        // Buscar info do moto-táxi se já foi aceita
        if (data.moto_taxi_id && data.status !== 'pesquisando') {
          await fetchMotoTaxiInfo(data.moto_taxi_id);
        }
      } else {
        console.log('[usePassengerRide] Nenhuma corrida ativa');
        setCurrentRide(null);
        setMotoTaxiInfo(null);
      }
    } catch (error) {
      console.error('[usePassengerRide] Error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, fetchMotoTaxiInfo]);

  // Carregar corrida inicial
  useEffect(() => {
    loadActiveRide();
  }, [loadActiveRide]);

  /**
   * REALTIME + POLLING + TIMEOUT: Escutar mudanças na corrida
   */
  useEffect(() => {
    if (!currentRide?.id || !user?.id) return;

    console.log('[usePassengerRide] 🔌 Iniciando realtime para corrida:', currentRide.id);

    // Handler para processar atualizações
    const handleRideUpdate = async (newData: PassengerRide) => {
      if (newData.passenger_id !== user.id) return;
      
      // Evitar processamento duplicado
      if (newData.status === lastProcessedStatusRef.current && 
          newData.moto_taxi_id === currentRide.moto_taxi_id) {
        return;
      }
      
      console.log('[usePassengerRide] 📡 Atualizando corrida - Status:', newData.status, 'MotoTaxi:', newData.moto_taxi_id);
      lastProcessedStatusRef.current = newData.status;
      setCurrentRide(newData);
      
      // Buscar info do moto-táxi quando aceito
      if ((newData.status === 'aceita' || newData.status === 'a_caminho') && newData.moto_taxi_id && !motoTaxiInfo) {
        // Limpar timeout anterior se existir
        if (motoTaxiFetchTimeoutRef.current) {
          clearTimeout(motoTaxiFetchTimeoutRef.current);
        }
        
        const success = await fetchMotoTaxiInfo(newData.moto_taxi_id);
        
        if (success && newData.status === 'aceita') {
          toast.success('Moto-táxi encontrado! 🏍️', {
            description: 'Ele está a caminho',
          });
        }
      } else if (newData.status === 'em_andamento') {
        toast.success('Corrida iniciada!', {
          description: 'Você está a caminho do destino',
        });
      } else if (newData.status === 'finalizada') {
        toast.success('Corrida finalizada! 🎉');
        setCurrentRide(null);
        setMotoTaxiInfo(null);
      } else if (newData.status === 'cancelada') {
        toast.info(newData.canceled_by === 'moto_taxi' 
          ? 'Moto-táxi cancelou a corrida' 
          : 'Corrida cancelada'
        );
        setCurrentRide(null);
        setMotoTaxiInfo(null);
      }
    };

    // REALTIME SUBSCRIPTION
    const channel = supabase
      .channel(`passenger-ride-${currentRide.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'moto_taxi_corridas',
          filter: `id=eq.${currentRide.id}`,
        },
        async (payload) => {
          const newData = payload.new as PassengerRide;
          console.log('[usePassengerRide] 📡 Realtime recebido - Status:', newData.status);
          await handleRideUpdate(newData);
        }
      )
      .subscribe((status) => {
        console.log('[usePassengerRide] Realtime status:', status);
        // CORREÇÃO A-6: reconectar em 5s se o canal cair, senão o passageiro
        // para de receber atualização de status silenciosamente.
        handleChannelStatus(status, {
          label: '[usePassengerRide]',
          isMountedRef,
          reconnectTimeoutRef,
          onReconnect: () => setReconnectTick((t) => t + 1),
        });
      });

    // POLLING de backup (a cada 2s enquanto pesquisando OU enquanto carregando moto-táxi)
    let pollInterval: NodeJS.Timeout | null = null;
    
    const shouldPoll = currentRide.status === 'pesquisando' || 
                       (currentRide.status === 'aceita' && !motoTaxiInfo);
    
    if (shouldPoll) {
      console.log('[usePassengerRide] ⏰ Iniciando polling de backup');
      
      pollInterval = setInterval(async () => {
        try {
          // @ts-expect-error - Type definitions may be missing
          const { data } = await supabase
            .from('moto_taxi_corridas_legacy')
            .select('*')
            .eq('id', currentRide.id)
            .single();
          
          if (!data || data.passenger_id !== user.id) return;
          
          // Se status mudou ou moto_taxi_id foi preenchido
          const statusChanged = data.status !== lastProcessedStatusRef.current;
          const motoTaxiAssigned = data.moto_taxi_id && !currentRide.moto_taxi_id;
          
          if (statusChanged || motoTaxiAssigned) {
            console.log('[usePassengerRide] 🔄 Polling detectou mudança:', {
              status: data.status,
              moto_taxi_id: data.moto_taxi_id,
            });
            await handleRideUpdate(data as PassengerRide);
          }
        } catch (err) {
          console.error('[usePassengerRide] Erro no polling:', err);
        }
      }, 2000);
    }

    // TIMEOUT de 10s para fallback manual se estiver carregando moto-táxi
    if (currentRide.status === 'aceita' && currentRide.moto_taxi_id && !motoTaxiInfo) {
      console.log('[usePassengerRide] ⏳ Configurando timeout de 10s para fetch do moto-táxi');
      
      motoTaxiFetchTimeoutRef.current = setTimeout(async () => {
        console.log('[usePassengerRide] ⚠️ Timeout atingido, fazendo fetch manual');
        if (currentRide.moto_taxi_id) {
          await fetchMotoTaxiInfo(currentRide.moto_taxi_id);
        }
      }, 10000);
    }

    return () => {
      // CORREÇÃO A-6: cancelar timer de reconexão pendente ao desmontar/
      // reexecutar o efeito — evita setState em componente desmontado.
      clearReconnectTimeout(reconnectTimeoutRef);
      supabase.removeChannel(channel);
      if (pollInterval) clearInterval(pollInterval);
      if (motoTaxiFetchTimeoutRef.current) clearTimeout(motoTaxiFetchTimeoutRef.current);
    };
  // reconnectTick: incrementado ao detectar CHANNEL_ERROR/TIMED_OUT/CLOSED,
  // força a remontagem do canal após o backoff de 5s.
  }, [currentRide?.id, currentRide?.status, currentRide?.moto_taxi_id, user?.id, motoTaxiInfo, fetchMotoTaxiInfo, reconnectTick]);

  // Unmount definitivo do hook: impede que um timer de reconexão em voo
  // dispare setReconnectTick depois que o componente já foi desmontado.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Criar nova corrida
   * - Moto-táxi: INSERT em moto_taxi_corridas
   * - Carro (motorista): INSERT em motorista_corridas
   */
  const createRide = async (params: CreateRideParams): Promise<PassengerRide | null> => {
    if (!user?.id) {
      toast.error('Você precisa estar logado');
      return null;
    }

    setIsCreating(true);
    const isCarService = params.serviceType === 'motorista';

    try {
      console.log(`[usePassengerRide] 🚀 Criando corrida - Tipo: ${params.serviceType}`);
      
      // 1. Buscar dados do passageiro para incluir no broadcast
      const { data: passengerProfile } = await supabase
        .from('profiles')
        .select('name, avatar_url')
        .eq('id', user.id)
        .single();
      
      const passengerName = passengerProfile?.name || user.user_metadata?.name || 'Passageiro';
      const passengerAvatarUrl = passengerProfile?.avatar_url || user.user_metadata?.avatar_url || null;
      
      console.log('[usePassengerRide] - passenger_name:', passengerName);
      console.log('[usePassengerRide] - service_type:', params.serviceType);
      
      let rideId: string;
      
      if (isCarService) {
        // 2A. CARRO: INSERT em motorista_corridas
        console.log('[usePassengerRide] 🚗 Inserindo em motorista_corridas');
        
        const { data, error } = await supabase
          .from('motorista_corridas')
          .insert({
            passenger_id: user.id,
            status: 'pendente',
            origem: params.originAddress,
            destino: params.destinationAddress,
            distancia_km: params.estimatedKm || null,
            tempo_estimado: params.estimatedTimeMinutes ? `${params.estimatedTimeMinutes} min` : null,
            valor: params.estimatedPrice || null,
          })
          .select()
          .single();

        if (error) throw error;
        
        rideId = data.id;
        console.log('[usePassengerRide] ✅ Corrida CARRO criada:', rideId);
        
        // Mapear para formato PassengerRide (para compatibilidade com UI)
        const mappedRide: PassengerRide = {
          id: data.id,
          passenger_id: data.passenger_id!,
          moto_taxi_id: data.motorista_id,
          status: 'pesquisando', // UI usa 'pesquisando' para estado de busca
          origin_address: data.origem!,
          origin_lat: params.originLat,
          origin_lng: params.originLng,
          destination_address: data.destino!,
          destination_lat: params.destinationLat,
          destination_lng: params.destinationLng,
          estimated_km: data.distancia_km,
          estimated_time_minutes: params.estimatedTimeMinutes || null,
          estimated_price: data.valor,
          passenger_count: params.passengerCount || 1,
          created_at: data.created_at!,
          accepted_at: data.accepted_at,
          started_at: null,
          finished_at: data.completed_at,
          canceled_at: null,
          canceled_by: null,
        };
        
        setCurrentRide(mappedRide);
        lastProcessedStatusRef.current = 'pesquisando';
        
      } else {
        // 2B. MOTO-TÁXI: INSERT em moto_taxi_corridas_legacy (comportamento original)
        console.log('[usePassengerRide] 🏍️ Inserindo em moto_taxi_corridas_legacy');
        
        // @ts-expect-error - Type definitions may be missing
        const { data, error } = await supabase
          .from('moto_taxi_corridas_legacy')
          .insert({
            passenger_id: user.id,
            status: 'pesquisando',
            origin_address: params.originAddress,
            origin_lat: params.originLat,
            origin_lng: params.originLng,
            destination_address: params.destinationAddress,
            destination_lat: params.destinationLat,
            destination_lng: params.destinationLng,
            estimated_km: params.estimatedKm || null,
            estimated_time_minutes: params.estimatedTimeMinutes || null,
            estimated_price: params.estimatedPrice || null,
            passenger_count: params.passengerCount || 1,
          })
          .select()
          .single();

        if (error) throw error;
        
        rideId = data.id;
        console.log('[usePassengerRide] ✅ Corrida MOTO-TÁXI criada:', rideId);
        
        const ride = data as PassengerRide;
        setCurrentRide(ride);
        lastProcessedStatusRef.current = 'pesquisando';
      }
      
      // 3. Disparar broadcast com dados do passageiro
      console.log('[usePassengerRide] 📣 Disparando broadcast NEW_RIDE');
      await broadcastNewRideGlobal({
        id: rideId,
        passenger_id: user.id,
        pickup_location: params.originAddress,
        destination: params.destinationAddress,
        estimated_value: params.estimatedPrice || 0,
        service_type: params.serviceType,
        pickup_lat: params.originLat,
        pickup_lng: params.originLng,
        destination_lat: params.destinationLat,
        destination_lng: params.destinationLng,
        passenger_name: passengerName,
        passenger_avatar_url: passengerAvatarUrl,
        distance_km: params.estimatedKm || null,
        passenger_count: params.passengerCount || 1,
      });
      
      // 4. Enviar Push Notification nativa para todos os mototaxis
      // Executa em background, não bloqueia a resposta
      console.log('[usePassengerRide] 📱 Enviando Push Notification nativa');
      sendRidePushNotification({
        ride_id: rideId,
        passenger_name: passengerName,
        pickup_location: params.originAddress,
        destination: params.destinationAddress,
        estimated_value: params.estimatedPrice || 0,
        service_type: params.serviceType,
      }).catch(err => {
        console.warn('[usePassengerRide] ⚠️ Push notification falhou:', err);
      });
      
      const serviceLabel = isCarService ? 'Carro' : 'Moto-Táxi';
      toast.success(`${serviceLabel} solicitado!`, {
        description: `Valor: R$ ${(params.estimatedPrice || 0).toFixed(2)}`,
      });
      
      return currentRide;
    } catch (error: unknown) {
      console.error('[usePassengerRide] Erro ao criar:', error);
      toast.error('Erro ao solicitar corrida');
      return null;
    } finally {
      setIsCreating(false);
    }
  };

  /**
   * Cancelar corrida
   */
  const cancelRide = async () => {
    if (!currentRide?.id) return;

    try {
      // @ts-expect-error - Type definitions may be missing
      await supabase
        .from('moto_taxi_corridas_legacy')
        .update({ 
          status: 'cancelada',
          canceled_at: new Date().toISOString(),
          canceled_by: 'passenger'
        })
        .eq('id', currentRide.id)
        .eq('passenger_id', user?.id);

      toast.info('Corrida cancelada');
      setCurrentRide(null);
      setMotoTaxiInfo(null);
    } catch (error) {
      console.error('[usePassengerRide] Erro ao cancelar:', error);
      toast.error('Erro ao cancelar corrida');
    }
  };

  /**
   * Mapear status para UI
   */
  const getRideStatusForUI = (): 'idle' | 'searching' | 'driver_coming' | 'in_ride' => {
    if (!currentRide) return 'idle';
    
    switch (currentRide.status) {
      case 'pesquisando':
        return 'searching';
      case 'aceita':
      case 'a_caminho':
        return 'driver_coming';
      case 'em_andamento':
        return 'in_ride';
      default:
        return 'idle';
    }
  };

  return {
    currentRide,
    motoTaxiInfo,
    isLoading,
    isCreating,
    rideStatus: getRideStatusForUI(),
    createRide,
    cancelRide,
    refresh: loadActiveRide,
  };
}
