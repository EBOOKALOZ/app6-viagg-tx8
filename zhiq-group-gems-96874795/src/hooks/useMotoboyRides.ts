import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useRideRoute, RideRouteData } from '@/hooks/useRideRoute';

interface ActiveRide {
  id: string;
  passenger_id: string;
  status: string;
  pickup_location: string;
  destination: string;
  estimated_value: number;
  created_at: string;
  accepted_at: string | null;
  started_at: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
}

interface MotoboyRideProfile {
  accepts_passengers: boolean;
  tipo_transporte: string | null;
  capacidade_garupa: string | null;
  is_online: boolean;
}

export function useMotoboyRides() {
  const { user, activeProfile } = useAuth();
  const [activeRide, setActiveRide] = useState<ActiveRide | null>(null);
  const [hasActiveRide, setHasActiveRide] = useState(false);
  const [acceptsPassengers, setAcceptsPassengers] = useState(false);
  const [canAcceptPassengers, setCanAcceptPassengers] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Geolocalização e rota
  const { position, getCurrentPosition } = useGeolocation();
  const { routeData, isCalculating, calculateRoute, clearRoute } = useRideRoute();
  
  // Ref para controlar se já calculamos a rota após carregar a corrida
  const routeCalculatedRef = useRef<string | null>(null);

  const loadRideStatus = useCallback(async () => {
    if (!user) return;
    
    // ISOLAMENTO: Só carregar corridas se o perfil é mototaxi
    if (activeProfile !== 'mototaxi') {
      setActiveRide(null);
      setHasActiveRide(false);
      setIsLoading(false);
      return;
    }
    
    try {
      console.log('[useMotoboyRides] Carregando corrida ativa para:', user.id);
      
      // Get active ride
      const { data: rideData, error } = await supabase
        .rpc('get_active_motoboy_ride', { _user_id: user.id });
      
      if (error) {
        console.error('[useMotoboyRides] Erro ao buscar corrida:', error);
      }
      
      if (rideData && rideData.length > 0) {
        const ride = rideData[0] as ActiveRide;
        console.log('[useMotoboyRides] ✅ Corrida ativa encontrada:', ride.id, 'status:', ride.status);
        setActiveRide(ride);
        setHasActiveRide(true);
        
        // Calcular rota automaticamente se ainda não calculamos para esta corrida
        if (routeCalculatedRef.current !== ride.id && ride.pickup_lat && ride.pickup_lng) {
          routeCalculatedRef.current = ride.id;
          
          // Obter posição atual do moto-táxi
          let motoboyLat: number | undefined;
          let motoboyLng: number | undefined;
          
          try {
            const currentPos = await getCurrentPosition();
            motoboyLat = currentPos.lat;
            motoboyLng = currentPos.lng;
          } catch (geoErr) {
            if (position) {
              motoboyLat = position.lat;
              motoboyLng = position.lng;
            }
          }
          
          if (motoboyLat && motoboyLng) {
            // Fase 1: Rota até o passageiro (se status = accepted)
            // Fase 2: Rota até o destino (se status = in_progress)
            if (ride.status === 'accepted') {
              console.log('[useMotoboyRides] Calculando rota: moto-táxi -> embarque');
              calculateRoute(
                { lat: motoboyLat, lng: motoboyLng },
                { lat: ride.pickup_lat, lng: ride.pickup_lng }
              );
            } else if (ride.status === 'in_progress' && ride.destination_lat && ride.destination_lng) {
              console.log('[useMotoboyRides] Calculando rota: embarque -> destino');
              calculateRoute(
                { lat: ride.pickup_lat, lng: ride.pickup_lng },
                { lat: ride.destination_lat, lng: ride.destination_lng }
              );
            }
          }
        }
      } else {
        console.log('[useMotoboyRides] Nenhuma corrida ativa');
        setActiveRide(null);
        setHasActiveRide(false);
        routeCalculatedRef.current = null;
        clearRoute();
      }

      // Get profile settings
      const { data: profileData } = await supabase
        .from('motoboy_profiles')
        .select('accepts_passengers, tipo_transporte, capacidade_garupa, is_online')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileData) {
        setAcceptsPassengers(profileData.accepts_passengers || false);
        // Can accept passengers if has garupa capacity
        const hasGarupa = profileData.tipo_transporte === 'garupa' || 
                          profileData.tipo_transporte === 'bag_garupa';
        setCanAcceptPassengers(hasGarupa && !!profileData.capacidade_garupa);
      }
    } catch (error) {
      console.error('Error loading ride status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, activeProfile, getCurrentPosition, position, calculateRoute, clearRoute]);

  // Carregar status inicial
  useEffect(() => {
    loadRideStatus();
  }, [loadRideStatus]);
  
  // REALTIME: Escutar TODAS as mudanças na tabela e filtrar no cliente
  // CORREÇÃO: Não usar filtro de motoboy_id porque ele muda durante aceite
  useEffect(() => {
    if (!user?.id || activeProfile !== 'mototaxi') return;
    
    console.log('[useMotoboyRides] 🔌 Iniciando realtime SEM FILTRO (filtro no cliente):', user.id);
    
    const channel = supabase
      .channel(`motoboy-rides-all-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'motoboy_passenger_rides',
          // SEM FILTRO - vamos filtrar no cliente
        },
        (payload) => {
          const newRide = payload.new as ActiveRide & { motoboy_id?: string };
          console.log('[useMotoboyRides] 📡 Realtime - Evento:', payload.eventType, 'rideId:', newRide?.id, 'motoboy_id:', newRide?.motoboy_id, 'status:', newRide?.status);
          
          // FILTRO NO CLIENTE: Só processar se a corrida é MINHA
          if (newRide?.motoboy_id !== user.id) {
            console.log('[useMotoboyRides] ❌ Ignorando: motoboy_id não é meu');
            return;
          }
          
          console.log('[useMotoboyRides] ✅ Corrida É MINHA! Processando...');
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            // Status ativos (mostrar na UI)
            if (newRide.status === 'accepted' || newRide.status === 'in_progress') {
              console.log('[useMotoboyRides] ✅ Atualizando corrida ativa via realtime');
              setActiveRide(newRide as ActiveRide);
              setHasActiveRide(true);
              
              // Recalcular rota se mudou de status
              if (routeCalculatedRef.current !== `${newRide.id}-${newRide.status}`) {
                routeCalculatedRef.current = `${newRide.id}-${newRide.status}`;
                
                // Obter posição e calcular rota
                (async () => {
                  let motoboyLat: number | undefined;
                  let motoboyLng: number | undefined;
                  
                  try {
                    const currentPos = await getCurrentPosition();
                    motoboyLat = currentPos.lat;
                    motoboyLng = currentPos.lng;
                  } catch {
                    if (position) {
                      motoboyLat = position.lat;
                      motoboyLng = position.lng;
                    }
                  }
                  
                  if (motoboyLat && motoboyLng && newRide.pickup_lat && newRide.pickup_lng) {
                    if (newRide.status === 'accepted') {
                      calculateRoute(
                        { lat: motoboyLat, lng: motoboyLng },
                        { lat: newRide.pickup_lat, lng: newRide.pickup_lng }
                      );
                    } else if (newRide.status === 'in_progress' && newRide.destination_lat && newRide.destination_lng) {
                      calculateRoute(
                        { lat: newRide.pickup_lat, lng: newRide.pickup_lng },
                        { lat: newRide.destination_lat, lng: newRide.destination_lng }
                      );
                    }
                  }
                })();
              }
            } else if (newRide.status === 'completed' || newRide.status === 'cancelled') {
              console.log('[useMotoboyRides] Corrida finalizada via realtime');
              setActiveRide(null);
              setHasActiveRide(false);
              routeCalculatedRef.current = null;
              clearRoute();
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[useMotoboyRides] Realtime status:', status);
      });
    
    return () => {
      console.log('[useMotoboyRides] Removendo canal realtime');
      supabase.removeChannel(channel);
    };
  }, [user?.id, activeProfile, getCurrentPosition, position, calculateRoute, clearRoute]);

  const toggleAcceptsPassengers = async (value: boolean) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('motoboy_profiles')
        .update({ accepts_passengers: value })
        .eq('user_id', user.id);

      if (error) throw error;
      
      setAcceptsPassengers(value);
      toast.success(value ? 'Agora você aceita passageiros!' : 'Corridas de passageiro desativadas');
    } catch (error) {
      console.error('Error updating passenger preference:', error);
      toast.error('Erro ao atualizar preferência');
    }
  };

  const acceptRide = async (rideId: string, pickupLat?: number | null, pickupLng?: number | null) => {
    if (!user) {
      toast.error('Você precisa estar logado');
      return false;
    }

    try {
      // Check if already has active activity
      const { data: hasActivity } = await supabase
        .rpc('motoboy_has_active_activity', { _user_id: user.id });

      if (hasActivity) {
        toast.error('Você já tem uma atividade em andamento', {
          description: 'Finalize a atividade atual antes de aceitar outra',
        });
        return false;
      }

      const { error } = await supabase
        .from('motoboy_passenger_rides')
        .update({ 
          motoboy_id: user.id,
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', rideId)
        .eq('status', 'pending');

      if (error) throw error;

      toast.success('Corrida aceita!', {
        description: 'Calculando rota até o passageiro...',
      });
      
      // CORREÇÃO: Calcular rota imediatamente após aceite
      // Obter posição atual do moto-táxi
      let motoboyLat: number | undefined;
      let motoboyLng: number | undefined;
      
      try {
        const currentPos = await getCurrentPosition();
        motoboyLat = currentPos.lat;
        motoboyLng = currentPos.lng;
        console.log('[useMotoboyRides] GPS do moto-táxi:', motoboyLat, motoboyLng);
      } catch (geoErr) {
        console.warn('[useMotoboyRides] Erro ao obter GPS, usando posição anterior:', position);
        if (position) {
          motoboyLat = position.lat;
          motoboyLng = position.lng;
        }
      }
      
      // Calcular rota se temos coordenadas
      if (motoboyLat && motoboyLng && pickupLat && pickupLng) {
        console.log('[useMotoboyRides] Calculando rota: moto-táxi -> passageiro');
        routeCalculatedRef.current = `${rideId}-accepted`;
        await calculateRoute(
          { lat: motoboyLat, lng: motoboyLng },
          { lat: pickupLat, lng: pickupLng }
        );
      } else {
        console.warn('[useMotoboyRides] Sem coordenadas para calcular rota');
      }
      
      await loadRideStatus();
      return true;
    } catch (error: unknown) {
      console.error('Error accepting ride:', error);
      toast.error('Erro ao aceitar corrida', {
        description: error instanceof Error ? error.message : 'Tente novamente',
      });
      return false;
    }
  };

  const startRide = async () => {
    if (!activeRide) {
      toast.error('Nenhuma corrida ativa');
      return false;
    }

    try {
      const { error } = await supabase
        .from('motoboy_passenger_rides')
        .update({ 
          status: 'in_progress',
          started_at: new Date().toISOString()
        })
        .eq('id', activeRide.id)
        .eq('motoboy_id', user?.id);

      if (error) throw error;

      toast.success('Corrida iniciada!', {
        description: 'Leve o passageiro até o destino',
      });
      
      // Recalcular rota para o destino
      if (activeRide.pickup_lat && activeRide.pickup_lng && 
          activeRide.destination_lat && activeRide.destination_lng) {
        routeCalculatedRef.current = `${activeRide.id}-in_progress`;
        calculateRoute(
          { lat: activeRide.pickup_lat, lng: activeRide.pickup_lng },
          { lat: activeRide.destination_lat, lng: activeRide.destination_lng }
        );
      }
      
      await loadRideStatus();
      return true;
    } catch (error: unknown) {
      console.error('Error starting ride:', error);
      toast.error('Erro ao iniciar corrida', {
        description: error instanceof Error ? error.message : 'Tente novamente',
      });
      return false;
    }
  };

  const completeRide = async () => {
    if (!activeRide) {
      toast.error('Nenhuma corrida ativa');
      return false;
    }

    try {
      const { error } = await supabase
        .from('motoboy_passenger_rides')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', activeRide.id)
        .eq('motoboy_id', user?.id);

      if (error) throw error;

      toast.success('Corrida finalizada! 🎉', {
        description: 'Pagamento será creditado em sua carteira',
      });
      setActiveRide(null);
      setHasActiveRide(false);
      routeCalculatedRef.current = null;
      clearRoute();
      return true;
    } catch (error: unknown) {
      console.error('Error completing ride:', error);
      toast.error('Erro ao finalizar corrida', {
        description: error instanceof Error ? error.message : 'Tente novamente',
      });
      return false;
    }
  };

  const cancelRide = async () => {
    if (!activeRide) {
      toast.error('Nenhuma corrida ativa');
      return false;
    }

    try {
      const { error } = await supabase
        .from('motoboy_passenger_rides')
        .update({ 
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: 'motoboy'
        })
        .eq('id', activeRide.id)
        .eq('motoboy_id', user?.id);

      if (error) throw error;

      toast.info('Corrida cancelada', {
        description: 'O passageiro será notificado',
      });
      setActiveRide(null);
      setHasActiveRide(false);
      routeCalculatedRef.current = null;
      clearRoute();
      return true;
    } catch (error: unknown) {
      console.error('Error cancelling ride:', error);
      toast.error('Erro ao cancelar corrida', {
        description: error instanceof Error ? error.message : 'Tente novamente',
      });
      return false;
    }
  };

  return {
    activeRide,
    hasActiveRide,
    acceptsPassengers,
    canAcceptPassengers,
    isLoading,
    toggleAcceptsPassengers,
    acceptRide,
    startRide,
    completeRide,
    cancelRide,
    refresh: loadRideStatus,
    // Dados de rota
    routeData,
    isCalculatingRoute: isCalculating,
    calculateRoute,
    clearRoute,
    motoboyPosition: position,
  };
}
