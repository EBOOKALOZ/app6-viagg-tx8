/**
 * Hook para gerenciar corridas de Moto-Táxi usando a tabela moto_taxi_corridas
 * FONTE ÚNICA DE VERDADE para corridas de passageiro
 * 
 * ARQUITETURA DE ROTA:
 * - Fase pré-corrida (aceita/a_caminho): rota ORIGEM → DESTINO (sem GPS)
 * - Fase em_andamento: rota GPS → DESTINO (com tracking)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useRideRoute } from '@/hooks/useRideRoute';

export interface MotoTaxiRide {
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
  created_at: string;
  accepted_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  canceled_at: string | null;
  canceled_by: string | null;
}

// Dados do passageiro para exibir no card do motorista
export interface PassengerInfo {
  name: string;
  avatarUrl?: string;
  phone?: string;
  rating?: number;
}

interface MotoTaxiProfile {
  is_moto_taxi: boolean;
  accepts_passengers: boolean;
  is_online: boolean;
}

export function useMotoTaxiRides() {
  const { user, activeProfile } = useAuth();
  const [activeRide, setActiveRide] = useState<MotoTaxiRide | null>(null);
  const [passengerInfo, setPassengerInfo] = useState<PassengerInfo | null>(null);
  const [hasActiveRide, setHasActiveRide] = useState(false);
  const [isMotoTaxi, setIsMotoTaxi] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPassenger, setIsLoadingPassenger] = useState(false);
  
  // Rota (sem dependência de GPS antes de iniciar)
  const { routeData, isCalculating, calculateRoute, clearRoute } = useRideRoute();
  
  // CORREÇÃO: Geolocalização SEPARADA - só usada quando corrida em andamento
  // NÃO usar posição do GPS para cálculo de rota antes de iniciar
  const geoHook = useGeolocation();
  
  // Ref para controlar se já calculamos a rota - CHAVE: {rideId}-{status}
  const routeCalculatedRef = useRef<string | null>(null);
  const passengerFetchedRef = useRef<string | null>(null);
  
  // ID da corrida aceita explicitamente (evita buscar corrida errada)
  const acceptedRideIdRef = useRef<string | null>(null);
  
  // Flag para controlar se o tracking GPS está ativo
  const [isGpsTrackingActive, setIsGpsTrackingActive] = useState(false);

  /**
   * Buscar informações do passageiro
   */
  const fetchPassengerInfo = useCallback(async (passengerId: string): Promise<void> => {
    if (passengerFetchedRef.current === passengerId) return;
    
    try {
      console.log('[useMotoTaxiRides] Buscando info do passageiro:', passengerId);
      setIsLoadingPassenger(true);
      passengerFetchedRef.current = passengerId;
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('name, avatar_url, telefone')
        .eq('id', passengerId)
        .single();
      
      if (error) {
        console.warn('[useMotoTaxiRides] Erro ao buscar passageiro:', error);
        setPassengerInfo({ name: 'Passageiro', rating: 4.9 });
        return;
      }
      
      setPassengerInfo({
        name: profile.name || 'Passageiro',
        avatarUrl: profile.avatar_url || undefined,
        phone: profile.telefone || undefined,
        rating: 4.9,
      });
      
      console.log('[useMotoTaxiRides] ✅ Info do passageiro carregada:', profile.name);
    } catch (err) {
      console.error('[useMotoTaxiRides] Erro fetchPassengerInfo:', err);
      setPassengerInfo({ name: 'Passageiro', rating: 4.9 });
    } finally {
      setIsLoadingPassenger(false);
    }
  }, []);

  /**
   * Carregar corrida ativa do moto-táxi
   */
  const loadActiveRide = useCallback(async (specificRideId?: string) => {
    if (!user?.id) return;
    
    // Só carregar se perfil é mototaxi
    if (activeProfile !== 'mototaxi') {
      setActiveRide(null);
      setHasActiveRide(false);
      setIsLoading(false);
      return;
    }
    
    try {
      // CORREÇÃO: Usar ID específico se fornecido ou o ID já aceito
      const targetRideId = specificRideId || acceptedRideIdRef.current;
      
      console.log('[useMotoTaxiRides] Carregando corrida ativa para moto-táxi:', user.id, 'targetRideId:', targetRideId);
      
      // CORREÇÃO: Usar service_orders como tabela unificada
      let query = supabase
        .from('service_orders')
        .select('*')
        .eq('service_type', 'mototaxi')
        .eq('motoboy_id', user.id)
        .in('status', ['accepted', 'in_progress']);
      
      // CORREÇÃO: Se temos ID específico, buscar APENAS essa corrida
      if (targetRideId) {
        query = query.eq('id', targetRideId);
      }
      
      const { data: rawData, error } = await query
        .order('accepted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.error('[useMotoTaxiRides] Erro ao buscar corrida:', error);
      }
      
      // Map service_orders fields to MotoTaxiRide interface
      const data = rawData ? {
        id: rawData.id,
        passenger_id: rawData.customer_id,
        moto_taxi_id: rawData.motoboy_id,
        status: rawData.status === 'accepted' ? 'aceita' : rawData.status === 'in_progress' ? 'em_andamento' : rawData.status,
        origin_address: rawData.pickup_location,
        origin_lat: rawData.pickup_lat,
        origin_lng: rawData.pickup_lng,
        destination_address: rawData.destination,
        destination_lat: rawData.destination_lat,
        destination_lng: rawData.destination_lng,
        estimated_km: rawData.distance_km,
        estimated_price: rawData.total_price,
        created_at: rawData.created_at,
        accepted_at: rawData.accepted_at,
      } : null;
      
      if (data) {
        console.log('[useMotoTaxiRides] ✅ Corrida ativa encontrada:', data.id, 'status:', data.status);
        setActiveRide(data as MotoTaxiRide);
        setHasActiveRide(true);
        
        // Buscar dados do passageiro
        if (data.passenger_id) {
          fetchPassengerInfo(data.passenger_id);
        }
        
        // CORREÇÃO: Calcular rota automaticamente usando APENAS dados da corrida do banco
        // Antes de iniciar: mostrar rota ORIGEM → DESTINO (sem depender de GPS)
        // Após iniciar: mostrar rota do motorista (GPS) → DESTINO
        if (routeCalculatedRef.current !== `${data.id}-${data.status}`) {
          routeCalculatedRef.current = `${data.id}-${data.status}`;
          
          if (data.status === 'aceita' || data.status === 'a_caminho') {
            // FASE PRÉ-CORRIDA: Rota ORIGEM → DESTINO (SEM GPS!)
            // Isso garante que KM/tempo aparecem no celular sem depender de GPS
            console.log('[useMotoTaxiRides] 📍 Fase pré-corrida: rota origem→destino');
            setIsGpsTrackingActive(false);
            calculateRoute(
              { lat: data.origin_lat, lng: data.origin_lng },
              { lat: data.destination_lat, lng: data.destination_lng }
            );
          } else if (data.status === 'em_andamento') {
            // FASE CORRIDA: Ativar GPS tracking e calcular GPS → DESTINO
            console.log('[useMotoTaxiRides] 🛰️ Fase corrida: ativando GPS tracking');
            setIsGpsTrackingActive(true);
            
            // Tentar GPS para rota dinâmica
            let motoLat: number | undefined;
            let motoLng: number | undefined;
            
            try {
              const currentPos = await geoHook.getCurrentPosition();
              motoLat = currentPos.lat;
              motoLng = currentPos.lng;
            } catch {
              if (geoHook.position) {
                motoLat = geoHook.position.lat;
                motoLng = geoHook.position.lng;
              }
            }
            
            if (motoLat && motoLng) {
              console.log('[useMotoTaxiRides] Calculando rota GPS→destino');
              calculateRoute(
                { lat: motoLat, lng: motoLng },
                { lat: data.destination_lat, lng: data.destination_lng }
              );
            } else {
              // Fallback: origem → destino
              console.log('[useMotoTaxiRides] GPS indisponível, usando origem→destino');
              calculateRoute(
                { lat: data.origin_lat, lng: data.origin_lng },
                { lat: data.destination_lat, lng: data.destination_lng }
              );
            }
          }
        }
      } else {
        console.log('[useMotoTaxiRides] Nenhuma corrida ativa');
        setActiveRide(null);
        setHasActiveRide(false);
        setPassengerInfo(null);
        routeCalculatedRef.current = null;
        passengerFetchedRef.current = null;
        // CORREÇÃO: Só limpar acceptedRideIdRef se não temos targetRideId
        // (para evitar limpar durante a busca inicial após aceite)
        if (!targetRideId) {
          acceptedRideIdRef.current = null;
        }
        clearRoute();
      }

      // Buscar se é moto-táxi
      const { data: profileData } = await supabase
        .from('profiles')
        .select('is_moto_taxi')
        .eq('id', user.id)
        .single();

      setIsMotoTaxi(profileData?.is_moto_taxi || false);
    } catch (error) {
      console.error('[useMotoTaxiRides] Error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, activeProfile, geoHook, calculateRoute, clearRoute, fetchPassengerInfo]);

  // Carregar status inicial
  useEffect(() => {
    loadActiveRide();
  }, [loadActiveRide]);
  
  // REALTIME: Escutar mudanças na tabela service_orders (mototaxi)
  useEffect(() => {
    if (!user?.id || activeProfile !== 'mototaxi') return;
    
    console.log('[useMotoTaxiRides] 🔌 Iniciando realtime service_orders para:', user.id);
    
    const channel = supabase
      .channel(`moto-taxi-rides-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_orders',
        },
        (payload) => {
          const rawRecord = payload.new as Record<string, unknown>;
          
          // Só processar se é do tipo mototaxi e é minha corrida
          if (rawRecord?.service_type !== 'mototaxi' || rawRecord?.motoboy_id !== user.id) {
            return;
          }
          
          // Map para formato MotoTaxiRide
          const newRide: MotoTaxiRide = {
            id: rawRecord.id,
            passenger_id: rawRecord.customer_id,
            moto_taxi_id: rawRecord.motoboy_id,
            status: rawRecord.status === 'accepted' ? 'aceita' : rawRecord.status === 'in_progress' ? 'em_andamento' : rawRecord.status === 'completed' ? 'finalizada' : rawRecord.status === 'cancelled' ? 'cancelada' : rawRecord.status,
            origin_address: rawRecord.pickup_location,
            origin_lat: rawRecord.pickup_lat,
            origin_lng: rawRecord.pickup_lng,
            destination_address: rawRecord.destination,
            destination_lat: rawRecord.destination_lat,
            destination_lng: rawRecord.destination_lng,
            estimated_km: rawRecord.distance_km,
            estimated_price: rawRecord.total_price,
            created_at: rawRecord.created_at,
            accepted_at: rawRecord.accepted_at,
            started_at: null,
            finished_at: rawRecord.completed_at,
            canceled_at: null,
            canceled_by: null,
            estimated_time_minutes: null,
          };
          
          console.log('[useMotoTaxiRides] 📡 Realtime:', payload.eventType, 'rideId:', newRide?.id, 'moto_taxi_id:', newRide?.moto_taxi_id, 'status:', newRide?.status);
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (['aceita', 'a_caminho', 'em_andamento'].includes(newRide.status)) {
              console.log('[useMotoTaxiRides] ✅ Atualizando corrida ativa');
              setActiveRide(newRide);
              setHasActiveRide(true);
              
              // Buscar dados do passageiro se ainda não temos
              if (newRide.passenger_id && passengerFetchedRef.current !== newRide.passenger_id) {
                fetchPassengerInfo(newRide.passenger_id);
              }
              
              // CORREÇÃO: Recalcular rota usando mesma lógica do loadActiveRide
              if (routeCalculatedRef.current !== `${newRide.id}-${newRide.status}`) {
                routeCalculatedRef.current = `${newRide.id}-${newRide.status}`;
                
                if (newRide.status === 'aceita' || newRide.status === 'a_caminho') {
                  // FASE PRÉ-CORRIDA: Rota ORIGEM → DESTINO (SEM GPS!)
                  console.log('[useMotoTaxiRides] Realtime: rota origem→destino (sem GPS)');
                  setIsGpsTrackingActive(false);
                  calculateRoute(
                    { lat: newRide.origin_lat, lng: newRide.origin_lng },
                    { lat: newRide.destination_lat, lng: newRide.destination_lng }
                  );
                } else if (newRide.status === 'em_andamento') {
                  // FASE CORRIDA: Ativar GPS e calcular GPS → DESTINO
                  console.log('[useMotoTaxiRides] Realtime: ativando GPS tracking');
                  setIsGpsTrackingActive(true);
                  
                  (async () => {
                    let motoLat: number | undefined;
                    let motoLng: number | undefined;
                    
                    try {
                      const currentPos = await geoHook.getCurrentPosition();
                      motoLat = currentPos.lat;
                      motoLng = currentPos.lng;
                    } catch {
                      if (geoHook.position) {
                        motoLat = geoHook.position.lat;
                        motoLng = geoHook.position.lng;
                      }
                    }
                    
                    if (motoLat && motoLng) {
                      console.log('[useMotoTaxiRides] Realtime: rota GPS→destino');
                      calculateRoute(
                        { lat: motoLat, lng: motoLng },
                        { lat: newRide.destination_lat, lng: newRide.destination_lng }
                      );
                    } else {
                      console.log('[useMotoTaxiRides] Realtime: GPS indisponível, origem→destino');
                      calculateRoute(
                        { lat: newRide.origin_lat, lng: newRide.origin_lng },
                        { lat: newRide.destination_lat, lng: newRide.destination_lng }
                      );
                    }
                  })();
                }
              }
            } else if (newRide.status === 'finalizada' || newRide.status === 'cancelada') {
              console.log('[useMotoTaxiRides] Corrida finalizada');
              setActiveRide(null);
              setHasActiveRide(false);
              setPassengerInfo(null);
              routeCalculatedRef.current = null;
              passengerFetchedRef.current = null;
              clearRoute();
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[useMotoTaxiRides] Realtime status:', status);
      });
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, activeProfile, geoHook, calculateRoute, clearRoute, fetchPassengerInfo]);

  /**
   * Aceitar corrida - UPDATE CONDICIONAL (só aceita se status === 'pesquisando')
   * CORREÇÃO: Usa EXCLUSIVAMENTE dados da corrida do banco, nunca geolocalização local
   */
  const acceptRide = async (rideId: string) => {
    if (!user?.id) {
      toast.error('Você precisa estar logado');
      return false;
    }

    try {
      console.log('[useMotoTaxiRides] Aceitando corrida:', rideId);
      
      // CORREÇÃO CRÍTICA: Salvar o ID da corrida que estamos aceitando
      // Isso garante que todas as operações futuras usem ESTE ID
      acceptedRideIdRef.current = rideId;
      
      // Limpar estado anterior antes de aceitar nova corrida
      clearRoute();
      routeCalculatedRef.current = null;
      passengerFetchedRef.current = null;
      setPassengerInfo(null);
      setActiveRide(null); // Limpar corrida anterior explicitamente
      
      // UPDATE ATÔMICO CONDICIONAL - só executa se status === 'aguardando'
      const { data: rawData, error } = await supabase
        .from('service_orders')
        .update({ 
          motoboy_id: user.id,
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', rideId)
        .eq('service_type', 'mototaxi')
        .eq('status', 'aguardando')
        .select()
        .maybeSingle();

      if (error) throw error;
      
      // Map para formato correto
      const data = rawData ? {
        id: rawData.id,
        passenger_id: rawData.customer_id,
        moto_taxi_id: rawData.motoboy_id,
        status: 'aceita',
        origin_lat: rawData.pickup_lat,
        origin_lng: rawData.pickup_lng,
        destination_lat: rawData.destination_lat,
        destination_lng: rawData.destination_lng,
      } : null;
      
      // Se data é null, significa que o UPDATE não afetou nenhuma linha
      // CORREÇÃO: Verificar se foi o próprio usuário que aceitou (evita falso positivo)
      if (!data) {
        // Buscar status real da corrida E quem aceitou
        const { data: rideCheck } = await supabase
          .from('service_orders')
          .select('status, motoboy_id')
          .eq('id', rideId)
          .eq('service_type', 'mototaxi')
          .single();
        
        // CORREÇÃO OWNERSHIP: Se já é minha corrida, apenas recarregar
        if (rideCheck?.motoboy_id === user.id) {
          console.log('[useMotoTaxiRides] Corrida já é minha, recarregando...');
          toast.success('Corrida aceita! 🏍️');
          await loadActiveRide();
          return true;
        }
        
        // MENSAGENS AMIGÁVEIS CORRIGIDAS (moto-táxi, não motoboy)
        if (rideCheck?.status === 'accepted') {
          toast.info('Esta corrida foi aceita por outro moto-táxi. Você continua disponível!', {
            duration: 5000,
            icon: '🏍️',
          });
        } else if (rideCheck?.status === 'cancelled') {
          toast.info('Corrida cancelada pelo passageiro. Aguardando novas solicitações.', {
            duration: 4000,
            icon: '📱',
          });
        } else {
          toast.info('Esta corrida não está mais disponível. Você continua online!', {
            duration: 4000,
            icon: '✓',
          });
        }
        return false;
      }

      toast.success('Corrida aceita! 🏍️', {
        description: 'Vá até o passageiro',
      });
      
      // CORREÇÃO: Usar EXCLUSIVAMENTE coordenadas da corrida do banco
      // Calcular rota: origem da corrida → destino da corrida (para fase 'em_andamento')
      // Para fase 'aceita', a rota motoboy → pickup será mostrada pelo mapa com GPS atualizado
      console.log('[useMotoTaxiRides] ✅ Corrida aceita, dados do banco:', {
        origin_lat: data.origin_lat,
        origin_lng: data.origin_lng,
        destination_lat: data.destination_lat,
        destination_lng: data.destination_lng,
      });
      
      // Definir corrida ativa imediatamente com dados FRESCOS do banco
      setActiveRide(data as MotoTaxiRide);
      setHasActiveRide(true);
      
      // Buscar info do passageiro
      if (data.passenger_id) {
        fetchPassengerInfo(data.passenger_id);
      }
      
      // CORREÇÃO: Calcular rota ORIGEM → DESTINO imediatamente
      // Não depender de GPS antes de iniciar (evita problema no celular)
      if (data.origin_lat && data.origin_lng && data.destination_lat && data.destination_lng) {
        routeCalculatedRef.current = `${rideId}-aceita`;
        console.log('[useMotoTaxiRides] Aceite: calculando rota origem→destino (sem GPS)');
        await calculateRoute(
          { lat: data.origin_lat, lng: data.origin_lng },
          { lat: data.destination_lat, lng: data.destination_lng }
        );
      }
      
      return true;
    } catch (error: Error | unknown) {
      console.error('[useMotoTaxiRides] Erro ao aceitar:', error);
      toast.error('Erro ao aceitar corrida');
      return false;
    }
  };

  /**
   * Iniciar corrida (passageiro embarcou)
   * CORREÇÃO: Usa ID da corrida ativa ou o ID aceito explicitamente
   */
  const startRide = async () => {
    // CORREÇÃO: Usar o ID aceito como fallback
    const rideIdToUse = activeRide?.id || acceptedRideIdRef.current;
    
    if (!rideIdToUse) {
      toast.error('Nenhuma corrida ativa');
      console.error('[useMotoTaxiRides] startRide: sem ID de corrida. activeRide:', activeRide, 'acceptedRideIdRef:', acceptedRideIdRef.current);
      return false;
    }
    
    console.log('[useMotoTaxiRides] Iniciando corrida:', rideIdToUse);

    try {
      // CORREÇÃO: Buscar dados da corrida se não temos activeRide
      let rideData = activeRide;
      if (!rideData) {
        const { data: rawFreshRide, error: fetchError } = await supabase
          .from('service_orders')
          .select('*')
          .eq('id', rideIdToUse)
          .eq('service_type', 'mototaxi')
          .eq('motoboy_id', user?.id)
          .single();
        
        if (fetchError || !rawFreshRide) {
          console.error('[useMotoTaxiRides] Erro ao buscar corrida:', fetchError);
          toast.error('Corrida não encontrada');
          return false;
        }
        
        // Map para formato MotoTaxiRide
        rideData = {
          id: rawFreshRide.id,
          passenger_id: rawFreshRide.customer_id || '',
          moto_taxi_id: rawFreshRide.motoboy_id || '',
          status: rawFreshRide.status === 'accepted' ? 'aceita' : 'em_andamento',
          origin_address: rawFreshRide.pickup_location || '',
          origin_lat: rawFreshRide.pickup_lat || 0,
          origin_lng: rawFreshRide.pickup_lng || 0,
          destination_address: rawFreshRide.destination || '',
          destination_lat: rawFreshRide.destination_lat || 0,
          destination_lng: rawFreshRide.destination_lng || 0,
          estimated_km: rawFreshRide.distance_km ? Number(rawFreshRide.distance_km) : null,
          estimated_price: rawFreshRide.total_price ? Number(rawFreshRide.total_price) : null,
          estimated_time_minutes: null,
          created_at: rawFreshRide.created_at || '',
          accepted_at: rawFreshRide.accepted_at || null,
          started_at: null,
          finished_at: null,
          canceled_at: null,
          canceled_by: null,
        };
        setActiveRide(rideData);
      }
      
      const { error } = await supabase
        .from('service_orders')
        .update({ 
          status: 'in_progress',
        })
        .eq('id', rideIdToUse)
        .eq('service_type', 'mototaxi')
        .eq('motoboy_id', user?.id);

      if (error) throw error;

      toast.success('Corrida iniciada!', {
        description: 'Leve o passageiro até o destino',
      });
      
      // Recalcular rota para o destino usando rideData (dados frescos)
      if (rideData.origin_lat && rideData.destination_lat) {
        routeCalculatedRef.current = `${rideIdToUse}-em_andamento`;
        calculateRoute(
          { lat: rideData.origin_lat, lng: rideData.origin_lng },
          { lat: rideData.destination_lat, lng: rideData.destination_lng }
        );
      }
      
      await loadActiveRide(rideIdToUse);
      return true;
    } catch (error: Error | unknown) {
      console.error('[useMotoTaxiRides] Erro ao iniciar:', error);
      toast.error('Erro ao iniciar corrida');
      return false;
    }
  };

  /**
   * Finalizar corrida
   * CORREÇÃO: Usa ID da corrida ativa ou o ID aceito explicitamente
   */
  const completeRide = async () => {
    const rideIdToUse = activeRide?.id || acceptedRideIdRef.current;
    
    if (!rideIdToUse) {
      toast.error('Nenhuma corrida ativa');
      console.error('[useMotoTaxiRides] completeRide: sem ID de corrida');
      return false;
    }

    try {
      console.log('[useMotoTaxiRides] Finalizando corrida:', rideIdToUse);
      
      const { error } = await supabase
        .from('service_orders')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', rideIdToUse)
        .eq('service_type', 'mototaxi')
        .eq('motoboy_id', user?.id);

      if (error) throw error;

      toast.success('Corrida finalizada! 🎉');
      
      // Limpar TODOS os estados e refs
      setActiveRide(null);
      setHasActiveRide(false);
      routeCalculatedRef.current = null;
      acceptedRideIdRef.current = null; // CORREÇÃO: Limpar ID aceito
      passengerFetchedRef.current = null;
      setPassengerInfo(null);
      clearRoute();
      
      return true;
    } catch (error: Error | unknown) {
      console.error('[useMotoTaxiRides] Erro ao finalizar:', error);
      toast.error('Erro ao finalizar corrida');
      return false;
    }
  };

  /**
   * Cancelar corrida
   * CORREÇÃO: Usa ID da corrida ativa ou o ID aceito explicitamente
   */
  const cancelRide = async () => {
    const rideIdToUse = activeRide?.id || acceptedRideIdRef.current;
    
    if (!rideIdToUse) {
      toast.error('Nenhuma corrida ativa');
      console.error('[useMotoTaxiRides] cancelRide: sem ID de corrida');
      return false;
    }

    try {
      console.log('[useMotoTaxiRides] Cancelando corrida:', rideIdToUse);
      
      const { error } = await supabase
        .from('service_orders')
        .update({ 
          status: 'cancelled',
        })
        .eq('id', rideIdToUse)
        .eq('service_type', 'mototaxi')
        .eq('motoboy_id', user?.id);

      if (error) throw error;

      toast.info('Corrida cancelada');
      
      // Limpar TODOS os estados e refs
      setActiveRide(null);
      setHasActiveRide(false);
      routeCalculatedRef.current = null;
      acceptedRideIdRef.current = null; // CORREÇÃO: Limpar ID aceito
      passengerFetchedRef.current = null;
      setPassengerInfo(null);
      clearRoute();
      
      return true;
    } catch (error: Error | unknown) {
      console.error('[useMotoTaxiRides] Erro ao cancelar:', error);
      toast.error('Erro ao cancelar corrida');
      return false;
    }
  };

  return {
    activeRide,
    hasActiveRide,
    isMotoTaxi,
    isLoading,
    passengerInfo,
    isLoadingPassenger,
    acceptRide,
    startRide,
    completeRide,
    cancelRide,
    refresh: loadActiveRide,
    // Dados de rota
    routeData,
    isCalculatingRoute: isCalculating,
    calculateRoute,
    clearRoute,
    // GPS: só retornar posição quando tracking ativo (corrida em andamento)
    motoTaxiPosition: isGpsTrackingActive ? geoHook.position : null,
    isGpsTrackingActive,
  };
}
