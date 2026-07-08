import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { broadcastDeliveryAcceptedGlobal } from '@/lib/broadcastDeliveryAccepted';
import { calculateDistanceKm, calculateEstimatedTimeMinutes } from '@/lib/deliveryPricing';
import { DeliveryPreviewCard } from './DeliveryPreviewCard';

interface StoreInfo {
  nome_loja: string;
  cpf_cnpj: string;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
}

interface AvailableDelivery {
  id: string;
  destination: string;
  customer_name: string;
  order_description: string | null;
  estimated_value: number;
  created_at: string;
  service_type: string;
  merchant_id: string | null;
  pickup_location: string;
  store: StoreInfo | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  distance_km: number | null;
  estimated_time_min: number | null;
}

interface AvailableDeliveriesProps {
  onAccept?: () => void;
}

export default function AvailableDeliveries({ onAccept }: AvailableDeliveriesProps = {}) {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState<AvailableDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const previousDeliveryIdsRef = useRef<Set<string>>(new Set());
  const rejectedIdsRef = useRef<Set<string>>(new Set());
  
  // Estado ONLINE do motoboy
  const [isOnline, setIsOnline] = useState(false);
  const [loadingOnlineStatus, setLoadingOnlineStatus] = useState(true);
  
  // Posição do motoboy via backend (motoboy_presence)
  const [motoboyPosition, setMotoboyPosition] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('motoboy_presence')
      .select('lat, lng')
      .eq('motoboy_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setMotoboyPosition({ lat: data.lat, lng: data.lng });
      });
  }, [user?.id]);

  // Carregar status online e recusas do motoboy
  useEffect(() => {
    const loadInitialData = async () => {
      if (!user?.id) return;
      
      // Carregar status online
      const { data: profileData } = await supabase
        .from('motoboy_profiles')
        .select('is_online')
        .eq('user_id', user.id)
        .maybeSingle();
      
      setIsOnline(profileData?.is_online || false);
      
      // Carregar recusas anteriores do motoboy
      const { data: rejections } = await supabase
        .from('delivery_rejections')
        .select('delivery_id')
        .eq('motoboy_id', user.id);
      
      if (rejections) {
        rejectedIdsRef.current = new Set(rejections.map(r => r.delivery_id));
      }
      
      setLoadingOnlineStatus(false);
    };
    
    loadInitialData();
  }, [user?.id]);

  // Toggle ONLINE
  const handleGoOnline = useCallback(async () => {
    if (!user?.id) return;
    
    console.log('[AvailableDeliveries] handleGoOnline chamado');
    
    try {
      const { error } = await supabase
        .from('motoboy_profiles')
        .update({ is_online: true })
        .eq('user_id', user.id);

      if (error) throw error;
      
      setIsOnline(true);
      
      // Emitir eventos para sincronizar com outros componentes (áudio desbloqueado, etc.)
      window.dispatchEvent(new CustomEvent('motoboy-audio-unlock'));
      window.dispatchEvent(new CustomEvent('motoboy-online'));
      
      toast.success('Você está ONLINE! 🟢', { 
        description: 'Preparado para receber novas chamadas.' 
      });
    } catch (error) {
      console.error('Erro ao ficar online:', error);
      toast.error('Erro ao atualizar status');
    }
  }, [user?.id]);

  const handleGoOffline = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const { error } = await supabase
        .from('motoboy_profiles')
        .update({ is_online: false })
        .eq('user_id', user.id);

      if (error) throw error;
      
      setIsOnline(false);
      toast.info('Você está OFFLINE', { description: 'Não receberá novas chamadas' });
    } catch (error) {
      console.error('Erro ao ficar offline:', error);
      toast.error('Erro ao atualizar status');
    }
  }, [user?.id]);

  const fetchDeliveries = async () => {
    try {
      // CRÍTICO: Só buscar entregas com status 'aguardando' E motoboy_id NULL (ninguém aceitou ainda)
      const { data: ordersData, error } = await supabase
        .from('service_orders')
        .select('id, destination, customer_id, total_price, base_price, created_at, service_type, merchant_id, pickup_location, pickup_lat, pickup_lng, destination_lat, destination_lng, motoboy_id, distance_km')
        .eq('service_type', 'delivery')
        .eq('status', 'aguardando')
        .is('motoboy_id', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      // Filtrar entregas já recusadas por este motoboy
      const filteredOrders = (ordersData || []).filter(
        order => !rejectedIdsRef.current.has(order.id)
      );

      // Buscar dados das lojas dos merchants e calcular distância
      const deliveriesWithStore: AvailableDelivery[] = await Promise.all(
        filteredOrders.map(async (order) => {
          let store: StoreInfo | null = null;

          if (order.merchant_id) {
            const { data: storeData } = await supabase
              .from('merchant_stores')
              .select('nome_loja, cpf_cnpj, rua, numero, bairro, cidade, estado, cep')
              .eq('user_id', order.merchant_id)
              .single();

            if (storeData) {
              store = storeData;
            }
          }

          // Calcular distância se coordenadas disponíveis
          let distance_km: number | null = order.distance_km ? Number(order.distance_km) : null;
          let estimated_time_min: number | null = null;

          if (order.pickup_lat && order.pickup_lng && order.destination_lat && order.destination_lng) {
            if (!distance_km) {
              distance_km = calculateDistanceKm(
                order.pickup_lat,
                order.pickup_lng,
                order.destination_lat,
                order.destination_lng
              );
            }
            estimated_time_min = calculateEstimatedTimeMinutes(distance_km);
          }

          return { 
            id: order.id,
            destination: order.destination,
            customer_name: order.customer_id || 'Cliente',
            order_description: null,
            estimated_value: Number(order.total_price) || Number(order.base_price) || 0,
            created_at: order.created_at || new Date().toISOString(),
            service_type: order.service_type,
            merchant_id: order.merchant_id,
            pickup_location: order.pickup_location,
            store,
            pickup_lat: order.pickup_lat,
            pickup_lng: order.pickup_lng,
            destination_lat: order.destination_lat,
            destination_lng: order.destination_lng,
            distance_km,
            estimated_time_min,
          };
        })
      );

      previousDeliveryIdsRef.current = new Set(deliveriesWithStore.map(d => d.id));
      setDeliveries(deliveriesWithStore);
    } catch (error) {
      console.error('Erro ao buscar entregas:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveries();
    
    // Polling simples a cada 10 segundos
    const interval = setInterval(fetchDeliveries, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleAccept = async (deliveryId: string) => {
    if (!user?.id) return;
    
    setAcceptingId(deliveryId);
    
    // CORREÇÃO DEFINITIVA: Remover card IMEDIATAMENTE antes do request
    setDeliveries(prev => prev.filter(d => d.id !== deliveryId));
    
    try {
      const motoboyId: string = user.id;
      
      // ACEITAR via RPC accept_service_order
      const { data: accepted, error } = await supabase
        .rpc('accept_service_order', { p_order_id: deliveryId });

      if (error) {
        console.error('[AvailableDeliveries] Erro no RPC accept_service_order:', error);
        throw error;
      }

      if (!accepted) {
        toast.error('Este pedido já foi aceito por outro entregador');
        fetchDeliveries();
        return;
      }
      
      // PÓS-ACEITE: entra em waiting_payment (contador de 3 min). NÃO move
      // dinheiro aqui — o cliente paga DEPOIS (webhook Mercado Pago → escrow).
      // O profissional aguarda a confirmação antes de seguir para o local.
      const revertAcceptance = async (reason: string) => {
        console.warn('[AvailableDeliveries] Revertendo aceite:', reason);
        await supabase
          .from('service_orders')
          .update({ status: 'pending', motoboy_id: null, professional_id: null, accepted_at: null, driver_status: null })
          .eq('id', deliveryId);
        fetchDeliveries();
      };

      try {
        const { error: wpErr } = await (supabase.rpc as any)('set_ride_waiting_payment', {
          p_order_id: deliveryId,
          p_minutes: 3,
        });
        if (wpErr) throw new Error(wpErr.message);
      } catch (stErr: any) {
        await revertAcceptance(`waiting_payment falhou: ${stErr?.message}`);
        toast.error('Falha ao iniciar a espera de pagamento', {
          description: stErr?.message || 'Tente novamente. Se persistir, contate o suporte.',
          duration: 6000,
        });
        return;
      }

      // BROADCAST IMEDIATO
      broadcastDeliveryAcceptedGlobal(deliveryId, motoboyId);

      toast.success('Entrega aceita! Redirecionando...');
      onAccept?.();
      window.location.href = '/motoboy/rides';
    } catch (error: any) {
      console.error('[AvailableDeliveries] Erro ao aceitar entrega:', error);
      toast.error(error.message || 'Erro ao aceitar entrega');
      fetchDeliveries();
    } finally {
      setAcceptingId(null);
    }
  };

  const handleReject = async (deliveryId: string) => {
    if (!user?.id) return;
    
    setRejectingId(deliveryId);
    setDeliveries(prev => prev.filter(d => d.id !== deliveryId));
    rejectedIdsRef.current.add(deliveryId);
    
    try {
      await supabase
        .from('delivery_rejections')
        .insert({
          delivery_id: deliveryId,
          motoboy_id: user.id,
        });
      
      await supabase.rpc('dispatch_to_next_motoboy', { _delivery_id: deliveryId });
      toast.info('Entrega recusada');
    } catch (error) {
      console.error('[AvailableDeliveries] Erro ao recusar:', error);
    } finally {
      setRejectingId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (deliveries.length === 0) {
    return null;
  }

  return (
    <Card className="border-motoboy/50 bg-motoboy-light w-full max-w-full overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4 text-motoboy" />
          Entregas Disponíveis
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {deliveries.length} disponível(eis)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={`p-3 rounded-lg border ${isOnline ? 'bg-green-500/10 border-green-500/50' : 'bg-muted/50 border-border'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {isOnline ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={`text-sm font-medium ${isOnline ? 'text-green-600' : 'text-muted-foreground'}`}>
                {isOnline ? 'ONLINE - Recebendo chamadas' : 'OFFLINE - Sem chamadas'}
              </span>
            </div>
            <Button
              size="sm"
              variant={isOnline ? "outline" : "default"}
              className={`h-8 ${isOnline ? 'border-red-500 text-red-600 hover:bg-red-500/10' : ''}`}
              onClick={isOnline ? handleGoOffline : handleGoOnline}
              disabled={loadingOnlineStatus}
            >
              {isOnline ? (
                <>
                  <WifiOff className="h-4 w-4 mr-1" />
                  Ficar Offline
                </>
              ) : (
                <>
                  <Wifi className="h-4 w-4 mr-1" />
                  Ficar Online
                </>
              )}
            </Button>
          </div>
          {!isOnline && (
            <p className="text-xs text-muted-foreground mt-2">
              Clique em "Ficar Online" para receber chamadas com som
            </p>
          )}
        </div>
        {deliveries.map((delivery) => (
          <DeliveryPreviewCard
            key={delivery.id}
            delivery={delivery}
            motoboyPosition={motoboyPosition}
            onAccept={() => handleAccept(delivery.id)}
            onReject={() => handleReject(delivery.id)}
            isAccepting={acceptingId === delivery.id}
            isRejecting={rejectingId === delivery.id}
          />
        ))}
      </CardContent>
    </Card>
  );
}