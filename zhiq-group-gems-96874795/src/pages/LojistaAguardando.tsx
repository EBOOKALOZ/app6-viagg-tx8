import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Bike, MapPin, Navigation, Clock, Hash, Package, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function LojistaAguardando() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [store, setStore] = useState<any>(null);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isFetchingRef = useRef(false);

  // Get order_id from current URL search params
  const queryParams = new URLSearchParams(window.location.search);
  const urlOrderId = queryParams.get('order_id');

  const fetchActiveData = useCallback(async () => {
    if (!user?.id || isFetchingRef.current) return;
    isFetchingRef.current = true;

    console.log("[LojistaAguardando] Fetching active data. URL Order ID:", urlOrderId);

    try {
      // 1. Fetch active order first to know the context
      let orderQuery = supabase
        .from('service_orders')
        .select('*');

      if (urlOrderId) {
        orderQuery = orderQuery.eq('id', urlOrderId);
      } else {
        orderQuery = orderQuery
          .eq('merchant_id', user.id)
          .eq('service_type', 'delivery')
          .in('status', ['searching', 'awaiting_professional', 'pending', 'assigned', 'accepted', 'a_caminho', 'in_progress', 'aguardando', 'waiting_acceptance', 'created', 'calculating']);
      }

      const { data: orderData, error: orderError } = await orderQuery
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (orderError) {
        console.error("[LojistaAguardando] Order query error:", orderError);
      }

      if (orderData) {
        setActiveOrder(orderData);
        
        // 2. Fetch specific store info based on order's merchant_id (truth source)
        const targetMerchantId = orderData.merchant_id;
        
        const { data: storeData } = await supabase
          .from('merchant_stores')
          .select('nome_loja, logo_url, street, number, neighborhood, cidade, estado, endereco_formatado')
          .eq('user_id', targetMerchantId)
          .maybeSingle();

        const { data: profileData } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', targetMerchantId)
          .maybeSingle();

        if (storeData) {
          setStore({ 
            ...storeData, 
            owner_name: profileData?.name 
          });
        }

        // Redirect para o dashboard quando motoboy aceitar
        if (['accepted', 'in_progress', 'a_caminho', 'entregando', 'buscando'].includes(orderData.status)) {
          navigate("/merchant/dashboard");
        }
      } else {
        // Fallback to current user store if no order found (empty state)
        const { data: fallbackStore } = await supabase
          .from('merchant_stores')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        
        const { data: fallbackProfile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', user.id)
          .maybeSingle();

        if (fallbackStore) {
          setStore({ ...fallbackStore, owner_name: fallbackProfile?.name });
        }
      }
    } catch (error) {
      console.error('LojistaAguardando fetch error:', error);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [user?.id, urlOrderId, navigate]);

  useEffect(() => {
    fetchActiveData();

    // Specific filter for realtime
    const filter = urlOrderId 
      ? `id=eq.${urlOrderId}` 
      : `merchant_id=eq.${user?.id}`;

    const channel = supabase
      .channel(`lojista-waiting-${urlOrderId || 'latest'}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_orders",
          filter: filter,
        },
        (payload) => {
          const updatedOrder = payload.new as any;
          if (updatedOrder) {
            setActiveOrder(updatedOrder);
            if (['accepted', 'in_progress', 'a_caminho'].includes(updatedOrder.status)) {
              navigate("/merchant");
            }
          }
          if (payload.eventType === 'DELETE' || (updatedOrder && ['completed', 'cancelled'].includes(updatedOrder.status))) {
            setActiveOrder(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, urlOrderId, navigate, fetchActiveData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen bg-slate-50 px-4 py-8 md:py-12 gap-6">
      <div className="w-full max-w-2xl space-y-6">
        
        {/* 🏪 Store Header */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 flex items-center gap-5">
          <div className="relative">
            {store?.logo_url ? (
              <img
                src={store.logo_url}
                alt={store.nome_loja}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-50 shadow-sm"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-slate-100 border-2 border-slate-50 flex items-center justify-center shrink-0">
                <Package className="h-8 w-8 text-slate-300" />
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
              <span className="w-2 h-2 bg-white rounded-full animate-ping" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-slate-900 truncate">
              {activeOrder?.store_name || store?.nome_loja || "Loja comercial"}
            </h2>
            <div className="space-y-0.5 mt-1">
              <p className="text-slate-500 text-xs font-medium flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {activeOrder?.store_address || (() => {
                    const parts = [
                      store?.street,
                      store?.number,
                      store?.neighborhood,
                      store?.cidade,
                      store?.estado
                    ].filter(Boolean);
                    
                    return parts.length > 0 
                      ? parts.join(', ')
                      : (store?.endereco_formatado || "Endereço real não cadastrado");
                  })()}
                </span>
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <User className="h-3 w-3 text-slate-400" />
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest leading-none">
                  Responsável: {activeOrder?.store_manager || store?.owner_name || "Vinculando..."}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 📦 Order Details Card */}
        {activeOrder ? (
          <Card className="border-none shadow-xl bg-white overflow-hidden rounded-3xl">
            <div className="bg-primary/5 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-white text-primary border-primary/20 font-mono">
                  <Hash className="h-3 w-3 mr-1" />
                  {activeOrder.id.slice(0, 8).toUpperCase()}
                </Badge>
                <span className="text-xs text-slate-400 font-medium">
                  {format(new Date(activeOrder.created_at), "HH:mm '•' dd/MM", { locale: ptBR })}
                </span>
              </div>
              <Badge className="bg-orange-500 hover:bg-orange-600 animate-pulse">
                Procurando Motoboy
              </Badge>
            </div>
            
            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                    <div className="w-0.5 h-10 border-l-2 border-dashed border-slate-200" />
                    <Navigation className="h-4 w-4 text-slate-400 rotate-180" />
                  </div>
                  <div className="flex-1 space-y-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">Retirada na Loja</p>
                      <p className="text-sm font-semibold text-slate-700 text-left line-clamp-1">{activeOrder.pickup_location}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">Entrega no Cliente</p>
                      <p className="text-sm font-semibold text-slate-700 text-left line-clamp-1">{activeOrder.destination}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 pt-2">
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Valor Total</span>
                    <p className="text-2xl font-bold text-primary">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(activeOrder.total_price || 0)}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="p-12 text-center space-y-4 bg-white rounded-3xl border border-dashed border-slate-200">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
              <Package className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-slate-500 font-medium tracking-tight">Nenhuma entrega ativa no momento.</p>
            <button 
              onClick={() => navigate('/merchant')}
              className="text-primary text-sm font-bold hover:underline"
            >
              Voltar ao painel
            </button>
          </div>
        )}

        {/* 📡 Radar Animation Section */}
        {activeOrder && ['searching', 'awaiting_professional', 'pending', 'aguardando', 'waiting_acceptance', 'created', 'calculating'].includes(activeOrder.status) && (
          <div className="py-8 flex flex-col items-center gap-6">
            <div className="relative">
              {/* Pulsing rings */}
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '3s' }} />
              <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
              
              <div className="relative h-24 w-24 rounded-full bg-white shadow-xl flex items-center justify-center z-10 border border-slate-50">
                <Bike className="h-12 w-12 text-primary" />
              </div>
              
              <div className="absolute -top-1 -right-1 h-32 w-32 border-2 border-primary/10 rounded-full animate-spin-slow" 
                   style={{ borderRightColor: 'transparent', borderBottomColor: 'transparent', animationDuration: '8s' }} />
            </div>

            <div className="text-center space-y-2 px-6">
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Procurando Motoboy...</h3>
              <p className="text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">
                Enviamos sua chamada para os melhores motoboys da região. Mantenha esta tela aberta.
              </p>
            </div>

            <div className="flex items-center gap-4 pt-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-tight">Radar Ativo</span>
              </div>
              <div className="w-4 h-px bg-slate-200" />
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-slate-400" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-tight">Tempo Real</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow linear infinite;
        }
      `}</style>
    </div>
  );
}
