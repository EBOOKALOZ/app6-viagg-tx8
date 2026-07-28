import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { CommercialStats } from "./CommercialStats";
import { CommercialCharts } from "./CommercialCharts";
import { CommercialAIInsights } from "./CommercialAIInsights";
import { useMerchantWallet } from "@/hooks/useMerchantWallet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, ArrowRight, Loader2 } from "lucide-react";
import { formatCurrencyBRL } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function AdvertiserCommercialDashboard() {
  const { user } = useAuth();
  const { overview, isLoading: walletLoading } = useMerchantWallet();
  const [stats, setStats] = useState({
    products: 0, leiloes: 0, arremates: 0, vehicles: 0, 
    real_estate: 0, services: 0, travels: 0, freights: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    
    const fetchStats = async () => {
      try {
        const storeId = user.id; // Usually merchant_id is the user id
        const queries = [
          supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", "active").then(res => res.count || 0).catch(() => 0),
          supabase.from("auction_listings").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("listing_type", "leilao").eq("status", "active").then(res => res.count || 0).catch(() => 0),
          supabase.from("auction_listings").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("listing_type", "arremate").eq("status", "active").then(res => res.count || 0).catch(() => 0),
          supabase.from("vehicle_listings").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", "active").then(res => res.count || 0).catch(() => 0),
          supabase.from("real_estate_listings").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", "active").then(res => res.count || 0).catch(() => 0),
          supabase.from("service_listings").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", "active").then(res => res.count || 0).catch(() => 0),
          supabase.from("travel_listings" as any).select("id", { count: "exact", head: true }).eq("owner_user_id", storeId).eq("visibility_status", "published").then(res => res.count || 0).catch(() => 0),
          supabase.from("freight_listings").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", "active").then(res => res.count || 0).catch(() => 0),
        ];
        
        const results = await Promise.all(queries);
        setStats({
          products: results[0], leiloes: results[1], arremates: results[2],
          vehicles: results[3], real_estate: results[4], services: results[5],
          travels: results[6], freights: results[7],
        });
      } catch (err) {
        console.error("Error fetching commercial stats", err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchStats();
  }, [user?.id]);

  if (isLoading || walletLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard Comercial</h2>
          <p className="text-muted-foreground">Visão geral do desempenho dos seus negócios e anúncios em todas as categorias.</p>
        </div>
      </div>

      {/* Wallet / Financeiro */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex justify-between items-center text-primary">
              Saldo Disponível
              <Wallet className="w-4 h-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrencyBRL(overview.balanceCents / 100)}</div>
            <p className="text-xs text-primary/80 mt-1">
              + {formatCurrencyBRL((overview.pendingRechargesCents + overview.pendingWithdrawalsCents) / 100)} em trânsito
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex justify-between items-center text-muted-foreground">
              Receita Gerada (Mês)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-500">R$ 14.500,00</div>
            <p className="text-xs text-muted-foreground mt-1 text-emerald-600 flex items-center">
              + 12% em relação ao mês anterior
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex justify-between items-center text-muted-foreground">
              Comissão Estimada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-500">R$ 725,00</div>
            <p className="text-xs text-muted-foreground mt-1">
              5% sobre o valor gerado
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Estatísticas por Categoria */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Anúncios Ativos</h3>
        <CommercialStats stats={stats} />
      </div>

      {/* Gráficos e IA */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <CommercialCharts />
        </div>
        <div className="space-y-6">
          <CommercialAIInsights />
        </div>
      </div>
    </div>
  );
}
