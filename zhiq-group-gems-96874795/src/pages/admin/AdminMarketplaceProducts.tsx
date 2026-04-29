import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, supabaseAdmin } from "@/integrations/supabase/client";
import { AdminCreditsPackages } from "@/components/admin/credits/AdminCreditsPackages";
import { useAdminCredits, AdminCreditProduct } from "@/hooks/useAdminCredits";
import { 
  Loader2, Coins, RefreshCw, TrendingUp, ShoppingBag, Store, 
  BarChart3, PieChart, Clock, CalendarDays, DollarSign, Users,
  ArrowUpRight, ArrowDownRight, CheckCircle2, Zap, Star,
  MousePointer2, Eye, ShoppingCart, MessageSquare, Target,
  Filter, ChevronDown, Activity
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatCurrencyBRL } from "@/lib/utils";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart as RechartsPie, Pie, Cell, AreaChart, Area, FunnelChart, Funnel, LabelList
} from "recharts";
import {
  usePackageSalesDaily,
  usePackageSalesSummary,
  useStoreCreditUsage,
  useHourlyCreditUsage,
  useTopStoresCreditUsage,
  useCategoryCreditUsage,
  useWeekdaySales
} from "@/hooks/useAdminMarketplaceAnalytics";
import { useConversionFunnel } from "@/hooks/useConversionFunnel";
import { FunnelDashboard } from "@/components/admin/FunnelDashboard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-picker";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";

// Custom hook merging admin credits data
function useMarketplaceProductsData() {
  const adminData = useAdminCredits();
  const salesSummary = usePackageSalesSummary();
  const salesDaily = usePackageSalesDaily();
  const storeUsage = useStoreCreditUsage();
  const hourlyUsage = useHourlyCreditUsage();
  const topStores = useTopStoresCreditUsage();
  const categoryUsage = useCategoryCreditUsage();
  const weekdaySales = useWeekdaySales();

  return {
    ...adminData,
    salesSummary: salesSummary.data || [],
    salesDaily: salesDaily.data || [],
    storeUsage: storeUsage.data || [],
    hourlyUsage: hourlyUsage.data || [],
    topStores: topStores.data || [],
    categoryUsage: categoryUsage.data || [],
    weekdaySales: weekdaySales.data || [],
    isLoading: adminData.isLoading || salesSummary.isLoading || salesDaily.isLoading,
    refetchAll: () => {
      adminData.refetch();
      salesSummary.refetch();
      salesDaily.refetch();
      storeUsage.refetch();
      hourlyUsage.refetch();
      topStores.refetch();
      categoryUsage.refetch();
      weekdaySales.refetch();
    }
  };
}

export default function AdminMarketplaceProducts() {
  const data = useMarketplaceProductsData();
  const funnelData = useConversionFunnel();
  const [activeTab, setActiveTab] = useState("packages");

  // Computed metrics
  const totalRevenue = data.salesSummary.reduce((sum, s) => sum + (s.total_revenue_cents || 0), 0);
  const totalCreditsSold = data.salesSummary.reduce((sum, s) => sum + (s.total_credits_sold || 0), 0);
  const totalOrders = data.salesSummary.reduce((sum, s) => sum + (s.total_sales || 0), 0);
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders / 100 : 0; // convert cents to BRL
  
  // Top package by sales
  const topPackage = [...data.salesSummary].sort((a, b) => (b.total_sales || 0) - (a.total_sales || 0))[0];

  const getGrowthArrow = (current: number, previous: number) => {
    if (!previous) return <span className="text-zinc-400">—</span>;
    const pct = ((current - previous) / previous * 100).toFixed(1);
    const isUp = current >= previous;
    return (
      <span className={isUp ? "text-emerald-600" : "text-red-500"}>
        {isUp ? <ArrowUpRight className="w-4 h-4 inline" /> : <ArrowDownRight className="w-4 h-4 inline" />}
        {Math.abs(Number(pct))}%
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
            <ShoppingBag className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "hsl(var(--admin-card-foreground, var(--foreground)))" }}>
              Pacotes de Créditos — Marketplace
            </h1>
            <p className="text-sm" style={{ color: "hsl(var(--admin-muted-foreground, var(--muted-foreground)))" }}>
              CRUD completo + analytics de vendas, uso e lojistas
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => data.refetchAll()} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar Tudo
        </Button>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-blue-600">Receita Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-blue-900">{formatCurrencyBRL(totalRevenue / 100)}</div>
            <p className="text-[10px] text-blue-600/70 font-bold">acumulado</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-emerald-600">Créditos Vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-emerald-900">{totalCreditsSold.toLocaleString()}</div>
            <p className="text-[10px] text-emerald-600/70 font-bold">unidades</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-amber-600">Pedidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-amber-900">{totalOrders}</div>
            <p className="text-[10px] text-amber-600/70 font-bold">compras</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-violet-50 to-violet-100/50 border-violet-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-violet-600">Ticket Médio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-violet-900">{formatCurrencyBRL(avgTicket)}</div>
            <p className="text-[10px] text-violet-600/70 font-bold">por pedido</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-rose-50 to-rose-100/50 border-rose-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-rose-600">Mais Vendido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-black text-rose-900 truncate" title={topPackage?.name}>
              {topPackage?.name || "—"}
            </div>
            <p className="text-[10px] text-rose-600/70 font-bold">{topPackage?.total_sales || 0} vendas</p>
          </CardContent>
        </Card>
      </div>

      {/* MAIN TABS */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-7 h-auto p-1 bg-muted/50 rounded-xl">
          <TabsTrigger value="packages" className="py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">
            <ShoppingBag className="w-4 h-4 mr-2" /> Pacotes
          </TabsTrigger>
          <TabsTrigger value="sales" className="py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">
            <BarChart3 className="w-4 h-4 mr-2" /> Vendas
          </TabsTrigger>
          <TabsTrigger value="usage" className="py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">
            <Zap className="w-4 h-4 mr-2" /> Uso
          </TabsTrigger>
          <TabsTrigger value="stores" className="py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">
            <Store className="w-4 h-4 mr-2" /> Lojas
          </TabsTrigger>
          <TabsTrigger value="categories" className="py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">
            <PieChart className="w-4 h-4 mr-2" /> Categorias
          </TabsTrigger>
          <TabsTrigger value="funnel" className="py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">
            <Activity className="w-4 h-4 mr-2" /> Funil
          </TabsTrigger>
          <TabsTrigger value="hours" className="py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">
            <Clock className="w-4 h-4 mr-2" /> Horários
          </TabsTrigger>
        </TabsList>

        {/* TAB: PACOTES (CRUD) */}
        <TabsContent value="packages">
          {data.isLoading ? (
            <div className="flex items-center justify-center min-h-[50vh] gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-muted-foreground">Carregando pacotes…</span>
            </div>
          ) : (
            <AdminCreditsPackages data={{
              products: data.products,
              toggleProduct: data.toggleProduct,
              updateProduct: data.updateProduct,
              deleteProduct: data.deleteProduct,
              createProduct: data.createProduct,
              refetch: data.refetchAll
            }} />
          )}
        </TabsContent>

        {/* TAB: VENDAS */}
        <TabsContent value="sales" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Vendas por dia */}
            <Card className="col-span-1 lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CalendarDays className="w-5 h-5 text-blue-600" /> Vendas dos Últimos 30 Dias</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.salesDaily}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="sale_date" tickFormatter={(v) => new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} />
                      <YAxis />
                      <Tooltip 
                        labelFormatter={(l) => new Date(l).toLocaleDateString('pt-BR')}
                        formatter={(v: any) => [v, '']}
                      />
                      <Area type="monotone" dataKey="total_orders" stroke="#3b82f6" fill="#93c5fd" name="Pedidos" />
                      <Area type="monotone" dataKey="total_credits_sold" stroke="#10b981" fill="#a7f3d0" name="Créditos" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Tabela de performance por pacote */}
            <Card className="col-span-1 lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-600" /> Performance por Pacote</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 font-semibold text-xs text-muted-foreground">Pacote</th>
                        <th className="text-right p-3 font-semibold text-xs text-muted-foreground">Vendas</th>
                        <th className="text-right p-3 font-semibold text-xs text-muted-foreground">Créditos Vendidos</th>
                        <th className="text-right p-3 font-semibold text-xs text-muted-foreground">Receita</th>
                        <th className="text-right p-3 font-semibold text-xs text-muted-foreground">Compradores</th>
                        <th className="text-right p-3 font-semibold text-xs text-muted-foreground">Ticket Médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.salesSummary.map((pkg) => (
                        <tr key={pkg.id} className="border-b hover:bg-muted/20">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${pkg.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                                {pkg.sort_order}
                              </span>
                              <div>
                                <div className="font-medium text-sm">{pkg.name}</div>
                                <div className="text-xs text-muted-foreground">{formatCurrencyBRL(pkg.price_brl)} • {pkg.credits_amount} créd.</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-right font-mono font-semibold">{pkg.total_sales || 0}</td>
                          <td className="p-3 text-right font-mono">{pkg.total_credits_sold || 0}</td>
                          <td className="p-3 text-right font-mono text-emerald-600 font-semibold">{formatCurrencyBRL((pkg.total_revenue_cents || 0) / 100)}</td>
                          <td className="p-3 text-right font-mono">{pkg.unique_buyers || 0}</td>
                          <td className="p-3 text-right font-mono">{formatCurrencyBRL((pkg.avg_ticket_cents || 0) / 100)}</td>
                        </tr>
                      ))}
                      {data.salesSummary.length === 0 && (
                        <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhuma venda registrada ainda</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: USO */}
        <TabsContent value="usage" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Uso por hora */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5 text-violet-600" /> Uso por Hora do Dia</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.hourlyUsage}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour_of_day" tickFormatter={(h) => `${h}h`} />
                      <YAxis />
                      <Tooltip 
                        labelFormatter={(h) => `${h}h`}
                        formatter={(v: any, name: string) => [v, name === 'credits_used' ? 'Créditos Usados' : 'Transações']}
                      />
                      <Bar dataKey="credits_used" fill="#8b5cf6" name="credits_used" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Uso por categoria */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><PieChart className="w-5 h-5 text-orange-600" /> Uso por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={data.categoryUsage}
                        dataKey="credits_consumed"
                        nameKey="category_name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ category_name, percent }) => `${category_name?.slice(0, 8)}... ${(percent * 100).toFixed(0)}%`}
                      >
                        {data.categoryUsage.map((_, idx) => (
                          <Cell key={idx} fill={["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"][idx % 5]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [v, 'Créditos']} />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Top lojas por uso */}
            <Card className="col-span-1 lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Store className="w-5 h-5 text-emerald-600" /> Lojas que Mais Consomem Créditos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left p-3 font-semibold text-xs uppercase">Loja</th>
                        <th className="text-left p-3 font-semibold text-xs uppercase">Cidade/Estado</th>
                        <th className="text-right p-3 font-semibold text-xs uppercase">Créditos Usados</th>
                        <th className="text-right p-3 font-semibold text-xs uppercase">Créditos Adquiridos</th>
                        <th className="text-right p-3 font-semibold text-xs uppercase">Saldo Atual</th>
                        <th className="text-right p-3 font-semibold text-xs uppercase">Transações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topStores.slice(0, 20).map((store) => (
                        <tr key={store.store_id} className="border-b hover:bg-muted/20">
                          <td className="p-3">
                            <div>
                              <div className="font-medium">{store.store_name}</div>
                              <div className="text-xs text-muted-foreground truncate max-w-[200px]">ID: {store.store_id.slice(0, 8)}...</div>
                            </div>
                          </td>
                          <td className="p-3 text-sm">{store.city}/{store.state}</td>
                          <td className="p-3 text-right font-mono text-red-600 font-semibold">{(store.total_used || 0).toLocaleString()}</td>
                          <td className="p-3 text-right font-mono text-emerald-600">{(store.total_purchased || 0).toLocaleString()}</td>
                          <td className="p-3 text-right font-mono font-bold">{(store.available_credits || 0).toLocaleString()}</td>
                          <td className="p-3 text-right font-mono text-muted-foreground">{store.transaction_count || 0}</td>
                        </tr>
                      ))}
                      {data.topStores.length === 0 && (
                        <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum dado de uso disponível</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: LOJAS (Busca e análise detalhada) */}
        <TabsContent value="stores" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Store className="w-5 h-5 text-blue-600" /> Relatório de Lojas — Uso de Créditos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-3 font-semibold text-xs text-muted-foreground">Loja</th>
                      <th className="text-left p-3 font-semibold text-xs text-muted-foreground">Responsável</th>
                      <th className="text-left p-3 font-semibold text-xs text-muted-foreground">Localização</th>
                      <th className="text-right p-3 font-semibold text-xs text-muted-foreground">Créditos Usados</th>
                      <th className="text-right p-3 font-semibold text-xs text-muted-foreground">Créditos Adquiridos</th>
                      <th className="text-right p-3 font-semibold text-xs text-muted-foreground">Saldo Disponível</th>
                      <th className="text-right p-3 font-semibold text-xs text-muted-foreground">Transações</th>
                      <th className="text-left p-3 font-semibold text-xs text-muted-foreground">Último Uso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.storeUsage.map((store) => (
                      <tr key={store.store_id} className="border-b hover:bg-muted/20">
                        <td className="p-3">
                          <div className="font-medium">{store.store_name}</div>
                        </td>
                        <td className="p-3 text-sm">{store.owner_name}</td>
                        <td className="p-3 text-sm">{store.city}/{store.state} {store.bairro && <span className="text-muted-foreground text-xs">• {store.bairro}</span>}</td>
                        <td className="p-3 text-right font-mono text-red-600 font-semibold">{(store.total_credits_used || 0).toLocaleString()}</td>
                        <td className="p-3 text-right font-mono text-emerald-600">{(store.total_credits_acquired || 0).toLocaleString()}</td>
                        <td className="p-3 text-right font-mono font-bold">{(store.available_credits || 0).toLocaleString()}</td>
                        <td className="p-3 text-right font-mono text-muted-foreground">{store.total_transactions || 0}</td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {store.last_usage_at ? new Date(store.last_usage_at).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))}
                    {data.storeUsage.length === 0 && (
                      <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhuma loja com uso registrado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: CATEGORIAS */}
        <TabsContent value="categories" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PieChart className="w-5 h-5 text-orange-600" /> Créditos Consumidos por Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-3 font-semibold text-xs text-muted-foreground">Categoria</th>
                      <th className="text-right p-3 font-semibold text-xs text-muted-foreground">Produtos</th>
                      <th className="text-right p-3 font-semibold text-xs text-muted-foreground">Lojas</th>
                      <th className="text-right p-3 font-semibold text-xs text-muted-foreground">Créditos Consumidos</th>
                      <th className="text-right p-3 font-semibold text-xs text-muted-foreground">% do Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.categoryUsage.map((cat) => (
                      <tr key={cat.category_id} className="border-b hover:bg-muted/20">
                        <td className="p-3 font-medium">{cat.category_name}</td>
                        <td className="p-3 text-right font-mono">{cat.products_count}</td>
                        <td className="p-3 text-right font-mono">{cat.stores_count}</td>
                        <td className="p-3 text-right font-mono text-red-600 font-semibold">{(cat.credits_consumed || 0).toLocaleString()}</td>
                        <td className="p-3 text-right font-mono">
                          <Badge variant={cat.usage_percent > 30 ? "default" : "outline"} className="font-mono">
                            {cat.usage_percent.toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {data.categoryUsage.length === 0 && (
                      <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhum consumo por categoria registrado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: FUNIL */}
        <TabsContent value="funnel" className="space-y-6">
          <FunnelDashboard funnelData={funnelData} />
        </TabsContent>

        {/* TAB: HORÁRIOS */}
        <TabsContent value="hours" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="col-span-1 lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5 text-indigo-600" /> Horários de Pico de Uso (Últimos 30 dias)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.hourlyUsage}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour_of_day" tickFormatter={(h) => `${h}h`} />
                      <YAxis />
                      <Tooltip 
                        labelFormatter={(h) => `${h} horas`}
                        formatter={(v: any, n: string) => [v, n === 'credits_used' ? 'Créditos' : 'Transações']}
                      />
                      <Bar dataKey="credits_used" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="transaction_count" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-1 lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CalendarDays className="w-5 h-5 text-emerald-600" /> Vendas por Dia da Semana</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.weekdaySales}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day_of_week" tickFormatter={(d) => ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d]} />
                      <YAxis />
                      <Tooltip formatter={(v: any) => [v, '']} />
                      <Bar dataKey="sales_count" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
