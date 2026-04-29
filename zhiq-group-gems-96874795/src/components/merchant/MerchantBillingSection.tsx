import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Receipt, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  FileText,
  TrendingDown,
  CreditCard
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BillingItem {
  id: string;
  delivery_order_id: string;
  cliente_nome: string | null;
  destination: string;
  valor_bruto: number;
  taxa_plataforma: number;
  finalizada_em: string | null;
  status: 'pendente' | 'faturado' | 'pago';
}

interface BillingSummary {
  totalEmAberto: number;
  faturasPendentes: number;
  totalPago: number;
}

export function MerchantBillingSection() {
  const { user } = useAuth();
  const [billingItems, setBillingItems] = useState<BillingItem[]>([]);
  const [summary, setSummary] = useState<BillingSummary>({
    totalEmAberto: 0,
    faturasPendentes: 0,
    totalPago: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchBillingData = useCallback(async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      // Buscar entregas finalizadas do comerciante via service_orders
      const { data: merchantOrders } = await supabase
        .from('service_orders')
        .select('id')
        .eq('merchant_id', user.id)
        .eq('service_type', 'delivery');
      
      const merchantOrderIds = new Set((merchantOrders || []).map(o => o.id));

      // Buscar histórico de entregas
      const { data: historyData, error } = await supabase
        .from('delivery_history')
        .select('id, delivery_order_id, cliente_nome, destination, valor_bruto, taxa_plataforma, finalizada_em, status')
        .order('finalizada_em', { ascending: false });

      if (error) throw error;

      // Filtrar apenas entregas deste comerciante
      const filteredItems: BillingItem[] = (historyData || [])
        .filter(h => merchantOrderIds.has(h.delivery_order_id))
        .map(h => ({
          id: h.id,
          delivery_order_id: h.delivery_order_id,
          cliente_nome: h.cliente_nome,
          destination: h.destination,
          valor_bruto: Number(h.valor_bruto) || 0,
          taxa_plataforma: Number(h.taxa_plataforma) || 0,
          finalizada_em: h.finalizada_em,
          // MVP: todas as faturas são "pendentes" até admin marcar como pago
          // No futuro, teremos uma tabela merchant_payments para controle
          status: 'pendente' as const,
        }));

      setBillingItems(filteredItems);

      // Calcular resumo
      const totalEmAberto = filteredItems
        .filter(i => i.status === 'pendente')
        .reduce((sum, i) => sum + i.taxa_plataforma, 0);
      
      const faturasPendentes = filteredItems.filter(i => i.status === 'pendente').length;

      setSummary({
        totalEmAberto,
        faturasPendentes,
        totalPago: 0, // MVP: sem histórico de pagamentos ainda
      });

    } catch (error) {
      console.error('[MerchantBillingSection] Erro ao buscar dados:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const getStatusBadge = (status: BillingItem['status']) => {
    switch (status) {
      case 'pendente':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
      case 'faturado':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700"><FileText className="h-3 w-3 mr-1" />Faturado</Badge>;
      case 'pago':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700"><CheckCircle2 className="h-3 w-3 mr-1" />Pago</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white border-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 opacity-80" />
              <span className="text-xs font-medium opacity-90">Total em aberto</span>
            </div>
            <p className="text-2xl font-bold">
              R$ {summary.totalEmAberto.toFixed(2).replace('.', ',')}
            </p>
            <p className="text-xs opacity-80 mt-1">
              {summary.faturasPendentes} {summary.faturasPendentes === 1 ? 'fatura pendente' : 'faturas pendentes'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Total pago</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              R$ {summary.totalPago.toFixed(2).replace('.', ',')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Histórico de pagamentos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Info Alert */}
      <Alert className="border-primary/20 bg-primary/5">
        <AlertCircle className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm text-muted-foreground">
          A <strong>taxa de plataforma</strong> de cada entrega é cobrada separadamente. 
          O pagamento é feito fora do app e registrado pelo administrador.
        </AlertDescription>
      </Alert>

      {/* Billing History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-5 w-5 text-primary" />
            Faturas de Entregas
            {billingItems.length > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {billingItems.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {billingItems.length === 0 ? (
            <div className="py-8 text-center">
              <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhuma fatura ainda</p>
              <p className="text-xs text-muted-foreground mt-1">
                Entregas finalizadas aparecerão aqui
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[350px]">
              <div className="divide-y">
                {billingItems.map((item) => (
                  <div key={item.id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm truncate">
                            {item.cliente_nome || 'Cliente não informado'}
                          </p>
                          {getStatusBadge(item.status)}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.destination}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {item.finalizada_em 
                            ? format(new Date(item.finalizada_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                            : 'Data não disponível'}
                        </p>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Taxa plataforma</p>
                        <p className="font-bold text-sm text-destructive">
                          R$ {item.taxa_plataforma.toFixed(2).replace('.', ',')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          de R$ {item.valor_bruto.toFixed(2).replace('.', ',')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
