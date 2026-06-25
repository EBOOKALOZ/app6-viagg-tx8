import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { History, FileText, Share2, ChevronRight, Package, Clock, Route } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DeliveryHistoryModal } from './DeliveryHistoryModal';
import { DeliveryReceiptData } from './DeliveryReceipt';
import { toast } from 'sonner';

interface DeliveryHistoryItem {
  id: string;
  total_price: number;
  completed_at: string;
  products: {
    name: string;
    delivery_code: string | null;
  } | null;
}

export function MerchantDeliveryHistory() {
  const { user } = useAuth();
  const [history, setHistory] = useState<DeliveryHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: store, error: storeError } = await (supabase
        .from('merchant_stores') as any)
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (storeError || !store) {
        setIsLoading(false);
        return;
      }

      const { data: deliveries, error } = await supabase
        .from('delivery_orders')
        .select(`
          id,
          total_price,
          completed_at,
          products ( name, delivery_code )
        `)
        .eq('store_id', store.id)
        .eq('status', 'delivered')
        .order('completed_at', { ascending: false });

      if (error) throw error;

      setHistory((deliveries as unknown) as DeliveryHistoryItem[]);
    } catch (error) {
      console.error('[MerchantDeliveryHistory] Erro ao buscar histórico:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);



  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5" />
            Histórico de Entregas
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

  if (history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5" />
            Histórico de Entregas
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center">
          <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Nenhuma entrega finalizada ainda</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5" />
            Histórico de Entregas
            <Badge variant="secondary" className="ml-auto">
              {history.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[400px]">
            <div className="divide-y">
              {history.map((item) => (
                <div key={item.id} className="p-4 hover:bg-muted/10 transition-colors">
                  <div className="flex flex-col gap-1">
                    <p className="font-medium text-sm text-foreground">
                      📦 {item.products?.delivery_code || '---'} <span className="text-muted-foreground font-normal mx-1">|</span> {item.products?.name || 'Produto Excluído'}
                    </p>
                    <p className="text-sm font-semibold text-emerald-600">
                      💰 R$ {Number(item.total_price).toFixed(2).replace('.', ',')}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {item.completed_at ? format(new Date(item.completed_at), "dd/MM/yyyy '—' HH:mm", { locale: ptBR }) : 'Data não disponível'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </>
  );
}
