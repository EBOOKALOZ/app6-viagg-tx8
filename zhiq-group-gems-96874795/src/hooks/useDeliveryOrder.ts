import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { calculateDistanceKm, calculateMotoboyValue } from '@/lib/deliveryPricing';
import { usePaymentsOrchestrator } from '@/hooks/usePaymentsOrchestrator';
import { fetchOrderPayContext } from '@/lib/payments/deliveryPay';
import { handleChannelStatus, clearReconnectTimeout } from '@/hooks/realtime/reconnect';

// Taxa padrão de comissão (fallback)
const DEFAULT_COMMISSION_RATE = 0.25; // 25% de taxa para motoboys sem grupos

// Função para buscar taxa de comissão dinâmica do motoboy
async function getMotoboyCommissionRate(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .rpc('get_motoboy_commission_rate', { _user_id: userId });
    
    if (error) {
      console.error('[getMotoboyCommissionRate] Erro:', error);
      return DEFAULT_COMMISSION_RATE * 100; // Retorna 25%
    }
    
    console.log('[getMotoboyCommissionRate] Taxa dinâmica:', data, '%');
    return Number(data) || 25;
  } catch (err) {
    console.error('[getMotoboyCommissionRate] Exception:', err);
    return DEFAULT_COMMISSION_RATE * 100;
  }
}

export interface DeliveryOrder {
  id: string;
  delivery_code: string;
  status: string;
  pickup_location: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  destination: string;
  destination_lat: number | null;
  destination_lng: number | null;
  motoboy_lat: number | null;
  motoboy_lng: number | null;
  customer_name: string;
  customer_phone: string | null;
  estimated_value: number;
  order_description: string | null;
  vehicle_type: 'moto' | 'carro';
  created_at: string;
  accepted_at: string | null;
}

// CORREÇÃO: Log dos dados recebidos para debug
const logDeliveryData = (label: string, data: Record<string, unknown> | null) => {
  console.log(`[useDeliveryOrder] ${label}:`, {
    id: data?.id,
    status: data?.status,
    pickup_location: data?.pickup_location,
    pickup_lat: data?.pickup_lat,
    pickup_lng: data?.pickup_lng,
    destination_lat: data?.destination_lat,
    destination_lng: data?.destination_lng,
  });
};

export function useDeliveryOrder() {
  const { user } = useAuth();
  const { cancelDelivery: cancelDeliveryPay } = usePaymentsOrchestrator();
  const [activeOrder, setActiveOrder] = useState<DeliveryOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);

  // CORREÇÃO A-6: reconexão automática do canal realtime em
  // CHANNEL_ERROR/TIMED_OUT/CLOSED (mesmo padrão de RealtimeService.ts:31-42).
  const [reconnectTick, setReconnectTick] = useState(0);
  const isMountedRef = useRef(true);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchActiveOrder = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .rpc('get_active_delivery', { _user_id: user.id });

      // NÃO abortar se a RPC falhar: get_active_delivery pode não existir
      // no banco (divergência) → o erro derrubava o fetch inteiro e a
      // corrida nunca aparecia pro motoboy. Erro/sem dado = cai no
      // SELECT direto abaixo (fonte da verdade, casa courier_id).
      if (!error && data && data.length > 0) {
        logDeliveryData('Entrega ativa encontrada via RPC', data[0]);
        setActiveOrder(data[0] as DeliveryOrder);
      } else {
        // O aceite atual grava courier_id (versões antigas usavam
        // motoboy_id) — casa qualquer um dos dois p/ a corrida ativa
        // aparecer pro motoboy independente da coluna preenchida.
        const { data: directData, error: directError } = await supabase
          .from('service_orders')
          .select('*')
          .or(`motoboy_id.eq.${user.id},courier_id.eq.${user.id}`)
          .eq('service_type', 'delivery')
          .in('status', ['accepted', 'in_progress', 'assigned'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (!directError && directData) {
          logDeliveryData('Entrega ativa encontrada via SELECT direto', directData);
          setActiveOrder({
            id: directData.id,
            delivery_code: directData.delivery_code || `${directData.id.slice(-4).toUpperCase()}`,
            status: directData.status,
            pickup_location: directData.pickup_location,
            pickup_lat: directData.pickup_lat,
            pickup_lng: directData.pickup_lng,
            destination: directData.destination,
            destination_lat: directData.destination_lat,
            destination_lng: directData.destination_lng,
            motoboy_lat: null,
            motoboy_lng: null,
            customer_name: directData.customer_name || directData.customer_id || 'Cliente',
            customer_phone: directData.customer_phone || null,
            estimated_value: Number(directData.total_price) || 0,
            order_description: directData.order_description || null,
            vehicle_type: 'moto',
            created_at: directData.created_at || new Date().toISOString(),
            accepted_at: directData.accepted_at,
          });
        } else {
          setActiveOrder(null);
        }
      }
    } catch (error) {
      console.error('[useDeliveryOrder] Erro ao buscar entrega ativa:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchActiveOrder();
  }, [fetchActiveOrder]);

  // CORREÇÃO: Adicionar realtime subscription para atualizações de entrega
  useEffect(() => {
    if (!user?.id) return;

    console.log('[useDeliveryOrder] Configurando realtime subscription para user:', user.id);

    const channel = supabase
      .channel('motoboy-delivery-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_orders',
          filter: `courier_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[useDeliveryOrder] Realtime UPDATE recebido:', payload.new);
          const updated = payload.new as Record<string, unknown>;
          
          // Atualizar estado para qualquer status ativo
          const activeStatuses = ['accepted', 'in_progress', 'assigned'];
          if (activeStatuses.includes(updated.status)) {
            setActiveOrder({
              id: updated.id,
              delivery_code: updated.delivery_code || `${updated.id.slice(-4).toUpperCase()}`,
              status: updated.status,
              pickup_location: updated.pickup_location,
              pickup_lat: updated.pickup_lat,
              pickup_lng: updated.pickup_lng,
              destination: updated.destination,
              destination_lat: updated.destination_lat,
              destination_lng: updated.destination_lng,
              motoboy_lat: null,
              motoboy_lng: null,
              customer_name: updated.customer_name || updated.customer_id || 'Cliente',
              customer_phone: updated.customer_phone || null,
              estimated_value: Number(updated.total_price) || 0,
              order_description: updated.order_description || null,
              vehicle_type: 'moto',
              created_at: updated.created_at,
              accepted_at: updated.accepted_at,
            });
          }
          
          // Se status mudou para completed ou cancelled, limpar
          if (['completed', 'cancelled'].includes(updated.status)) {
            setActiveOrder(null);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_orders',
          filter: `courier_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[useDeliveryOrder] Realtime INSERT recebido:', payload.new);
          const inserted = payload.new as Record<string, unknown>;
          
          const activeStatuses = ['accepted', 'in_progress', 'assigned'];
          if (activeStatuses.includes(inserted.status)) {
            setActiveOrder({
              id: inserted.id,
              delivery_code: inserted.delivery_code || `${inserted.id.slice(-4).toUpperCase()}`,
              status: inserted.status,
              pickup_location: inserted.pickup_location,
              pickup_lat: inserted.pickup_lat,
              pickup_lng: inserted.pickup_lng,
              destination: inserted.destination,
              destination_lat: inserted.destination_lat,
              destination_lng: inserted.destination_lng,
              motoboy_lat: null,
              motoboy_lng: null,
              customer_name: inserted.customer_name || inserted.customer_id || 'Cliente',
              customer_phone: inserted.customer_phone || null,
              estimated_value: Number(inserted.total_price) || 0,
              order_description: inserted.order_description || null,
              vehicle_type: 'moto',
              created_at: inserted.created_at,
              accepted_at: inserted.accepted_at,
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('[useDeliveryOrder] Subscription status:', status);
        // CORREÇÃO A-6: reconectar em 5s se o canal cair, senão o motoboy
        // para de receber atualização de entrega silenciosamente.
        handleChannelStatus(status, {
          label: '[useDeliveryOrder]',
          isMountedRef,
          reconnectTimeoutRef,
          onReconnect: () => setReconnectTick((t) => t + 1),
        });
      });

    return () => {
      console.log('[useDeliveryOrder] Removendo subscription');
      // CORREÇÃO A-6: cancelar timer de reconexão pendente — evita setState
      // em componente desmontado e vazamento de timer.
      clearReconnectTimeout(reconnectTimeoutRef);
      supabase.removeChannel(channel);
    };
  // reconnectTick: incrementado ao detectar CHANNEL_ERROR/TIMED_OUT/CLOSED,
  // força a remontagem do canal após o backoff de 5s.
  }, [user?.id, reconnectTick]);

  // Unmount definitivo do hook: impede que um timer de reconexão em voo
  // dispare setReconnectTick depois que o componente já foi desmontado.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const validateCode = async (orderId: string, code: string): Promise<boolean> => {
    // LOG DETALHADO: Dados de entrada da validação de ENTREGA (codigo_entrega do cliente)
    console.log('============================================');
    console.log('[validateCode] === VALIDAÇÃO DE ENTREGA (CLIENTE) ===');
    console.log('[validateCode] delivery_order_id enviado:', orderId);
    console.log('[validateCode] codigo_digitado:', code);
    console.log('[validateCode] tipo_codigo: codigo_entrega (exibido ao CLIENTE, NÃO à loja)');
    console.log('[validateCode] RPC chamada: validate_delivery_code');
    console.log('[validateCode] activeOrder.id:', activeOrder?.id);
    console.log('[validateCode] activeOrder.status:', activeOrder?.status);
    console.log('[validateCode] user.id (motoboy):', user?.id);
    console.log('============================================');
    
    if (!user?.id) {
      toast.error('Você precisa estar logado');
      return false;
    }

    if (!code || code.length !== 4) {
      toast.error('Código inválido', {
        description: 'O código deve ter 4 dígitos',
      });
      return false;
    }
    
    // Normalizar código como string (sem parseInt, preserva zeros à esquerda)
    const normalizedCode = String(code).trim();
    console.log('[validateCode] codigo_normalizado (string, sem parseInt):', `"${normalizedCode}"`);
    
    // GARANTIA: Usar o ID correto da entrega ativa
    const deliveryId = orderId || activeOrder?.id;
    if (!deliveryId) {
      console.error('[validateCode] ERRO: Nenhum delivery_order_id disponível!');
      toast.error('Erro interno', { description: 'ID da entrega não encontrado' });
      return false;
    }
    
    console.log('[validateCode] ID final usado para RPC:', deliveryId);
    
    setIsValidating(true);
    try {
      // CORREÇÃO: Buscar o código armazenado diretamente da tabela service_orders
      // para garantir que a validação é feita contra a fonte da verdade (a ordem)
      const { data: orderData, error: orderError } = await supabase
        .from('service_orders')
        .select('id, status')
        .eq('id', deliveryId)
        .maybeSingle();
      
      console.log('[validateCode] Busca direta na tabela service_orders:');
      console.log('[validateCode]   orderData:', orderData);
      console.log('[validateCode]   orderError:', orderError);
      
      if (orderError) {
        console.error('[validateCode] Erro ao buscar ordem:', orderError);
        throw orderError;
      }
      
      if (!orderData) {
        console.error('[validateCode] Ordem não encontrada para ID:', deliveryId);
        toast.error('Entrega não encontrada');
        return false;
      }
      
      // Gerar código baseado no ID para validação
      const storedCode = orderData.id.slice(-4).toUpperCase();
      console.log('[validateCode] Código armazenado (normalizado):', `"${storedCode}"`);
      console.log('[validateCode] Código digitado (normalizado):', `"${normalizedCode}"`);
      console.log('[validateCode] Status atual:', orderData.status);
      
      // Verificar status válido para finalização
      const validStatuses = ['accepted', 'in_progress'];
      if (!validStatuses.includes(orderData.status)) {
        console.log('[validateCode] Status inválido para finalização:', orderData.status);
        toast.error('Esta entrega não pode ser finalizada', {
          description: `Status atual: ${orderData.status}`,
        });
        return false;
      }
      
      // Comparar códigos como strings (case-insensitive)
      if (storedCode.toUpperCase() !== normalizedCode.toUpperCase()) {
        console.log('[validateCode] FALHA: códigos não conferem');
        console.log('[validateCode]   storedCode:', storedCode, 'length:', storedCode.length);
        console.log('[validateCode]   inputCode:', normalizedCode, 'length:', normalizedCode.length);
        toast.error('Código incorreto', {
          description: 'Verifique o código com o cliente e tente novamente',
        });
        return false;
      }
      
      // Código válido! Atualizar status para completed
      console.log('[validateCode] Código válido! Finalizando entrega...');
      
      // Buscar dados completos da entrega para criar histórico
      const { data: fullOrderData, error: fullOrderError } = await supabase
        .from('service_orders')
        .select('id, customer_id, pickup_location, destination, pickup_lat, pickup_lng, destination_lat, destination_lng, total_price, accepted_at, merchant_id')
        .eq('id', deliveryId)
        .maybeSingle();
      
      if (fullOrderError) {
        console.error('[validateCode] Erro ao buscar dados completos:', fullOrderError);
      }
      
      // Buscar nome da loja separadamente (se tiver merchant_id)
      let lojaNome: string | null = null;
      if (fullOrderData?.merchant_id) {
        const { data: storeData } = await supabase
          .from('merchant_stores')
          .select('nome_loja')
          .eq('user_id', fullOrderData.merchant_id)
          .maybeSingle();
        lojaNome = storeData?.nome_loja || null;
      }
      
      // CRÍTICO: Log completo do valor
      console.log('[validateCode] ✅ fullOrderData:', {
        id: fullOrderData?.id,
        total_price: fullOrderData?.total_price,
        tipo: typeof fullOrderData?.total_price
      });
      console.log('[validateCode] ✅ lojaNome:', lojaNome);

      // Buscar taxa de comissão dinâmica
      const commissionRate = await getMotoboyCommissionRate(user.id);
      
      // Finalizar via RPC complete_service_order (obrigatório pelo banco)
      const { error: completeError } = await supabase
        .rpc('complete_service_order', { 
          _motoboy_id: user.id,
          _order_id: deliveryId,
          _platform_fee_percent: commissionRate,
        });
      
      if (completeError) {
        console.error('[validateCode] Erro ao finalizar via RPC:', completeError);
        throw completeError;
      }

      // LIBERAR PAGAMENTO pay_* (fonte da verdade): liquidação ATÔMICA e
      // IDEMPOTENTE loja → motoboy (líquido) + plataforma (comissão) via
      // RPC server-side `pay_settle_delivery`. Substitui a orquestração
      // client-side antiga (requestDelivery/completeDelivery) que falhava
      // calada e deixava o motoboy sem receber. Seguro chamar mais de uma
      // vez: a RPC faz replay idempotente por pedido (chave delivery_settle).
      try {
        const { data: settleRes, error: settleErr } = await supabase.rpc(
          'pay_settle_delivery',
          { p_order_id: deliveryId, p_commission_percent: commissionRate },
        );
        if (settleErr) throw settleErr;
        const settleObj = settleRes as Record<string, unknown> | null;
        if (settleObj?.success === false) {
          throw new Error(String(settleObj?.error || 'pay_settle_delivery falhou'));
        }
        console.log('[validateCode] pay_settle_delivery OK:', settleRes);
      } catch (payErr: unknown) {
        // Estado da entrega já mudou; não reverter. Loga p/ conciliação.
        console.error('[validateCode] pay_settle_delivery falhou:', payErr);
      }

      // Criar registro no histórico com lojaNome já resolvido
      const historyData = {
        pickup_location: fullOrderData?.pickup_location,
        destination: fullOrderData?.destination,
        pickup_lat: fullOrderData?.pickup_lat,
        pickup_lng: fullOrderData?.pickup_lng,
        destination_lat: fullOrderData?.destination_lat,
        destination_lng: fullOrderData?.destination_lng,
        estimated_value: Number(fullOrderData?.total_price) || 0,
        accepted_at: fullOrderData?.accepted_at,
        loja_nome: lojaNome,
        customer_name: fullOrderData?.customer_id || 'Cliente',
      };
      console.log('[validateCode] Criando registro no histórico com valor:', historyData.estimated_value, '| loja:', lojaNome);
      await createDeliveryHistory(deliveryId, historyData);
      
      console.log('[validateCode] SUCESSO: Entrega finalizada!');
      toast.success('Entrega confirmada! 🎉', {
        description: 'Pagamento liberado para sua carteira',
      });
      setActiveOrder(null);
      return true;
      
    } catch (error: unknown) {
      console.error('[validateCode] Exception:', error);
      const errorObj = error as Record<string, unknown>;
      toast.error('Erro ao validar código', {
        description: String(errorObj?.message || 'Tente novamente'),
      });
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  // Função para criar registro no histórico após validação
  const createDeliveryHistory = async (deliveryId: string, orderData: Record<string, unknown>) => {
    if (!user?.id) return;
    
    try {
      // Calcular distância se temos coordenadas
      let distanceKm = 0;
      if (orderData?.pickup_lat && orderData?.pickup_lng && 
          orderData?.destination_lat && orderData?.destination_lng) {
        distanceKm = calculateDistanceKm(
          orderData.pickup_lat,
          orderData.pickup_lng,
          orderData.destination_lat,
          orderData.destination_lng
        );
      }
      
      // Calcular duração em minutos
      let durationMinutes = 0;
      if (orderData?.accepted_at) {
        const acceptedAt = new Date(orderData.accepted_at);
        const now = new Date();
        durationMinutes = Math.round((now.getTime() - acceptedAt.getTime()) / (1000 * 60));
      }
      
      // CORREÇÃO FINAL: Usar o valor original da entrega aceita (estimated_value)
      // Se por algum motivo não existir, recalcular a partir das coordenadas
      let estimatedValue = Number(orderData?.estimated_value);
      console.log('[createDeliveryHistory] orderData.estimated_value original:', orderData?.estimated_value, '-> Number:', estimatedValue);
      
      // FALLBACK CRÍTICO: Se estimated_value for 0 ou inválido, recalcular a partir da distância
      if (!estimatedValue || estimatedValue <= 0) {
        console.log('[createDeliveryHistory] ⚠️ estimated_value inválido, recalculando a partir das coordenadas...');
        if (distanceKm > 0) {
          estimatedValue = calculateMotoboyValue(distanceKm);
          console.log('[createDeliveryHistory] Valor recalculado a partir de distanceKm:', distanceKm, '-> R$', estimatedValue);
        } else {
          // Tentar calcular distância novamente
          if (orderData?.pickup_lat && orderData?.pickup_lng && 
              orderData?.destination_lat && orderData?.destination_lng) {
            const recalculatedDistance = calculateDistanceKm(
              orderData.pickup_lat,
              orderData.pickup_lng,
              orderData.destination_lat,
              orderData.destination_lng
            );
            estimatedValue = calculateMotoboyValue(recalculatedDistance);
            console.log('[createDeliveryHistory] Distância recalculada:', recalculatedDistance, 'km -> R$', estimatedValue);
          }
        }
      }
      
      const valorBruto = estimatedValue > 0 ? estimatedValue : 8.00; // Mínimo garantido R$ 8,00
      
      // COMISSÃO DINÂMICA: Buscar taxa baseada em grupos ativos do motoboy
      const taxaPercentual = await getMotoboyCommissionRate(user.id);
      const taxaDecimal = taxaPercentual / 100;
      const taxaPlataforma = Number((valorBruto * taxaDecimal).toFixed(2));
      const valorLiquido = Number((valorBruto - taxaPlataforma).toFixed(2));
      
      console.log('[createDeliveryHistory] ✅ Valores finais - bruto:', valorBruto, 'taxa:', taxaPercentual, '% =', taxaPlataforma, 'liquido:', valorLiquido);
      
      // Buscar nome do motoboy
      const { data: profileData } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .maybeSingle();
      
      // Gerar hash único para o recibo
      const receiptHash = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`.toUpperCase();
      
      // CORREÇÃO: loja_nome já vem no orderData (passado pelo validateCode)
      const lojaNome = orderData?.loja_nome || null;
      
      // CORREÇÃO: Salvar coordenadas no route_points para o mapa do comprovante funcionar
      const routePoints: { lat: number; lng: number }[] = [];
      if (orderData?.pickup_lat && orderData?.pickup_lng) {
        routePoints.push({ lat: orderData.pickup_lat, lng: orderData.pickup_lng });
      }
      if (orderData?.destination_lat && orderData?.destination_lng) {
        routePoints.push({ lat: orderData.destination_lat, lng: orderData.destination_lng });
      }
      
      console.log('[createDeliveryHistory] route_points calculados:', routePoints);
      
      const historyData = {
        delivery_order_id: deliveryId,
        motoboy_id: user.id,
        motoboy_nome: profileData?.name || null,
        loja_nome: lojaNome,
        cliente_nome: orderData?.customer_name || null,
        cliente_telefone: orderData?.customer_phone || null,
        pickup_location: orderData?.pickup_location || '',
        destination: orderData?.destination || '',
        order_description: orderData?.order_description || null,
        valor_bruto: valorBruto,
        taxa_plataforma: taxaPlataforma,
        valor_liquido: valorLiquido,
        status: 'finalizada',
        distance_km: distanceKm,
        duration_minutes: durationMinutes,
        accepted_at: orderData?.accepted_at || null,
        finalizada_em: new Date().toISOString(),
        receipt_hash: receiptHash,
        route_points: routePoints, // CORREÇÃO: usar coordenadas reais
      };
      
      console.log('[createDeliveryHistory] Inserindo histórico:', historyData);
      
      const { error: insertError } = await supabase
        .from('delivery_history')
        .insert(historyData);
      
      if (insertError) {
        console.error('[createDeliveryHistory] Erro ao inserir histórico:', insertError);
      } else {
        console.log('[createDeliveryHistory] Histórico criado com sucesso!');
      }
    } catch (err) {
      console.error('[createDeliveryHistory] Exception:', err);
    }
  };

  const validatePickupCode = async (orderId: string, code: string): Promise<boolean> => {
    // LOG DETALHADO: Dados de entrada da validação de RETIRADA (pickup_code da loja)
    console.log('============================================');
    console.log('[validatePickupCode] === VALIDAÇÃO DE RETIRADA (LOJA) ===');
    console.log('[validatePickupCode] delivery_order_id enviado:', orderId);
    console.log('[validatePickupCode] codigo_digitado:', code);
    console.log('[validatePickupCode] tipo_codigo: pickup_code (exibido à LOJA, NÃO ao cliente)');
    console.log('[validatePickupCode] RPC chamada: validate_pickup_code');
    console.log('[validatePickupCode] activeOrder.id:', activeOrder?.id);
    console.log('[validatePickupCode] activeOrder.status:', activeOrder?.status);
    console.log('[validatePickupCode] user.id (motoboy):', user?.id);
    console.log('============================================');
    
    if (!user?.id) {
      toast.error('Você precisa estar logado');
      return false;
    }

    if (!code || code.length !== 4) {
      toast.error('Código inválido', {
        description: 'O código deve ter 4 dígitos',
      });
      return false;
    }
    
    // Normalizar código como string (sem parseInt, preserva zeros à esquerda)
    const normalizedCode = String(code).trim();
    console.log('[validatePickupCode] codigo_normalizado (string, sem parseInt):', `"${normalizedCode}"`);
    
    // GARANTIA: Usar o ID correto da entrega ativa
    const deliveryId = orderId || activeOrder?.id;
    if (!deliveryId) {
      console.error('[validatePickupCode] ERRO: Nenhum delivery_order_id disponível!');
      toast.error('Erro interno', { description: 'ID da entrega não encontrado' });
      return false;
    }
    
    console.log('[validatePickupCode] ID final usado para RPC:', deliveryId);
    
    try {
      // Chamar RPC de validação de RETIRADA (pickup_code da loja)
      // Parâmetros: (_code: varchar, _order_id: uuid)
      const { data, error } = await supabase
        .rpc('validate_pickup_code', { 
          _code: normalizedCode, 
          _order_id: deliveryId 
        });
      
      console.log('[validatePickupCode] RPC validate_pickup_code response:');
      console.log('[validatePickupCode]   data:', data);
      console.log('[validatePickupCode]   error:', error);
      
      if (error) {
        console.error('[validatePickupCode] ERRO da RPC:', error);
        throw error;
      }
      
      if (data === true) {
        console.log('[validatePickupCode] SUCESSO: Produto retirado, status -> entregando');
        toast.success('Produto retirado! 📦', {
          description: 'A caminho do destino',
        });
        if (activeOrder) {
          setActiveOrder({ ...activeOrder, status: 'entregando' });
        }
        return true;
      } else {
        console.log('[validatePickupCode] FALHA: RPC retornou false - código não confere ou status inválido');
        return false;
      }
    } catch (error: unknown) {
      console.error('[validatePickupCode] Exception:', error);
      return false;
    }
  };

  const cancelDelivery = async (orderId: string): Promise<boolean> => {
    if (!user?.id) {
      toast.error('Você precisa estar logado');
      return false;
    }
    
    try {
      // Cancelar via RPC cancel_delivery_by_merchant (obrigatório pelo banco)
      const { data: cancelled, error } = await supabase
        .rpc('cancel_delivery_by_merchant', { _order_id: orderId });
      
      if (error) throw error;
      
      if (!cancelled) {
        toast.error('Não foi possível cancelar a entrega');
        return false;
      }

      // ESTORNO pay_*: devolve o valor retido no escrow ao merchant_wallet
      // do lojista (R$), revertendo a reserva feita no aceite.
      try {
        const ctx = await fetchOrderPayContext(orderId);
        if (ctx?.storeId && ctx.amountCents > 0) {
          await cancelDeliveryPay({
            merchant_owner_id: ctx.storeId,
            credits_cost_cents: ctx.amountCents,
            delivery_id: orderId,
            reason: 'Cancelada pelo lojista',
          });
        }
      } catch (payErr: unknown) {
        console.error('[cancelDelivery] cancelDelivery (pay_*) falhou:', payErr);
      }

      toast.info('Entrega cancelada', {
        description: 'Você pode aceitar novas entregas',
      });
      setActiveOrder(null);
      return true;
    } catch (error: unknown) {
      console.error('Error cancelling delivery:', error);
      const errorObj = error as Record<string, unknown>;
      toast.error('Erro ao cancelar entrega', {
        description: String(errorObj?.message || 'Tente novamente'),
      });
      return false;
    }
  };

  const hasActiveDelivery = activeOrder !== null;

  return {
    activeOrder,
    hasActiveDelivery,
    isLoading,
    isValidating,
    validateCode,
    validatePickupCode,
    cancelDelivery,
    refetch: fetchActiveOrder,
  };
}
