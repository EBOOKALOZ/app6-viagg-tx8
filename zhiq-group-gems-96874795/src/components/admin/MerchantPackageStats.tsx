import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, ShoppingCart, CreditCard, TrendingUp, Users, Clock, CheckCircle2 } from "lucide-react";

interface PackageStat {
  product_name: string;
  total_purchases: number;
  paid_purchases: number;
  pending_purchases: number;
  total_credits: number;
  total_revenue: number;
  pending_revenue: number;
  unique_stores: number;
}

export function MerchantPackageStats() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-merchant-package-stats"],
    queryFn: async () => {
      // Buscar TODAS as compras (pagas + pendentes + aguardando)
      const { data: purchases, error } = await (supabase.from("credit_purchases") as any)
        .select("product_name, credits_granted, amount_paid, store_id, status, created_at")
        .in("status", ["paid", "pending", "awaiting_payment"]);

      if (error) throw error;

      // Helper para normalizar nome para os 3 modelos
      const normalizePackageName = (rawName: string): string => {
        const name = (rawName || "").toUpperCase();
        if (name.includes("ÚNICO") || name.includes("BÁSICO") || name.includes("INICIANTE")) {
          return "CRÉDITO INICIANTE";
        }
        if (name.includes("POUCOS") || name.includes("MEI") || name.includes("EMPREENDEDOR")) {
          return "CRÉDITO MEI";
        }
        if (name.includes("LOJISTA")) {
          return "CRÉDITO LOJISTA";
        }
        return rawName || "Sem nome";
      };

      // Agrupar por product_name normalizado
      const grouped = new Map<string, PackageStat>();

      (purchases || []).forEach((p: any) => {
        const name = normalizePackageName(p.product_name);
        if (!grouped.has(name)) {
          grouped.set(name, {
            product_name: name,
            total_purchases: 0,
            paid_purchases: 0,
            pending_purchases: 0,
            total_credits: 0,
            total_revenue: 0,
            pending_revenue: 0,
            unique_stores: 0,
          });
        }
        const stat = grouped.get(name)!;
        stat.total_purchases += 1;
        stat.total_credits += (p.credits_granted || 0);

        if (p.status === "paid") {
          stat.paid_purchases += 1;
          stat.total_revenue += Number(p.amount_paid || 0);
        } else {
          stat.pending_purchases += 1;
          stat.pending_revenue += Number(p.amount_paid || 0);
        }
      });

      // Contar stores únicas por pacote normalizado
      const storesByPackage = new Map<string, Set<string>>();
      (purchases || []).forEach((p: any) => {
        const name = normalizePackageName(p.product_name);
        if (!storesByPackage.has(name)) storesByPackage.set(name, new Set());
        if (p.store_id) storesByPackage.get(name)!.add(p.store_id);
      });

      storesByPackage.forEach((stores, name) => {
        const stat = grouped.get(name);
        if (stat) stat.unique_stores = stores.size;
      });

      const result = Array.from(grouped.values()).sort(
        (a, b) => b.total_purchases - a.total_purchases
      );

      // Totais globais
      const totalPurchases = result.reduce((s, r) => s + r.total_purchases, 0);
      const totalPaid = result.reduce((s, r) => s + r.paid_purchases, 0);
      const totalPending = result.reduce((s, r) => s + r.pending_purchases, 0);
      const totalRevenue = result.reduce((s, r) => s + r.total_revenue, 0);
      const totalPendingRevenue = result.reduce((s, r) => s + r.pending_revenue, 0);
      const totalCredits = result.reduce((s, r) => s + r.total_credits, 0);
      const allStores = new Set((purchases || []).map((p: any) => p.store_id).filter(Boolean));

      return {
        packages: result,
        totalPurchases,
        totalPaid,
        totalPending,
        totalRevenue,
        totalPendingRevenue,
        totalCredits,
        uniqueStores: allStores.size,
      };
    },
    staleTime: 9_000,
    refetchInterval: 9_000,
  });

  const formatBRL = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Package className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold tracking-tight text-gray-900">
          Entrada de dinheiro — Compra de Pacotes de Crédito (Lojistas)
        </h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Valores recebidos das lojas em pagamentos de pacotes de crédito (créditos usados para pagar motoboys).
      </p>

      {/* KPI resumo */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card className="shadow-md border-primary/20">
          <CardHeader className="pb-1">
            <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
              <ShoppingCart className="h-3 w-3" />
              Total Compras
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <span className="text-3xl font-black text-gray-900 tabular-nums">
                {stats?.totalPurchases ?? 0}
              </span>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-md border-emerald-500/20">
          <CardHeader className="pb-1">
            <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Dinheiro Recebido
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <span className="text-2xl font-black text-gray-900 tabular-nums">
                  {formatBRL(stats?.totalRevenue ?? 0)}
                </span>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {stats?.totalPaid ?? 0} compras confirmadas
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-md border-amber-500/20">
          <CardHeader className="pb-1">
            <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
              <Clock className="h-3 w-3 text-amber-500" />
              A Receber (pendente)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <span className="text-2xl font-black text-gray-900 tabular-nums">
                  {formatBRL(stats?.totalPendingRevenue ?? 0)}
                </span>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {stats?.totalPending ?? 0} aguardando pagamento
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader className="pb-1">
            <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
              <CreditCard className="h-3 w-3" />
              Entrada Total (Pago + Pendente)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <span className="text-2xl font-black text-gray-900 tabular-nums">
                {formatBRL((stats?.totalRevenue ?? 0) + (stats?.totalPendingRevenue ?? 0))}
              </span>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader className="pb-1">
            <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Créditos Vendidos (para motoboy)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <span className="text-2xl font-black text-gray-900 tabular-nums">
                {stats?.totalCredits?.toLocaleString("pt-BR") ?? 0}
              </span>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader className="pb-1">
            <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
              <Users className="h-3 w-3" />
              Lojas Compradoras
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <span className="text-2xl font-black text-gray-900 tabular-nums">
                {stats?.uniqueStores ?? 0}
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cards por pacote */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2 text-gray-900">
              <Package className="h-5 w-5 text-primary" />
              Detalhamento por Pacote
            </CardTitle>
            {!isLoading && stats && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-50 border border-emerald-200">
                <span className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold">
                  Dinheiro recebido (pacotes pagos)
                </span>
                <span className="text-base font-black text-emerald-700 tabular-nums">
                  {formatBRL(stats.totalRevenue)}
                </span>
                <span className="text-[10px] text-emerald-600/80">
                  ({stats.totalPaid} compras confirmadas)
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : stats?.packages && stats.packages.length > 0 ? (
            <div className="space-y-3">
              {stats.packages.map((pkg, idx) => {
                const pct =
                  stats.totalPurchases > 0
                    ? ((pkg.total_purchases / stats.totalPurchases) * 100).toFixed(1)
                    : "0";
                return (
                  <div
                    key={pkg.product_name}
                    className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors space-y-3"
                  >
                    {/* Header: ranking + nome + badge */}
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-black text-gray-900 w-7 text-right tabular-nums shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-gray-900 truncate">{pkg.product_name}</span>
                      {idx === 0 && (
                        <Badge className="bg-amber-500 text-white border-0 text-[10px] shrink-0 font-bold">
                          Mais Vendido
                        </Badge>
                      )}
                      <Badge className="text-xs ml-auto shrink-0 bg-emerald-700 text-white border-0 font-black px-2.5 py-1">
                        {pct}%
                      </Badge>
                    </div>

                    {/* Barra de progresso */}
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${Math.min(parseFloat(pct), 100)}%`,
                        }}
                      />
                    </div>

                    {/* Métricas em grid responsivo */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                      <div className="text-center p-2 rounded-md bg-muted/30">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Vendas</p>
                        <p className="font-bold tabular-nums text-gray-900" style={{ color: '#111' }}>{pkg.total_purchases}</p>
                      </div>
                      <div className="text-center p-2 rounded-md bg-muted/30">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Pago</p>
                        <p className="font-bold tabular-nums text-gray-900" style={{ color: '#111' }}>
                          {formatBRL(pkg.total_revenue)}
                        </p>
                      </div>
                      <div className="text-center p-2 rounded-md bg-muted/30">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Pendente</p>
                        <p className="font-bold tabular-nums text-gray-900" style={{ color: '#111' }}>
                          {formatBRL(pkg.pending_revenue)}
                        </p>
                      </div>
                      <div className="text-center p-2 rounded-md bg-muted/30">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Créditos</p>
                        <p className="font-bold tabular-nums text-gray-900" style={{ color: '#111' }}>
                          {pkg.total_credits.toLocaleString("pt-BR")}
                        </p>
                      </div>
                      <div className="text-center p-2 rounded-md bg-muted/30">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Lojas</p>
                        <p className="font-bold tabular-nums text-gray-900" style={{ color: '#111' }}>
                          {pkg.unique_stores}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8 text-gray-600">
              Nenhuma compra de pacote encontrada
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
