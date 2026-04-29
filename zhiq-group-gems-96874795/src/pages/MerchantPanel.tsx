import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Store, Clock, ShoppingBag, TrendingUp, Settings, Plus, Truck, ImagePlus, Bike, X, Loader2, Package, Trash2, Phone, User, CheckCircle, Volume2, MapPin, AlertCircle, Wallet } from 'lucide-react';
// PanelHeader not used in dark premium layout

import { DeliveryTrackingCard } from '@/components/merchant/DeliveryTrackingCard';
import { MerchantDeliveryHistory } from '@/components/delivery/MerchantDeliveryHistory';
import { MerchantBillingSection } from '@/components/merchant/MerchantBillingSection';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { parseCoordinates, formatCoordinates } from '@/lib/coordinateParser';
import { calculateDeliveryValue } from '@/lib/deliveryPricing';
import { useMerchantWallet } from '@/hooks/useMerchantWallet';

interface MerchantProduct {
  id: string;
  nome: string;
  preco: number;
  descricao: string | null;
  imagem_url: string | null;
}

interface ActiveDelivery {
  id: string;
  status: string;
  destination: string;
  customer_name: string;
  created_at: string;
  delivery_code: string;
  pickup_code: string | null;
  pickup_location: string | null;
  order_description: string | null;
  motoboy_name: string | null;
  motoboy_phone: string | null;
  motoboy_vehicle: string | null;
  motoboy_avatar: string | null;
  motivo_cancelamento: string | null;
}

export default function MerchantPanel() {
  const { displayName, user } = useAuth();
  const navigate = useNavigate();
  const { overview: walletOverview, loadWallet } = useMerchantWallet();
  const balance = walletOverview?.balanceReais ?? null;
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showCallDelivery, setShowCallDelivery] = useState(false);
  const [productImage, setProductImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [products, setProducts] = useState<MerchantProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  
  // Form fields for product
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productDesc, setProductDesc] = useState('');
  
  // Form fields for delivery
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<MerchantProduct | null>(null);
  const [isCreatingDelivery, setIsCreatingDelivery] = useState(false);
  const [showSlowMessage, setShowSlowMessage] = useState(false);
  const slowMessageTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Estado para parsing de coordenadas
  const parsedCoordinates = useMemo(() => {
    if (!deliveryAddress.trim()) return null;
    return parseCoordinates(deliveryAddress);
  }, [deliveryAddress]);
  
  // Active deliveries state
  const [activeDeliveries, setActiveDeliveries] = useState<ActiveDelivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(true);
  
  // Estado para controlar música de busca - REMOVIDO: Não usar música
  const [isSearchingDelivery, setIsSearchingDelivery] = useState(false);
  
  const imageInputRef = useRef<HTMLInputElement>(null);

  // CORREÇÃO: Remover uso de useBackgroundMusic para comerciante
  // Comerciante não precisa de som de busca

  // Atualizar estado de busca baseado nas entregas pendentes
  useEffect(() => {
    const hasPendingDelivery = activeDeliveries.some(d => d.status === 'pending');
    setIsSearchingDelivery(hasPendingDelivery);
  }, [activeDeliveries]);

  // Fetch active deliveries (todos os status ativos)
  const fetchActiveDeliveries = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data: orders, error } = await supabase
        .from('service_orders')
        .select('id, status, destination, customer_name, customer_phone, created_at, motoboy_id, pickup_location, total_price, delivery_code, pickup_code, order_description, motivo_cancelamento')
        .eq('merchant_id', user.id)
        .eq('service_type', 'delivery')
        .in('status', [
          'calculating', 'searching', 'awaiting_professional', 'pending',
          'accepted', 'a_caminho', 'in_progress', 'buscando', 'entregando',
          'cancelada_por_sistema', 'cancelada_por_lojista', 'cancelled'
        ])
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const deliveriesWithMotoboy: ActiveDelivery[] = await Promise.all(
        (orders || []).map(async (order) => {
          let motoboyName: string | null = null;
          let motoboyPhone: string | null = null;
          let motoboyVehicle: string | null = null;
          let motoboyAvatar: string | null = null;

          const acceptedStatuses = ['accepted', 'a_caminho', 'in_progress', 'buscando', 'entregando'];
          if (acceptedStatuses.includes(order.status) && order.motoboy_id) {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('name, avatar_url')
              .eq('id', order.motoboy_id)
              .single();

            if (profileData) {
              motoboyName = profileData.name;
              motoboyAvatar = profileData.avatar_url;
            }

            const { data: motoboyProfile } = await supabase
              .from('motoboy_profiles')
              .select('veiculo_modelo, veiculo_cor, whatsapp')
              .eq('user_id', order.motoboy_id)
              .single();

            if (motoboyProfile) {
              motoboyVehicle = motoboyProfile.veiculo_modelo ?
                `${motoboyProfile.veiculo_modelo} ${motoboyProfile.veiculo_cor || ''}`.trim() : null;
              motoboyPhone = motoboyProfile.whatsapp;
            }
          }

          return {
            id: order.id,
            status: order.status,
            destination: order.destination,
            customer_name: order.customer_name || 'Cliente',
            created_at: order.created_at || new Date().toISOString(),
            delivery_code: order.delivery_code || order.id.slice(-4).toUpperCase(),
            pickup_code: order.pickup_code || null,
            pickup_location: order.pickup_location,
            order_description: order.order_description || null,
            motoboy_name: motoboyName,
            motoboy_phone: motoboyPhone,
            motoboy_vehicle: motoboyVehicle,
            motoboy_avatar: motoboyAvatar,
            motivo_cancelamento: order.motivo_cancelamento || null,
          };
        })
      );

      setActiveDeliveries(deliveriesWithMotoboy);
    } catch (error) {
      console.error('Erro ao buscar entregas:', error);
    } finally {
      setLoadingDeliveries(false);
    }
  }, [user?.id]);

  // Fetch products on mount
  const fetchProducts = async () => {
    if (!user?.id) return;
    setLoadingProducts(true);
    const { data, error } = await supabase
      .from('merchant_products')
      .select('id, nome, preco, descricao, imagem_url')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setProducts(data as MerchantProduct[]);
    }
    setLoadingProducts(false);
  };

  useEffect(() => {
    fetchProducts();
    fetchActiveDeliveries();
  }, [user?.id, fetchActiveDeliveries]);

  // Realtime subscription for delivery updates
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('merchant-deliveries')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_orders',
          filter: `merchant_id=eq.${user.id}`,
        },
        () => {
          fetchActiveDeliveries();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_orders',
          filter: `merchant_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as any;

          if (updated.status === 'a_caminho' || updated.status === 'accepted') {
            toast.success('Motoboy a caminho!', {
              description: 'Um motoboy aceitou seu pedido e está indo até sua loja.',
              duration: 5000,
            });
          }

          fetchActiveDeliveries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchActiveDeliveries]);


  // Excluir produto
  const handleDeleteProduct = async (productId: string) => {
    const { error } = await supabase
      .from('merchant_products')
      .delete()
      .eq('id', productId);
    
    if (error) {
      toast.error('Erro ao excluir produto');
      return;
    }
    
    setProducts(prev => prev.filter(p => p.id !== productId));
    toast.success('Produto excluído!');
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProductImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearProductImage = () => {
    setProductImage(null);
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const firstName = displayName?.split(' ')[0] || 'Comerciante';

  const handleAddProduct = async () => {
    if (!user?.id) {
      toast.error('Você precisa estar logado');
      return;
    }
    if (!productName.trim()) {
      toast.error('Informe o nome do produto');
      return;
    }
    if (!productPrice || parseFloat(productPrice) <= 0) {
      toast.error('Informe um preço válido');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('merchant_products')
        .insert({
          user_id: user.id,
          nome: productName.trim(),
          preco: parseFloat(productPrice),
          descricao: productDesc.trim() || null,
          imagem_url: productImage || null,
        });

      if (error) throw error;

      toast.success('Produto cadastrado com sucesso!');
      setShowAddProduct(false);
      setProductImage(null);
      setProductName('');
      setProductPrice('');
      setProductDesc('');
      fetchProducts(); // Atualiza lista
    } catch (error: any) {
      console.error('Erro ao cadastrar produto:', error);
      toast.error('Erro ao cadastrar produto');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Função para disparar geocoding em background (não bloqueia)
  const triggerBackgroundGeocoding = (deliveryId: string, pickupAddress: string, destinationAddress: string) => {
    supabase.functions.invoke('process-delivery-geocoding', {
      body: {
        delivery_id: deliveryId,
        pickup_address: pickupAddress,
        destination_address: destinationAddress,
      }
    }).then((result) => {
      console.log('[MerchantPanel] Geocoding background concluído:', result);
    }).catch((err) => {
      console.warn('[MerchantPanel] Geocoding background falhou (não crítico):', err);
    });
  };

  // Criar pedido de entrega REAL - CORREÇÃO: Incluir dados completos da loja com coordenadas
  const handleCallDelivery = async () => {
    if (!user?.id) {
      toast.error('Usuário não autenticado');
      return;
    }

    if (!selectedProduct) {
      toast.error('Selecione um produto para entrega');
      return;
    }

    if (!deliveryAddress.trim()) {
      toast.error('Informe o endereço de entrega');
      return;
    }

    // CRÍTICO: Validar coordenadas antes de prosseguir
    if (!parsedCoordinates?.success || !parsedCoordinates.coordinates) {
      toast.error('Localização inválida', {
        description: 'Não foi possível identificar as coordenadas. Cole a localização do WhatsApp ou Google Earth.',
      });
      return;
    }

    if (!customerName.trim()) {
      toast.error('Informe o nome do cliente');
      return;
    }

    // CRÍTICO: Verificar saldo do lojista antes de prosseguir
    // Primeiro precisamos calcular o valor estimado da entrega
    // Para isso, precisamos buscar as coordenadas da loja primeiro
    setIsCreatingDelivery(true);
    setShowSlowMessage(false);
    
    // Mostrar mensagem amigável após 3 segundos
    slowMessageTimerRef.current = setTimeout(() => {
      setShowSlowMessage(true);
    }, 3000);

    try {
      // OTIMIZADO: Buscar dados da loja COM COORDENADAS
      const { data: storeData, error: storeError } = await supabase
        .from('merchant_stores')
        .select('nome_loja, rua, numero, bairro, cidade, estado, cep, latitude, longitude, endereco_formatado')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (storeError) {
        console.warn('[MerchantPanel] Erro ao buscar loja:', storeError);
      }

      // CRÍTICO: Verificar se a loja tem localização definida
      if (!storeData?.latitude || !storeData?.longitude) {
        toast.error('Configure a localização da sua loja primeiro!', {
          description: 'Vá em Configurações e defina a localização no mapa.',
          duration: 5000,
        });
        navigate('/merchant/settings');
        return;
      }

      // Montar endereço completo da loja
      let pickupLocation = 'Loja do comerciante';
      let storeFullAddress = '';
      if (storeData) {
        const parts = [
          storeData.rua,
          storeData.numero ? `nº ${storeData.numero}` : null,
          storeData.bairro,
          storeData.cidade,
          storeData.estado,
        ].filter(Boolean);
        storeFullAddress = parts.join(', ') || storeData.endereco_formatado || 'Endereço não informado';
        pickupLocation = storeData.nome_loja + ' - ' + storeFullAddress;
      }

      // SIMPLIFICADO: Sempre usar motoboy - sem opção de carro
      const serviceType = 'motoboy';
      const vehicleType = 'moto';

      // OTIMIZADO: Gerar códigos em paralelo
      const [codeResult, pickupCodeResult] = await Promise.all([
        supabase.rpc('generate_delivery_code'),
        supabase.rpc('generate_pickup_code'),
      ]);
      
      if (codeResult.error || !codeResult.data) {
        console.error('Erro ao gerar código:', codeResult.error);
        toast.error('Erro ao gerar código de entrega');
        return;
      }
      
      if (pickupCodeResult.error || !pickupCodeResult.data) {
        console.error('Erro ao gerar código de retirada:', pickupCodeResult.error);
        toast.error('Erro ao gerar código de retirada');
        return;
      }
      
      const deliveryCode = codeResult.data as string;
      const pickupCode = pickupCodeResult.data as string;

      // NOVO: Usar Directions API para obter distância real via rota
      const clientCoords = parsedCoordinates!.coordinates!;
      
      console.log('[MerchantPanel] Calculando rota real via Directions API...');
      console.log('[MerchantPanel] Origem (loja):', storeData.latitude, storeData.longitude);
      console.log('[MerchantPanel] Destino (cliente):', clientCoords.latitude, clientCoords.longitude);
      
      // Chamar edge function get-route para obter distância real em metros
      const { data: routeData, error: routeError } = await supabase.functions.invoke('get-route', {
        body: {
          origin: { lat: storeData.latitude, lng: storeData.longitude },
          destination: { lat: clientCoords.latitude, lng: clientCoords.longitude },
        }
      });
      
      if (routeError || !routeData) {
        console.error('[MerchantPanel] Erro ao calcular rota:', routeError);
        toast.error('Erro ao calcular rota', {
          description: 'Não foi possível calcular a distância. Tente novamente.',
        });
        return;
      }
      
      // CRÍTICO: Converter metros para km (API retorna em metros)
      const distanceKm = Math.round((routeData.distance / 1000) * 100) / 100;
      
      // Calcular valor oficial: 9 + (distancia_km × 1.60)
      const valorTotal = calculateDeliveryValue(distanceKm);
      
      console.log('[MerchantPanel] Distância real (Directions API):', distanceKm, 'km');
      console.log('[MerchantPanel] Valor total calculado: R$', valorTotal.toFixed(2));
      console.log('[MerchantPanel] Fórmula aplicada: 9 + (', distanceKm, '× 1.60) =', valorTotal);
      
      // CRÍTICO: Verificar saldo do lojista ANTES de criar a entrega
      const currentBalance = walletOverview?.balanceReais ?? 0;
      if (currentBalance < valorTotal) {
        toast.error('Saldo insuficiente', {
          description: `Valor da entrega: R$ ${valorTotal.toFixed(2).replace('.', ',')}. Saldo atual: R$ ${currentBalance.toFixed(2).replace('.', ',')}`,
          duration: 5000,
        });
        navigate('/merchant/billing');
        return;
      }

      // CRIAR CORRIDA na tabela corridas (schema real)
      const { data: newOrder, error: insertError } = await supabase
        .from('corridas')
        .insert({
          service_type: 'delivery',
          passenger_id: user.id,
          origem: pickupLocation,
          destino: deliveryAddress.trim(),
          distancia_km: distanceKm || null,
          valor: valorTotal,
          status: 'pending',
          payment_status: 'paid',
          provider_id: null,
        })
        .select()
        .single();

      if (insertError || !newOrder) {
        console.error('[MerchantPanel] CREATE_CORRIDA_ERROR:', insertError);
        toast.error('Erro ao criar entrega');
        return;
      }

      // Atualizar saldo exibido
      loadWallet();

      console.log('[MerchantPanel] ✅ Entrega criada:', newOrder.id);

      toast.success('Procurando entregador disponível...', {
        description: 'Você será notificado quando alguém aceitar',
        duration: 5000,
      });

      // Limpar form e fechar modal
      setShowCallDelivery(false);
      setDeliveryAddress('');
      setCustomerName('');
      setCustomerPhone('');
      setDeliveryNotes('');
      setSelectedProduct(null);
      
      // Atualizar lista de entregas ativas
      fetchActiveDeliveries();
    } catch (error: any) {
      console.error('Erro ao criar pedido:', error);
      console.error('Detalhes do erro:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      });
      
      // Mostrar erro real ao usuário
      const errorMessage = error?.message || 'Erro desconhecido';
      const errorCode = error?.code ? ` (${error.code})` : '';
      const errorHint = error?.hint ? `\n${error.hint}` : '';
      
      toast.error('Falha ao criar entrega', {
        description: `${errorMessage}${errorCode}${errorHint}`,
        duration: 8000,
      });
    } finally {
      // Limpar timer e estados
      if (slowMessageTimerRef.current) {
        clearTimeout(slowMessageTimerRef.current);
        slowMessageTimerRef.current = null;
      }
      setShowSlowMessage(false);
      setIsCreatingDelivery(false);
    }
  };

  // Abrir modal de entrega com produto pré-selecionado
  const handleOpenDeliveryModal = (product: MerchantProduct) => {
    setSelectedProduct(product);
    setShowCallDelivery(true);
  };

  return (
    <div className="min-h-screen bg-[#14171B] flex flex-col">

      {/* ── Conteúdo principal ── */}
      <main className="flex-1 p-6 lg:p-8 space-y-8 max-w-5xl mx-auto w-full">

        {/* Cabeçalho da seção */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-[#F5F7FA] tracking-tight flex items-center gap-3">
              <Store className="w-7 h-7 text-[#FF6A00]" />
              PAINEL DO LOJISTA
            </h1>
            <p className="text-[#A7B0BE] text-sm font-medium">Gerencie seus produtos, entregas e financeiro.</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Saldo */}
            <div className="flex items-center gap-2 bg-[#1B1F24] border border-[#2A3038] rounded-2xl px-4 py-2">
              <Wallet className="w-4 h-4 text-[#FF6A00]" />
              <span className="text-xs font-black text-[#A7B0BE] uppercase tracking-widest">Saldo</span>
              <span className="text-sm font-black text-[#F5F7FA]">
                R$ {balance !== null ? balance.toFixed(2).replace('.', ',') : '...'}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/merchant/settings')}
              className="h-10 w-10 rounded-xl bg-[#1B1F24] border border-[#2A3038] text-[#A7B0BE] hover:text-[#FF6A00] hover:bg-[#2A3038]"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* CTAs Principais */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setShowAddProduct(true)}
            className="flex items-center gap-4 p-5 bg-[#1B1F24] border border-[#2A3038] rounded-[24px] hover:border-[#FF6A00]/40 hover:bg-[#1B1F24] transition-all group text-left"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#FF6A00]/10 flex items-center justify-center text-[#FF6A00] group-hover:bg-[#FF6A00]/20 transition-colors shrink-0">
              <Plus className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-[#F5F7FA] text-sm uppercase tracking-tight">Adicionar Produto</h3>
              <p className="text-[10px] text-[#A7B0BE] font-medium mt-0.5">Cadastre novos itens</p>
            </div>
          </button>

          <button
            onClick={() => navigate('/merchant/create-delivery')}
            className="flex items-center gap-4 p-5 bg-[#FF6A00] rounded-[24px] hover:bg-[#FF7A1A] transition-all group text-left shadow-lg shadow-[#FF6A00]/20"
          >
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white shrink-0">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-white text-sm uppercase tracking-tight">Chamar Entrega</h3>
              <p className="text-[10px] text-white/70 font-medium mt-0.5">Solicitar motoboy</p>
            </div>
          </button>
        </div>

        {/* Entregas Ativas */}
        {activeDeliveries.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xs font-black text-[#A7B0BE] uppercase tracking-[0.15em] flex items-center gap-2">
              <Truck className="h-4 w-4 text-[#FF6A00]" />
              Acompanhamento de Entregas
              <span className="ml-auto bg-[#FF6A00] text-white text-[9px] font-black px-2 py-0.5 rounded-full">
                {activeDeliveries.length} ativa(s)
              </span>
            </h2>
            <div className="space-y-3">
              {activeDeliveries.map((delivery) => (
                <DeliveryTrackingCard
                  key={delivery.id}
                  delivery={delivery}
                  onCancelled={fetchActiveDeliveries}
                />
              ))}
            </div>
          </div>
        )}

        {/* Configurações */}
        <button
          onClick={() => navigate('/merchant/settings')}
          className="w-full flex items-center gap-4 p-5 bg-[#1B1F24] border border-[#2A3038] rounded-[24px] hover:border-[#FF6A00]/40 transition-all group text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-[#2A3038] flex items-center justify-center text-[#A7B0BE] group-hover:text-[#FF6A00] transition-colors shrink-0">
            <Settings className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-[#F5F7FA] text-sm uppercase tracking-tight">Configurações da Loja</h3>
            <p className="text-[10px] text-[#A7B0BE] font-medium mt-0.5">Cadastre ou edite os dados</p>
          </div>
        </button>

        {/* Meus Produtos */}
        <div className="space-y-4">
          <h2 className="text-xs font-black text-[#A7B0BE] uppercase tracking-[0.15em] flex items-center gap-2">
            <Package className="h-4 w-4 text-[#FF6A00]" />
            Meus Produtos
          </h2>

          {loadingProducts ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#FF6A00]" />
            </div>
          ) : products.length === 0 ? (
            <div className="bg-[#1B1F24] border border-dashed border-[#2A3038] rounded-[24px] p-12 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-[#FF6A00]/10 flex items-center justify-center text-[#FF6A00]">
                <ShoppingBag className="h-8 w-8" />
              </div>
              <div>
                <h3 className="font-black text-[#F5F7FA] text-sm uppercase">Nenhum produto cadastrado</h3>
                <p className="text-[#A7B0BE] text-xs mt-1">Comece adicionando seu primeiro item</p>
              </div>
              <Button
                onClick={() => setShowAddProduct(true)}
                className="bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase text-xs tracking-widest h-10 px-6 rounded-xl shadow-lg shadow-[#FF6A00]/20 gap-2"
              >
                <Plus className="h-4 w-4" /> Adicionar primeiro produto
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {products.map((product) => (
                <div key={product.id} className="flex items-center gap-4 p-4 bg-[#1B1F24] border border-[#2A3038] rounded-[20px] hover:border-[#FF6A00]/30 transition-all group">
                  {/* Imagem */}
                  {product.imagem_url ? (
                    <img
                      src={product.imagem_url}
                      alt={product.nome}
                      className="h-16 w-16 rounded-2xl object-cover border border-[#2A3038] shrink-0"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-2xl bg-[#14171B] border border-[#2A3038] flex items-center justify-center shrink-0">
                      <Package className="h-6 w-6 text-[#2A3038]" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-black text-[#F5F7FA] text-sm truncate">{product.nome}</h3>
                        <p className="text-[#FF6A00] font-black text-sm mt-0.5">
                          R$ {product.preco.toFixed(2).replace('.', ',')}
                        </p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-[#EF4444]/60 hover:text-[#EF4444] hover:bg-[#EF4444]/10 rounded-xl shrink-0">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-[#1B1F24] border-[#2A3038]">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-[#F5F7FA]">Excluir produto?</AlertDialogTitle>
                            <AlertDialogDescription className="text-[#A7B0BE]">
                              Tem certeza que deseja excluir "{product.nome}"? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="bg-[#14171B] border-[#2A3038] text-[#A7B0BE] hover:bg-[#2A3038]">Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteProduct(product.id)} className="bg-[#EF4444] hover:bg-[#EF4444]/80 text-white">
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <span className="inline-flex items-center gap-1 text-[9px] font-black text-[#FF6A00] bg-[#FF6A00]/10 border border-[#FF6A00]/20 px-2 py-0.5 rounded-full uppercase">
                        <Bike className="h-3 w-3" /> Motoboy
                      </span>
                      <Button
                        size="sm"
                        className="h-6 text-[9px] font-black uppercase tracking-widest bg-[#FF6A00]/10 text-[#FF6A00] hover:bg-[#FF6A00] hover:text-white border border-[#FF6A00]/20 rounded-full px-3 transition-all"
                        onClick={() => navigate(`/merchant/create-delivery?product_id=${product.id}&merchant_id=${user?.id}`)}
                      >
                        <Truck className="h-3 w-3 mr-1" /> Chamar Entrega
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Histórico de Entregas */}
        <div className="space-y-4">
          <h2 className="text-xs font-black text-[#A7B0BE] uppercase tracking-[0.15em] flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#FF6A00]" />
            Histórico de Entregas
          </h2>
          <div className="bg-[#1B1F24] border border-[#2A3038] rounded-[24px] overflow-hidden">
            <MerchantDeliveryHistory />
          </div>
        </div>

        {/* Financeiro */}
        <div className="space-y-4">
          <h2 className="text-xs font-black text-[#A7B0BE] uppercase tracking-[0.15em] flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#FF6A00]" />
            Financeiro
          </h2>
          <div className="bg-[#1B1F24] border border-[#2A3038] rounded-[24px] overflow-hidden">
            <MerchantBillingSection />
          </div>
        </div>

      </main>

      {/* Add Product Dialog */}
      <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Produto</DialogTitle>
            <DialogDescription>Cadastre um novo produto no seu catálogo</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Image Upload */}
            <div className="space-y-2">
              <Label>Imagem do Produto (opcional)</Label>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              {productImage ? (
                <div className="relative w-full h-32 rounded-lg overflow-hidden border border-border">
                  <img 
                    src={productImage} 
                    alt="Preview do produto" 
                    className="w-full h-full object-cover"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7"
                    onClick={clearProductImage}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="w-full h-24 border-2 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-muted/30 transition-colors"
                >
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Clique para adicionar imagem</span>
                </button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-name">Nome do Produto *</Label>
              <Input 
                id="product-name" 
                placeholder="Ex: Hambúrguer Artesanal" 
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-price">Preço (R$) *</Label>
              <Input 
                id="product-price" 
                type="number" 
                step="0.01"
                placeholder="0,00" 
                value={productPrice}
                onChange={(e) => setProductPrice(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-desc">Descrição</Label>
              <Textarea 
                id="product-desc" 
                placeholder="Descreva o produto..." 
                rows={3}
                value={productDesc}
                onChange={(e) => setProductDesc(e.target.value)}
              />
            </div>
            <Button onClick={handleAddProduct} className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Cadastrar Produto'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCallDelivery} onOpenChange={(open) => {
        setShowCallDelivery(open);
        if (!open) setSelectedProduct(null);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chamar Entrega</DialogTitle>
            <DialogDescription>
              {selectedProduct ? (
                <>Solicitar entrega para: <strong>{selectedProduct.nome}</strong> - R$ {selectedProduct.preco.toFixed(2).replace('.', ',')}</>
              ) : (
                'Solicite um entregador para sua entrega'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="delivery-address">Localização do Cliente (WhatsApp / Google Earth) *</Label>
              <Input 
                id="delivery-address" 
                placeholder="Cole a localização: -10.1754470, -59.4480456" 
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                className={deliveryAddress.trim() ? (parsedCoordinates?.success ? 'border-green-500 focus-visible:ring-green-500' : 'border-destructive focus-visible:ring-destructive') : ''}
              />
              {/* Feedback visual de validação */}
              {deliveryAddress.trim() && (
                parsedCoordinates?.success ? (
                  <div className="flex items-center gap-2 text-xs text-green-600">
                    <CheckCircle className="h-3.5 w-3.5" />
                    <span>Localização reconhecida: {formatCoordinates(parsedCoordinates.coordinates!.latitude, parsedCoordinates.coordinates!.longitude)}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{parsedCoordinates?.error || 'Localização inválida'}</span>
                  </div>
                )
              )}
              {!deliveryAddress.trim() && (
                <p className="text-xs text-muted-foreground">
                  Copie a localização do WhatsApp ou Google Earth/Maps
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery-customer">Nome do Cliente *</Label>
              <Input 
                id="delivery-customer" 
                placeholder="Nome de quem vai receber"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery-phone">Telefone do Cliente (opcional)</Label>
              <Input 
                id="delivery-phone" 
                placeholder="(00) 00000-0000"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery-notes">Observações</Label>
              <Textarea 
                id="delivery-notes" 
                placeholder="Instruções adicionais..." 
                rows={2}
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
              />
            </div>
            
            {/* Mensagem amigável após 3 segundos */}
            {isCreatingDelivery && showSlowMessage && (
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground animate-fade-in">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Estamos processando seu pedido, aguarde...</span>
              </div>
            )}
            
            <Button 
              onClick={handleCallDelivery} 
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground transition-all"
              disabled={isCreatingDelivery || !parsedCoordinates?.success || !customerName.trim()}
            >
              {isCreatingDelivery ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{showSlowMessage ? 'Processando...' : 'Criando pedido...'}</span>
                </div>
              ) : (
                <>
                  <Truck className="h-4 w-4 mr-2" />
                  Solicitar Entrega
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
