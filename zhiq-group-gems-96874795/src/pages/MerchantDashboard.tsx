import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  Package,
  Loader2,
  ArrowRight,
  Truck,
  Wallet,
  Clock,
  CheckCircle2,
  MapPin,
  FileText,
  ShoppingBag,
  Coins,
  Plus,
  Bike,
  Navigation,
  Hash
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMerchantWallet } from '@/hooks/useMerchantWallet';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface DashboardStats {
  ordersToday: number;
  activeDeliveries: number;
  revenueToday: number;
  totalPaidDeliveries: number;
}

interface RecentDelivery {
  id: string;
  destination: string;
  status: string;
  total_price: number;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle2 }> = {
  calculating: { label: 'Processando', variant: 'secondary', icon: Loader2 },
  pending: { label: 'Pendente', variant: 'secondary', icon: Clock },
  awaiting_professional: { label: 'Buscando', variant: 'secondary', icon: Truck },
  assigned: { label: 'Atribuída', variant: 'default', icon: CheckCircle2 },
  aguardando: { label: 'Aguardando', variant: 'secondary', icon: Clock },
  accepted: { label: 'Aceita', variant: 'default', icon: CheckCircle2 },
  in_progress: { label: 'Em andamento', variant: 'default', icon: Truck },
  completed: { label: 'Concluída', variant: 'outline', icon: CheckCircle2 },
  cancelled: { label: 'Cancelada', variant: 'destructive', icon: Clock },
};

export default function MerchantDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { overview, isLoading: walletLoading } = useMerchantWallet();
  const balance = overview.balanceCents;
  const [stats, setStats] = useState<DashboardStats>({
    ordersToday: 0,
    activeDeliveries: 0,
    revenueToday: 0,
    totalPaidDeliveries: 0,
  });
  const [recentDeliveries, setRecentDeliveries] = useState<RecentDelivery[]>([]);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchingOrder, setSearchingOrder] = useState<any | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.id) return;

      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [activeResult, todayResult, totalPaidResult, recentResult, searchingResult] = await Promise.all([
          // Active deliveries (in progress)
          supabase
            .from('service_orders')
            .select('id', { count: 'exact' })
            .eq('merchant_id', user.id)
            .in('status', ['calculating', 'pending', 'awaiting_professional', 'assigned', 'aguardando', 'accepted', 'started', 'in_progress']),
          // Today's orders
          supabase
            .from('service_orders')
            .select('id, total_price, status')
            .eq('merchant_id', user.id)
            .gte('created_at', today.toISOString()),
          // Total paid (all completed deliveries)
          supabase
            .from('service_orders')
            .select('total_price')
            .eq('merchant_id', user.id)
            .eq('status', 'completed'),
          // Recent deliveries (last 5)
          supabase
            .from('service_orders')
            .select('id, destination, status, total_price, created_at')
            .eq('merchant_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5),
          // Pedido em busca ativa de motoboy (mais recente)
          supabase
            .from('service_orders')
            .select('*')
            .eq('merchant_id', user.id)
            .in('status', ['searching', 'awaiting_professional', 'pending', 'aguardando', 'waiting_acceptance', 'created', 'calculating'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        const activeDeliveries = activeResult.count || 0;
        const todayOrders = todayResult.data || [];
        const completedToday = todayOrders.filter(o => o.status === 'completed');
        const revenueToday = completedToday.reduce((sum, o) => sum + (o.total_price || 0), 0);
        
        const totalPaid = (totalPaidResult.data || []).reduce((sum, o) => sum + (o.total_price || 0), 0);

        setStats({
          ordersToday: todayOrders.length,
          activeDeliveries,
          revenueToday,
          totalPaidDeliveries: totalPaid,
        });

        setRecentDeliveries(recentResult.data || []);
        setSearchingOrder(searchingResult.data ?? null);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    // Listen for realtime changes to update stats instantly
    const channel = supabase
      .channel('merchant-dashboard-stats')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_orders',
          filter: `merchant_id=eq.${user?.id}`,
        },
        (payload) => {
          fetchData();
        }
      )
      .subscribe();

    // Fetch credits separately
    const fetchCredits = async () => {
      try {
        const { data: store } = await supabase
          .from('merchant_stores')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (store) {
          const { data: wallet } = await supabase
            .from('store_credit_wallet')
            .select('balance')
            .eq('store_id', store.id)
            .maybeSingle();
          
          if (wallet) {
            setCreditBalance(wallet.balance);
          } else {
            // Initialize if not exists
            const { data: newWallet } = await supabase
              .from('store_credit_wallet')
              .insert({ store_id: store.id, balance: 0 })
              .select('balance')
              .single();
            if (newWallet) setCreditBalance(newWallet.balance);
          }
        }
      } catch (err) {
        console.error('Error fetching credits:', err);
      }
    };

    fetchCredits();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF6A00]" />
      </div>
    );
  }

  const SEARCHING_STATUSES = ['searching', 'awaiting_professional', 'pending', 'aguardando', 'waiting_acceptance', 'created', 'calculating'];
  const ACCEPTED_STATUSES  = ['accepted', 'assigned', 'in_progress', 'a_caminho', 'entregando', 'buscando'];
  const isSearching = searchingOrder && SEARCHING_STATUSES.includes(searchingOrder.status);
  const isAccepted  = searchingOrder && ACCEPTED_STATUSES.includes(searchingOrder.status);

  return (
    <div className="p-4 space-y-4 lg:px-8 xl:px-12 lg:py-8 lg:space-y-6 w-full">

      {/* ── Card: Entrega em andamento ──────────────────────────────── */}
      {searchingOrder && (
        <div className={`rounded-2xl border-2 overflow-hidden ${isAccepted ? 'border-green-500/60 bg-green-950/30' : 'border-[#FF6A00]/60 bg-[#FF6A00]/5'}`}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[#A7B0BE] uppercase tracking-widest flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {searchingOrder.id.slice(0, 8).toUpperCase()}
              </span>
              <span className="text-[10px] text-[#A7B0BE]">
                {format(new Date(searchingOrder.created_at), "HH:mm '•' dd/MM", { locale: ptBR })}
              </span>
            </div>
            {isAccepted ? (
              <Badge className="bg-green-500 text-white text-[10px] gap-1">
                <CheckCircle2 className="h-3 w-3" /> Motoboy a caminho
              </Badge>
            ) : (
              <Badge className="bg-[#FF6A00] text-white text-[10px] animate-pulse gap-1">
                <Bike className="h-3 w-3" /> Procurando Motoboy
              </Badge>
            )}
          </div>

          {/* Rota */}
          <div className="px-4 py-3 flex gap-3">
            <div className="flex flex-col items-center gap-1 pt-1">
              <div className="w-2.5 h-2.5 rounded-full bg-[#FF6A00]" />
              <div className="w-px flex-1 border-l-2 border-dashed border-[#FF6A00]/30" />
              <Navigation className="h-3 w-3 text-[#A7B0BE] rotate-180" />
            </div>
            <div className="flex-1 space-y-3 min-w-0">
              <div>
                <p className="text-[9px] font-bold text-[#A7B0BE] uppercase tracking-widest">Retirada</p>
                <p className="text-sm font-semibold text-[#F5F7FA] truncate">{searchingOrder.pickup_location || searchingOrder.store_address || '—'}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-[#A7B0BE] uppercase tracking-widest">Entrega</p>
                <p className="text-sm font-semibold text-[#F5F7FA] truncate">{searchingOrder.destination || '—'}</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[9px] text-[#A7B0BE] uppercase tracking-widest">Total</p>
              <p className="text-lg font-bold text-[#FF6A00]">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(searchingOrder.total_price || 0)}
              </p>
            </div>
          </div>

          {/* Radar (só enquanto buscando) */}
          {isSearching && (
            <div className="px-4 pb-4 flex items-center gap-4">
              <div className="relative h-12 w-12 shrink-0">
                <div className="absolute inset-0 rounded-full bg-[#FF6A00]/20 animate-ping" style={{ animationDuration: '2.5s' }} />
                <div className="absolute inset-0 rounded-full bg-[#FF6A00]/10 animate-ping" style={{ animationDuration: '1.8s', animationDelay: '0.4s' }} />
                <div className="relative h-12 w-12 rounded-full bg-[#1B1F24] border border-[#FF6A00]/30 flex items-center justify-center">
                  <Bike className="h-5 w-5 text-[#FF6A00]" />
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-[#F5F7FA]">Buscando motoboy na região…</p>
                <p className="text-xs text-[#A7B0BE]">Você será avisado assim que alguém aceitar.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Primary CTA */}
      <Button
        onClick={() => navigate('/merchant/create-delivery')} 
        className="w-full bg-[#FF6A00] hover:bg-[#FF7A1A] text-white h-14 text-base font-semibold shadow-lg shadow-[#FF6A00]/20"
        size="lg"
      >
        <Truck className="h-5 w-5 mr-2" />
        Criar Nova Entrega
        <ArrowRight className="h-5 w-5 ml-2" />
      </Button>
        {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        {/* Orders Today */}
        <Card className="border-[#2A3038] bg-[#1B1F24]">
          <CardHeader className="pb-2 pt-3 px-3 lg:pt-5 lg:px-5">
            <CardTitle className="text-xs lg:text-sm font-medium flex items-center gap-1.5 text-[#A7B0BE]">
              <ShoppingBag className="h-3.5 w-3.5" />
              Pedidos Hoje
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 lg:px-5 lg:pb-5">
            <span className="text-2xl lg:text-3xl font-bold text-[#F5F7FA]">
              {stats.ordersToday}
            </span>
          </CardContent>
        </Card>

        {/* Active Deliveries */}
        <Card className="border-[#2A3038] bg-[#1B1F24]">
          <CardHeader className="pb-2 pt-3 px-3 lg:pt-5 lg:px-5">
            <CardTitle className="text-xs lg:text-sm font-medium flex items-center gap-1.5 text-[#A7B0BE]">
              <Package className="h-3.5 w-3.5" />
              Em Andamento
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 lg:px-5 lg:pb-5">
            <span className="text-2xl lg:text-3xl font-bold text-[#F5F7FA]">
              {stats.activeDeliveries}
            </span>
          </CardContent>
        </Card>

        {/* Revenue Today */}
        <Card className="border-[#2A3038] bg-[#1B1F24]">
          <CardHeader className="pb-2 pt-3 px-3 lg:pt-5 lg:px-5">
            <CardTitle className="text-xs lg:text-sm font-medium flex items-center gap-1.5 text-[#A7B0BE]">
              <TrendingUp className="h-3.5 w-3.5" />
              Receita do Dia
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 lg:px-5 lg:pb-5">
            <span className="text-xl lg:text-3xl font-bold text-[#F5F7FA]">
              R$ {stats.revenueToday.toFixed(2).replace('.', ',')}
            </span>
          </CardContent>
        </Card>

        {/* Total Paid */}
        <Card className="border-[#2A3038] bg-[#1B1F24]">
          <CardHeader className="pb-2 pt-3 px-3 lg:pt-5 lg:px-5">
            <CardTitle className="text-xs lg:text-sm font-medium flex items-center gap-1.5 text-[#A7B0BE]">
              <Wallet className="h-3.5 w-3.5" />
              Total Pago
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 lg:px-5 lg:pb-5">
            <span className="text-xl lg:text-3xl font-bold text-[#F5F7FA]">
              R$ {stats.totalPaidDeliveries.toFixed(2).replace('.', ',')}
            </span>
          </CardContent>
        </Card>

        {/* Conversões */}
        <Card className="border-[#2A3038] bg-[#1B1F24] cursor-pointer hover:border-[#FF6A00]/40 transition-colors" onClick={() => navigate('/merchant/conversoes')}>
          <CardHeader className="pb-2 pt-3 px-3 lg:pt-5 lg:px-5">
            <CardTitle className="text-xs lg:text-sm font-medium flex items-center gap-1.5 text-[#FF6A00]">
              <TrendingUp className="h-3.5 w-3.5" />
              Conversões
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 lg:px-5 lg:pb-5">
            <div className="flex items-center gap-2">
              <span className="text-xl lg:text-3xl font-bold text-[#FF6A00]">Ver</span>
              <ArrowRight className="h-5 w-5 text-[#FF6A00]" />
            </div>
          </CardContent>
        </Card>

        {/* Créditos */}
        <Card className="border-[#2A3038] bg-[#1B1F24] cursor-pointer hover:border-[#FF6A00]/40 transition-colors" onClick={() => navigate('/merchant/creditos')}>
          <CardHeader className="pb-2 pt-3 px-3 lg:pt-5 lg:px-5">
            <CardTitle className="text-xs lg:text-sm font-medium flex items-center gap-1.5 text-[#FF6A00]">
              <Coins className="h-3.5 w-3.5" />
              Créditos
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 lg:px-5 lg:pb-5">
            <div className="flex items-center justify-between">
              <span className="text-2xl lg:text-3xl font-bold text-[#FF6A00]">
                {creditBalance !== null ? creditBalance : '...'}
              </span>
              <div className="flex items-center gap-2">
                <Button 
                  size="icon" 
                  className="bg-[#FF6A00]/10 hover:bg-[#FF6A00]/20 text-[#FF6A00] rounded-full h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/merchant/creditos');
                  }}
                >
                  <Plus className="w-4 h-4" />
                </Button>
                <ArrowRight className="h-5 w-5 text-[#FF6A00]" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Desktop: Financial + Recent side by side */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-4 lg:space-y-0">
      {/* Financial Card */}
      <Card className="border-[#2A3038] bg-gradient-to-br from-[#1B1F24] to-[#14171B]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#F5F7FA]">
            <Wallet className="h-4 w-4 text-[#FF6A00]" />
            Carteira
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-[#A7B0BE] mb-1">Saldo Disponível</p>
              <p className="text-xl lg:text-2xl font-bold text-[#F5F7FA]">
                {walletLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-[#FF6A00]" />
                ) : (
                  `R$ ${overview.balanceReais.toFixed(2).replace('.', ',')}`
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#A7B0BE] mb-1">Em Processamento</p>
              <p className="text-xl lg:text-2xl font-bold text-[#FF6A00]">
                {walletLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  `R$ ${overview.pendingReais.toFixed(2).replace('.', ',')}`
                )}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/merchant/billing')}
              className="flex-1 text-[#A7B0BE] border-[#2A3038] bg-transparent hover:bg-[#2A3038] hover:text-[#F5F7FA]"
            >
              <FileText className="h-4 w-4 mr-2" />
              Ver Extrato
            </Button>
            <Button 
              size="sm"
              onClick={() => navigate('/merchant/creditos')}
              className="flex-1 bg-[#FF6A00] hover:bg-[#FF7A1A] text-white"
            >
              Adicionar Créditos
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Deliveries */}
      <Card className="border-[#2A3038] bg-[#1B1F24]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#F5F7FA]">
              <Truck className="h-4 w-4 text-[#FF6A00]" />
              Últimas Entregas
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/merchant/history')}
              className="text-xs text-[#A7B0BE] hover:text-[#FF6A00]"
            >
              Ver todas
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentDeliveries.length === 0 ? (
            <div className="text-center py-6 text-[#A7B0BE]">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma entrega realizada ainda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentDeliveries.map((delivery) => {
                const statusConfig = STATUS_CONFIG[delivery.status] || STATUS_CONFIG.aguardando;
                const StatusIcon = statusConfig.icon;
                
                return (
                  <div
                    key={delivery.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-[#14171B] border border-[#2A3038]"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="p-2 rounded-lg bg-[#FF6A00]/10">
                        <MapPin className="h-4 w-4 text-[#FF6A00]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#F5F7FA] truncate">
                          {delivery.destination}
                        </p>
                        <p className="text-xs text-[#A7B0BE]">
                          {format(new Date(delivery.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={statusConfig.variant} className="text-xs flex items-center gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {statusConfig.label}
                      </Badge>
                      <span className="text-sm font-semibold text-[#F5F7FA]">
                        R$ {(delivery.total_price || 0).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      </div>{/* end desktop 2-col grid */}
    </div>
  );
}
