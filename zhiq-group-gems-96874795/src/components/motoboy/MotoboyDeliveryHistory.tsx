import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { History, MapPin, ChevronRight, Package, DollarSign, TrendingUp, Clock, Route, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DeliveryHistoryModal } from '@/components/delivery/DeliveryHistoryModal';
import { DeliveryReceiptData } from '@/components/delivery/DeliveryReceipt';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';
import { EarningsComparisonTable } from './EarningsComparisonTable';

interface DeliveryHistoryRow {
  id: string;
  delivery_order_id: string;
  loja_nome: string | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  pickup_location: string;
  destination: string;
  order_description: string | null;
  valor_bruto: number;
  taxa_plataforma: number;
  valor_liquido: number;
  status: string;
  finalizada_em: string | null;
  route_points: Json;
  receipt_hash: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  accepted_at: string | null;
  motoboy_nome: string | null;
}

export function MotoboyDeliveryHistory() {
  const { user } = useAuth();
  const [history, setHistory] = useState<DeliveryHistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryReceiptData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedComparisonId, setExpandedComparisonId] = useState<string | null>(null);

  // Calculate commission percentage from gross value and platform fee
  const calculateCommissionPercentage = (grossValue: number, platformFee: number): number => {
    if (grossValue <= 0) return 35;
    return Math.round((platformFee / grossValue) * 100);
  };

  // Get estimated groups from commission percentage
  const getGroupsFromPercentage = (percentage: number): number => {
    const rules = [
      { groups: 6, percentage: 6 },
      { groups: 5, percentage: 8 },
      { groups: 4, percentage: 11 },
      { groups: 3, percentage: 15 },
      { groups: 2, percentage: 20 },
      { groups: 1, percentage: 28 },
      { groups: 0, percentage: 35 },
    ];
    const match = rules.find(r => r.percentage === percentage);
    return match?.groups ?? 0;
  };

  const fetchHistory = useCallback(async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      // Buscar histórico da tabela delivery_history
      const { data, error } = await supabase
        .from('delivery_history')
        .select('*')
        .eq('motoboy_id', user.id)
        .order('finalizada_em', { ascending: false })
        .limit(50);

      if (error) throw error;

      setHistory((data as DeliveryHistoryRow[]) || []);
    } catch (error) {
      console.error('[MotoboyDeliveryHistory] Erro ao buscar histórico:', error);
      toast.error('Erro ao carregar histórico');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Calcular totais
  const totals = history.reduce(
    (acc, item) => {
      if (item.status === 'finalizada') {
        acc.entregas += 1;
        acc.valorBruto += Number(item.valor_bruto) || 0;
        acc.valorLiquido += Number(item.valor_liquido) || 0;
      }
      return acc;
    },
    { entregas: 0, valorBruto: 0, valorLiquido: 0 }
  );

  const handleOpenDetails = (item: DeliveryHistoryRow) => {
    // Converter route_points de Json para array
    let routePoints: { lat: number; lng: number }[] | undefined;
    if (item.route_points && Array.isArray(item.route_points)) {
      routePoints = item.route_points as { lat: number; lng: number }[];
    }

    const receiptData: DeliveryReceiptData = {
      id: item.id,
      loja_nome: item.loja_nome,
      cliente_nome: item.cliente_nome,
      cliente_telefone: item.cliente_telefone,
      pickup_location: item.pickup_location,
      destination: item.destination,
      order_description: item.order_description,
      valor_bruto: Number(item.valor_bruto),
      taxa_plataforma: Number(item.taxa_plataforma),
      valor_liquido: Number(item.valor_liquido),
      status: item.status,
      finalizada_em: item.finalizada_em,
      route_points: routePoints,
      receipt_hash: item.receipt_hash,
      distance_km: Number(item.distance_km) || undefined,
      duration_minutes: Number(item.duration_minutes) || undefined,
      accepted_at: item.accepted_at || undefined,
      motoboy_nome: item.motoboy_nome || undefined,
    };
    setSelectedDelivery(receiptData);
    setIsModalOpen(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5" />
            Histórico Completo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Resumo de ganhos */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-3 text-center">
            <Package className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-lg font-bold text-primary">{totals.entregas}</p>
            <p className="text-xs text-muted-foreground">Entregas</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="p-3 text-center">
            <DollarSign className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-lg font-bold">R$ {totals.valorBruto.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">Bruto</p>
          </CardContent>
        </Card>
        <Card className="bg-green-500/10 border-green-500/20">
          <CardContent className="p-3 text-center">
            <TrendingUp className="h-5 w-5 mx-auto mb-1 text-green-600" />
            <p className="text-lg font-bold text-green-600">R$ {totals.valorLiquido.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">Líquido</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5" />
            Histórico Completo
            <Badge variant="secondary" className="ml-auto">
              {history.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <div className="py-8 text-center">
              <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhuma entrega no histórico ainda</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="divide-y">
                {history.map((item) => {
                  const commissionPercentage = calculateCommissionPercentage(
                    Number(item.valor_bruto), 
                    Number(item.taxa_plataforma)
                  );
                  const currentGroups = getGroupsFromPercentage(commissionPercentage);
                  const isExpanded = expandedComparisonId === item.id;
                  
                  return (
                    <div
                      key={item.id}
                      className="p-4 hover:bg-muted/30 transition-colors"
                    >
                      {/* Main content - clickable for details */}
                      <div 
                        className="flex items-start justify-between gap-3 cursor-pointer"
                        onClick={() => handleOpenDetails(item)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-sm truncate">
                              {item.loja_nome || 'Entrega'}
                            </p>
                            <Badge 
                              variant={item.status === 'finalizada' ? 'default' : 'destructive'}
                              className="text-xs"
                            >
                              {item.status === 'finalizada' ? 'Concluída' : 'Cancelada'}
                            </Badge>
                            {item.route_points && Array.isArray(item.route_points) && (item.route_points as unknown[]).length > 0 && (
                              <span title="Rota disponível">
                                <MapPin className="h-3 w-3 text-blue-500" />
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.destination}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-xs text-muted-foreground">
                              {item.finalizada_em 
                                ? format(new Date(item.finalizada_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                                : 'Data não disponível'}
                            </p>
                            {(item.distance_km !== null && Number(item.distance_km) > 0) && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Route className="h-3 w-3" />
                                {Number(item.distance_km).toFixed(1)} km
                              </span>
                            )}
                            {(item.duration_minutes !== null && Number(item.duration_minutes) > 0) && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {item.duration_minutes} min
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="font-bold text-sm text-primary">
                              R$ {Number(item.valor_liquido).toFixed(2)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              líquido
                            </p>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>

                      {/* Earnings Comparison - only for completed deliveries */}
                      {item.status === 'finalizada' && Number(item.valor_bruto) > 0 && (
                        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                          {!isExpanded ? (
                            <button
                              onClick={() => setExpandedComparisonId(item.id)}
                              className="w-full p-2 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 hover:from-amber-500/20 hover:to-orange-500/20 transition-all text-left"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <TrendingUp className="h-4 w-4 text-amber-600" />
                                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                                    Veja quanto você poderia ganhar
                                  </span>
                                </div>
                                <ChevronDown className="h-4 w-4 text-amber-600" />
                              </div>
                            </button>
                          ) : (
                            <EarningsComparisonTable
                              grossValue={Number(item.valor_bruto)}
                              currentGroups={currentGroups}
                              currentPercentage={commissionPercentage}
                              compact={true}
                              onCollapse={() => setExpandedComparisonId(null)}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <DeliveryHistoryModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        delivery={selectedDelivery}
      />
    </>
  );
}
