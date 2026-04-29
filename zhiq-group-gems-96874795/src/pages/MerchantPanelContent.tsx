import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Store, Clock, ShoppingBag, TrendingUp, Settings, Plus, Truck, ImagePlus, Bike, X, Loader2, Package, Trash2, Phone, User, CheckCircle, Volume2, MapPin, AlertCircle, Wallet, Info, Tag, Coins, ArrowRight } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

import { DeliveryTrackingCard } from '@/components/merchant/DeliveryTrackingCard';
import { MerchantDeliveryHistory } from '@/components/delivery/MerchantDeliveryHistory';
import { MerchantBillingSection } from '@/components/merchant/MerchantBillingSection';
import { MerchantDispatchPanel } from '@/components/merchant/MerchantDispatchPanel';
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
import MerchantCreditWallet from '@/components/merchant/MerchantCreditWallet';
import MerchantDiscountPanel from '@/components/merchant/MerchantDiscountPanel';

interface MerchantProduct {
  id: string;
  nome: string;
  preco: number;
  descricao: string | null;
  imagem_url: string | null;
  delivery_code: string | null;
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

/**
 * MerchantPanelContent - Conteúdo interno do painel do comerciante
 * Este componente é usado dentro do MerchantLayout via Outlet
 */
export default function MerchantPanelContent() {
  const { displayName, user } = useAuth();
  const navigate = useNavigate();
  const { overview, loadWallet } = useMerchantWallet();
  const balance = overview.balanceCents;
  
  console.log("DEBUG_DASHBOARD: overview", overview);
  console.log("DEBUG_DASHBOARD: balance (cents)", balance);
  const [storeInfo, setStoreInfo] = useState<{ nome: string; categoria: string; rua: string; numero: string; bairro: string; cidade: string; estado: string; status: string; latitude: number | null; longitude: number | null; region_id: string | null; city_id: string | null; } | null>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showCallDelivery, setShowCallDelivery] = useState(false);
  const [productImage, setProductImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [products, setProducts] = useState<MerchantProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Form fields for product
  const [productName, setProductName] = useState('');
  const [productInternalCode, setProductInternalCode] = useState('');
  const [productPrice, setProductPrice] = useState('9.00');
  const [productDesc, setProductDesc] = useState('');

  // Status Modal State
  const [statusModal, setStatusModal] = useState<{
    isOpen: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
    details?: string;
  }>({
    isOpen: false,
    type: 'success',
    title: '',
    message: '',
  });

  // Form fields for delivery
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<MerchantProduct | null>(null);
  const [editingProduct, setEditingProduct] = useState<MerchantProduct | null>(null);
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

  useEffect(() => {
    const hasActiveSearching = activeDeliveries.some(d => 
      ['pending', 'awaiting_professional', 'calculating', 'aguardando'].includes(d.status)
    );
    setIsSearchingDelivery(hasActiveSearching);
  }, [activeDeliveries]);

  // Fetch active deliveries (pending or in_progress)
  const fetchActiveDeliveries = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data: orders, error } = await supabase
        .from('service_orders')
        .select('id, status, destination, customer_id, created_at, motoboy_id, pickup_location, total_price')
        .eq('merchant_id', user.id)
        .eq('service_type', 'delivery')
        .in('status', ['searching', 'calculating', 'pending', 'awaiting_professional', 'assigned', 'aguardando', 'accepted', 'started', 'in_progress', 'a_caminho'])
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const deliveriesWithMotoboy: ActiveDelivery[] = await Promise.all(
        (orders || []).map(async (order) => {
          let motoboyName: string | null = null;
          let motoboyPhone: string | null = null;
          let motoboyVehicle: string | null = null;
          let motoboyAvatar: string | null = null;

          if (order.status !== 'aguardando' && order.motoboy_id) {
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
            customer_name: order.customer_id || 'Cliente',
            created_at: order.created_at || new Date().toISOString(),
            delivery_code: order.id.slice(-4).toUpperCase(),
            pickup_code: order.id.slice(-8, -4).toUpperCase(),
            pickup_location: order.pickup_location,
            order_description: null,
            motoboy_name: motoboyName,
            motoboy_phone: motoboyPhone,
            motoboy_vehicle: motoboyVehicle,
            motoboy_avatar: motoboyAvatar,
            motivo_cancelamento: null,
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
    try {
      setLoadingProducts(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        console.error("Usuário não autenticado.");
        setLoadingProducts(false);
        return;
      }

      const { data: store, error: storeError } = await supabase
        .from('merchant_stores')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (storeError || !store) {
        console.error("Erro ao buscar loja:", storeError);
        setLoadingProducts(false);
        return;
      }

      const { data: products, error } = await supabase
        .from('products')
        .select('id, name, price, image_url, delivery_code')
        .eq('store_id', store.id)
        .order('created_at', { ascending: false });

      console.log("Store ID usado:", store.id);
      console.log("Produtos retornados:", products);

      if (error) {
        console.error("Erro ao buscar produtos:", error);
      } else {
        // Mapeando dados para o MerchantProduct, pois interface espera { name/nome, etc. }
        // Caso seu select('*') retorne tudo inglês, converta pro formato da interface ou ajuste a interface futuramente.
        // Aqui mapearemos as cols pro formato MerchantProduct p/ não quebrar a UI
        const mappedProducts = (products || []).map((p: any) => ({
          id: p.id,
          nome: p.name || p.nome,
          preco: p.price || p.preco,
          descricao: p.description || p.descricao,
          imagem_url: p.image_url || p.imagem_url,
          internal_code: p.internal_code,
          delivery_code: p.delivery_code || null
        }));
        setProducts(mappedProducts);
      }
    } catch (err) {
      console.error("Erro ao buscar produtos (catch block):", err);
    } finally {
      setLoadingProducts(false);
    }
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
          event: 'UPDATE',
          schema: 'public',
          table: 'service_orders',
          filter: `merchant_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as any;

          if (updated.status === 'a_caminho' || updated.status === 'in_progress') {
            toast.success('Entrega aceita! 🎉', {
              description: 'Um motoboy aceitou seu pedido e está a caminho!',
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
      .from('products')
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

  const handleEditProduct = (product: MerchantProduct) => {
    setEditingProduct(product);
    setProductName(product.nome);
    setProductPrice(product.preco.toString());
    setProductDesc(product.descricao || '');
    setProductInternalCode(product.delivery_code || ''); // Assuming delivery_code is used for internal code or similar
    setProductImage(product.imagem_url);
    setShowAddProduct(true);
  };

  const handleAddProduct = async () => {
    console.log("🚀 Iniciando cadastro de produto");

    if (!user?.id) {
      toast.error('Você precisa estar logado');
      return;
    }

    console.log("👤 User:", user);

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
      // 1. Fetch genuine user directly from Auth
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !authUser) {
        throw new Error("Sessão expirada ou usuário não autenticado. Faça login novamente.");
      }

      console.log("🔍 Buscando store do usuário (Backend Auth UID)...", authUser.id);

      // 2. Fetch store id strictly driven by the auth uid
      const { data: store, error: storeError } = await supabase
        .from("merchant_stores") // 🔥 Corrigido: usando a tabela unificada
        .select("id")
        .eq("user_id", authUser.id) // 🔥 Corrigido: usando a coluna de vínculo correta
        .single();

      if (storeError || !store) {
        console.error("DIAGNOSTICO: Loja nao encontrada", { 
          authUser_id: authUser.id, 
          storeError 
        });
        throw new Error("Loja não encontrada para este usuário. Por favor, certifique-se de que sua loja foi configurada.");
      }

      console.log("🏪 Store encontrada no DB (segura):", store.id);

      // Logs extras para garantir separação
      console.log("User ID:", authUser.id);
      console.log("Store ID:", store.id);

      const payload = {
        store_id: store.id,
        name: productName.trim(),
        price: parseFloat(productPrice),
        description: productDesc.trim() || null,
        internal_code: productInternalCode.trim() || null,
        image_url: productImage || null,
      };

      console.log("📦 Dados que serão enviados ao banco:", payload);

      // User store ownership check logs
      const { data: isOwner } = await supabase.rpc('is_owner_of_store', { p_store_id: store.id });
      console.log(`RLS_CHECK { userId: '${authUser.id}', storeId: '${store.id}', isOwner: ${isOwner} }`);

      const { data, error } = editingProduct 
        ? await supabase
            .from('products')
            .update(payload)
            .eq('id', editingProduct.id)
            .select()
            .single()
        : await supabase
            .from('products')
            .insert(payload)
            .select()
            .single();

      if (error) {
        console.error("DIAGNOSTICO: Erro bruto no insert de produtos", {
          error,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          payload_sent: payload,
          authUser_id: authUser.id
        });
        setStatusModal({
          isOpen: true,
          type: 'error',
          title: 'Erro ao cadastrar produto',
          message: error.message || 'Ocorreu um erro desconhecido ao tentar salvar no banco de dados.',
          details: `Code: ${error.code || 'N/A'}\nDetails: ${error.details || 'N/A'}\nHint: ${error.hint || 'N/A'}`,
        });
        return;
      }

      console.log("✅ Produto cadastrado com sucesso", data);

      setShowAddProduct(false);
      setEditingProduct(null);
      setProductImage(null);
      setProductInternalCode('');
      setProductName('');
      setProductPrice('9.00');
      setProductDesc('');
      
      // Se houver roteamento para entrega, redirecionar com o nome do recebedor
      if (data && data.id) {
        navigate(`/merchant/create-delivery?product_id=${data.id}&customer_name=${encodeURIComponent(payload.name)}`);
      } else {
        setStatusModal({
          isOpen: true,
          type: 'success',
          title: 'Produto cadastrado!',
          message: 'Seu produto entrou automaticamente na fila de divulgação local.',
        });
        await fetchProducts();
      }
    } catch (err: any) {
      console.error("🔥 Catch Error:", err);
      setStatusModal({
        isOpen: true,
        type: 'error',
        title: 'Erro inesperado',
        message: err?.message || 'Ocorreu um erro inesperado durante o cadastro.',
        details: JSON.stringify(err, null, 2),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyError = () => {
    const errorText = `[ERRO] ${statusModal.title}\nMessage: ${statusModal.message}\n${statusModal.details ? `Details:\n${statusModal.details}` : ''}`;
    navigator.clipboard.writeText(errorText).then(() => {
      toast.success('Erro copiado para a área de transferência');
    }).catch(() => {
      toast.error('Falha ao copiar erro');
    });
  };

  return (
    <div className="p-4 space-y-5 lg:space-y-6 lg:py-8 lg:px-4 xl:px-6 w-full">
      {/* ======= Welcome Hero Card ======= */}
      <Card className="border-merchant/20 bg-gradient-to-br from-merchant-light to-background shadow-md overflow-hidden">
        <CardContent className="p-5 lg:p-8">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <h1 className="text-lg lg:text-2xl font-bold text-foreground truncate">
                Olá, {firstName} 👋
              </h1>
              <p className="text-sm lg:text-base text-muted-foreground">
                Gerencie seus produtos e acompanhe entregas
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() => navigate('/merchant/create-delivery')}
                className="bg-merchant hover:bg-merchant-hover text-white shadow-sm lg:h-10 lg:px-5"
              >
                <Truck className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Nova Entrega</span>
                <span className="sm:hidden">Enviar</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate('/merchant/settings')}
                className="border-merchant/30 text-merchant hover:bg-merchant/5 lg:h-10 lg:w-10"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ======= Quick Stats Row — always 4 cols on desktop ======= */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-5">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-4 lg:p-6 text-center">
            <p className="text-xs lg:text-sm text-muted-foreground">Produtos</p>
            <p className="text-xl lg:text-3xl font-bold text-foreground mt-1">{loadingProducts ? '…' : products.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-4 lg:p-6 text-center">
            <p className="text-xs lg:text-sm text-muted-foreground">Em andamento</p>
            <p className="text-xl lg:text-3xl font-bold text-merchant mt-1">{loadingDeliveries ? '…' : activeDeliveries.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-4 lg:p-6 text-center">
            <p className="text-xs lg:text-sm text-muted-foreground">Saldo</p>
            <p className="text-xl lg:text-3xl font-bold text-foreground mt-1">
              {balance != null && !isNaN(Number(balance)) ? `R$ ${(Number(balance) / 100).toFixed(2).replace('.', ',')}` : 'R$ 0,00'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm cursor-pointer hover:bg-accent/5 transition-colors" onClick={() => navigate('/merchant/conversoes')}>
          <CardContent className="p-4 lg:p-6 text-center">
            <p className="text-xs lg:text-sm text-muted-foreground">Conversões</p>
            <div className="flex items-center justify-center gap-2 mt-1">
              <p className="text-xl lg:text-3xl font-bold text-orange-600">Ver</p>
              <ArrowRight className="h-5 w-5 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>
      {/* ======= Active Deliveries Section ======= */}
      {loadingDeliveries ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-merchant" />
        </div>
      ) : activeDeliveries.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Truck className="h-4 w-4 text-merchant" />
            Entregas Ativas
          </h2>
          {activeDeliveries.map((delivery) => (
            <DeliveryTrackingCard
              key={delivery.id}
              delivery={delivery}
              onCancelled={fetchActiveDeliveries}
            />
          ))}
        </div>
      ) : null}

      {/* ======= Products Section - Premium ======= */}
      <div className="w-full">
        <Card className="shadow-md border-border/60 lg:flex lg:flex-col">
          <CardHeader className="pb-3 lg:px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-merchant" />
                Meus Produtos
              </CardTitle>
              <Button
                size="sm"
                onClick={() => {
                  setEditingProduct(null);
                  setProductName('');
                  setProductPrice('9.00');
                  setProductDesc('');
                  setProductInternalCode('');
                  setProductImage(null);
                  setShowAddProduct(true);
                }}
                className="bg-merchant hover:bg-merchant-hover text-white shadow-sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                Adicionar Produto
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 lg:px-6 lg:flex-1">
            {loadingProducts ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-merchant" />
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-merchant/20 bg-merchant-light/30 flex flex-col items-center justify-center text-center h-full min-h-[280px] lg:min-h-0 lg:flex-1 p-6">
                <div className="mx-auto w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-merchant/10 flex items-center justify-center mb-4">
                  <Package className="h-8 w-8 lg:h-10 lg:w-10 text-merchant/60" />
                </div>
                <p className="text-base font-medium text-foreground mb-1">
                  Nenhum produto cadastrado
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  Cadastre seus produtos para enviar entregas com facilidade
                </p>
                <Button
                  onClick={() => setShowAddProduct(true)}
                  className="bg-merchant hover:bg-merchant-hover text-white"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Cadastrar primeiro produto
                </Button>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium">
                    Seus produtos entram automaticamente na divulgação local e aparecem no painel Postador dos motoboys da sua região.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {products.map((product) => (
                    <Card key={product.id} className="overflow-hidden border-border/60 shadow-sm hover:shadow-md transition-shadow bg-[#FF6A00] text-white">
                      <CardContent className="p-0">
                        {product.imagem_url ? (
                          <div className="bg-white">
                            <img
                              src={product.imagem_url}
                              alt={product.nome}
                              className="h-24 w-full object-cover lg:h-36 lg:object-contain bg-white"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <div className="h-24 w-full bg-white flex items-center justify-center lg:h-36">
                            <Package className="h-8 w-8 text-muted-foreground/50" />
                          </div>
                        )}

                        <div className="p-3">
                          <h3 className="font-medium text-sm truncate text-white">{product.nome}</h3>

                          {product.delivery_code && (
                            <div className="mt-1 mb-2 inline-flex items-center gap-[6px] px-[14px] py-[6px] rounded-full bg-[#D1FAE5] text-[#065F46] text-[22px] font-bold tracking-[1px]">
                              <Tag className="w-5 h-5 fill-current" />
                              {product.delivery_code.toUpperCase()}
                            </div>
                          )}

                          <p className="font-semibold text-sm text-white">
                            R$ {product.preco.toFixed(2).replace('.', ',')}
                          </p>
                          <div className="flex gap-2 mt-2">
                            <Button
                              size="sm"
                              className="flex-1 text-xs text-white transition-colors bg-[#2E7D32] hover:bg-[#1B5E20]"
                              onClick={() => {
                                setSelectedProduct(product);
                                navigate(`/merchant/create-delivery?product_id=${product.id}&merchant_id=${user?.id}`);
                              }}
                            >
                              <Bike className="h-3 w-3 mr-1" />
                              Entregar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-white hover:bg-white/20 hover:text-white"
                              onClick={() => handleEditProduct(product)}
                              title="Editar produto"
                            >
                              <Settings className="h-3 w-3" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 hover:text-white">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteProduct(product.id)}>
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ======= Credit Wallet & Leads Section ======= */}
      <div className="w-full">
        <Card className="shadow-md border-border/60">
          <CardHeader className="pb-3 lg:px-6">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-500" />
              Carteira de Créditos & Leads
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 lg:px-6">
            <MerchantCreditWallet />
          </CardContent>
        </Card>
      </div>

      {/* ======= Formas de Pagamento da Loja ======= */}
      <div className="w-full">
        <Card
          className="shadow-md border-border/60 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => navigate('/merchant/pagamentos')}
        >
          <CardContent className="p-4 lg:p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 shadow-md">
              <Wallet className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-foreground">Formas de Pagamento</h3>
              <p className="text-xs text-muted-foreground">Configure PIX, métodos aceitos e instruções para seus clientes</p>
            </div>
            <Settings className="h-5 w-5 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </div>

      {/* ======= Discount Requests Section ======= */}
      <div className="w-full">
        <Card className="shadow-md border-border/60">
          <CardHeader className="pb-3 lg:px-6">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Tag className="h-4 w-4 text-purple-500" />
              Pedidos de Desconto
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 lg:px-6">
            <MerchantDiscountPanel />
          </CardContent>
        </Card>
      </div>

      {/* ======= Delivery History - Premium ======= */}
      <Card className="shadow-md border-border/60">
        <CardContent className="p-0">
          <MerchantDeliveryHistory />
        </CardContent>
      </Card>

      {/* Add Product Dialog */}
      <Dialog open={showAddProduct} onOpenChange={(open) => {
        if (!open) {
          setEditingProduct(null);
          setProductName('');
          setProductPrice('9.00');
          setProductDesc('');
          setProductInternalCode('');
          setProductImage(null);
        }
        setShowAddProduct(open);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Editar Produto' : 'Cadastrar Produto'}</DialogTitle>
            <DialogDescription>
              {editingProduct ? 'Atualize as informações do seu produto' : 'Adicione um novo produto para entregas'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* INFORMATIVE CARD */}
            <div className="bg-emerald-50/80 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl p-4 flex gap-3 items-start shadow-sm">
              <div className="mt-0.5 shrink-0">
                <Info className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="space-y-1.5 flex-1">
                <h4 className="text-[14px] font-semibold text-emerald-900 dark:text-emerald-400">
                  Informação Importante sobre Entregas
                </h4>
                <p className="text-[13px] text-emerald-800/90 dark:text-emerald-300 leading-relaxed">
                  Os dados cadastrados aqui são apenas para controle interno da sua loja. <br className="hidden sm:block" />
                  O motoboy <strong className="font-semibold text-emerald-950 dark:text-emerald-200">NÃO</strong> visualizará o nome ou detalhes do produto. <br className="hidden sm:block" />
                  Ele terá acesso apenas às informações logísticas da entrega (endereços, distância e valor da corrida).
                </p>
              </div>
            </div>
            {/* Image Upload */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative h-24 w-24 rounded-lg border-2 border-dashed border-border bg-muted flex items-center justify-center overflow-hidden">
                {productImage ? (
                  <>
                    <img src={productImage} alt="Preview" className="h-full w-full object-cover" />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={clearProductImage}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <ImagePlus className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <Label htmlFor="product-image" className="cursor-pointer text-sm text-merchant hover:underline">
                {productImage ? 'Alterar imagem' : 'Adicionar imagem'}
                <input
                  id="product-image"
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-internal-code">
                Código / Referência Interna <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                id="product-internal-code"
                placeholder="Ex: SKU-001 ou REF-123"
                value={productInternalCode}
                onChange={(e) => setProductInternalCode(e.target.value)}
              />
              <p className="text-[12px] text-muted-foreground">
                Utilizado apenas para organização interna da sua loja.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-name">Nome do Recebedor *</Label>
              <Input
                id="product-name"
                placeholder="Ex: João da Silva"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="product-price">Preço (R$) *</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px] text-xs">
                      Valor sugerido referente à taxa base do motoboy.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">R$</span>
                <Input
                  id="product-price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={productPrice}
                  onChange={(e) => setProductPrice(e.target.value)}
                  className="border-0 border-b border-border rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:border-merchant px-1 text-lg font-semibold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-desc">Descrição (opcional)</Label>
              <Textarea
                id="product-desc"
                placeholder="Descrição do produto..."
                value={productDesc}
                onChange={(e) => setProductDesc(e.target.value)}
              />
            </div>

            <Button
              onClick={handleAddProduct}
              disabled={isSubmitting}
              className="w-full bg-merchant hover:bg-merchant-hover"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                editingProduct ? <Settings className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />
              )}
              {editingProduct ? 'Salvar Alterações' : 'Cadastrar e Seguir para Entrega'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Status Modal for Success/Error feedback */}
      <Dialog open={statusModal.isOpen} onOpenChange={(open) => !open && setStatusModal(prev => ({ ...prev, isOpen: false }))}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              {statusModal.type === 'success' ? (
                <>
                  <CheckCircle className="h-6 w-6 text-emerald-500" />
                  {statusModal.title}
                </>
              ) : (
                <>
                  <AlertCircle className="h-6 w-6 text-destructive" />
                  {statusModal.title}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-base text-foreground font-medium leading-relaxed break-words">
              {statusModal.message}
            </p>
            {statusModal.type === 'error' && statusModal.details && (
              <div className="bg-muted/50 rounded-md p-3 max-h-[150px] overflow-y-auto w-full">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all">
                  {statusModal.details}
                </pre>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            {statusModal.type === 'error' && (
              <Button variant="outline" onClick={handleCopyError} className="mr-auto">
                Copiar erro
              </Button>
            )}
            <Button
              className={statusModal.type === 'success' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
              onClick={() => setStatusModal(prev => ({ ...prev, isOpen: false }))}
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
