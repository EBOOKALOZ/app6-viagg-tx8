import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Percent,
  Loader2, 
  Calendar,
  User,
  Store,
  FileText
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

type DateFilter = "today" | "7days" | "30days" | "custom";

const AdminFinanceReports = () => {
  const [dateFilter, setDateFilter] = useState<DateFilter>("30days");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  const getDateRange = () => {
    const now = new Date();
    let start: Date;
    let end: Date = endOfDay(now);

    switch (dateFilter) {
      case "today":
        start = startOfDay(now);
        break;
      case "7days":
        start = startOfDay(subDays(now, 7));
        break;
      case "30days":
        start = startOfDay(subDays(now, 30));
        break;
      case "custom":
        start = customStartDate ? startOfDay(new Date(customStartDate)) : startOfDay(subDays(now, 30));
        end = customEndDate ? endOfDay(new Date(customEndDate)) : endOfDay(now);
        break;
      default:
        start = startOfDay(subDays(now, 30));
    }

    return { start, end };
  };

  const { start, end } = getDateRange();

  // Summary data
  const { data: summaryData, isLoading: isLoadingSummary } = useQuery({
    queryKey: ["admin-finance-summary", dateFilter, customStartDate, customEndDate],
    queryFn: async () => {
      // Total received from merchants
      const { data: merchantTransactions } = await supabase
        .from("merchant_wallet_transactions")
        .select("valor, tipo")
        .in("tipo", ["recarga"])
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      const totalReceivedFromMerchants = merchantTransactions?.reduce(
        (acc, t) => acc + Number(t.valor),
        0
      ) || 0;

      // Total paid to motoboys
      const { data: motoboyPayments } = await supabase
        .from("motoboy_wallet_transactions")
        .select("valor, tipo")
        .eq("tipo", "saque")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      const totalPaidToMotoboys = Math.abs(
        motoboyPayments?.reduce((acc, t) => acc + Number(t.valor), 0) || 0
      );

      // Platform fees from delivery_history
      const { data: deliveryHistory } = await supabase
        .from("delivery_history")
        .select("taxa_plataforma, valor_bruto, valor_liquido")
        .gte("finalizada_em", start.toISOString())
        .lte("finalizada_em", end.toISOString());

      const totalPlatformFees = deliveryHistory?.reduce(
        (acc, d) => acc + Number(d.taxa_plataforma || 0),
        0
      ) || 0;

      const totalDeliveryValue = deliveryHistory?.reduce(
        (acc, d) => acc + Number(d.valor_bruto || 0),
        0
      ) || 0;

      // Net profit: platform fees are the profit
      const netProfit = totalPlatformFees;

      return {
        totalReceivedFromMerchants,
        totalPaidToMotoboys,
        totalPlatformFees,
        totalDeliveryValue,
        netProfit,
        deliveryCount: deliveryHistory?.length || 0,
      };
    },
  });

  // Motoboy report
  const { data: motoboyReport, isLoading: isLoadingMotoboy } = useQuery({
    queryKey: ["admin-motoboy-report", dateFilter, customStartDate, customEndDate],
    queryFn: async () => {
      // Get all motoboy profiles
      const { data: profiles } = await supabase
        .from("motoboy_profiles")
        .select("user_id");

      if (!profiles) return [];

      const userIds = profiles.map((p) => p.user_id);

      // Get profiles names
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", userIds);

      // Get delivery history for each motoboy
      const { data: deliveries } = await supabase
        .from("delivery_history")
        .select("motoboy_id, valor_bruto, valor_liquido, taxa_plataforma")
        .in("motoboy_id", userIds)
        .gte("finalizada_em", start.toISOString())
        .lte("finalizada_em", end.toISOString());

      // Get payments made
      const { data: payments } = await supabase
        .from("motoboy_wallet_transactions")
        .select("user_id, valor, tipo")
        .in("user_id", userIds)
        .eq("tipo", "saque")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      // Get current balances
      const balancePromises = userIds.map(async (userId) => {
        const { data: balanceData } = await supabase.rpc("get_motoboy_wallet_balance", {
          _user_id: userId,
        });
        return {
          user_id: userId,
          balance: balanceData?.[0] || { saldo_total: 0 },
        };
      });

      const balances = await Promise.all(balancePromises);

      return userIds.map((userId) => {
        const profile = profilesData?.find((p) => p.id === userId);
        const userDeliveries = deliveries?.filter((d) => d.motoboy_id === userId) || [];
        const userPayments = payments?.filter((p) => p.user_id === userId) || [];
        const balanceInfo = balances.find((b) => b.user_id === userId);

        const totalEarned = userDeliveries.reduce((acc, d) => acc + Number(d.valor_liquido || 0), 0);
        const totalPaid = Math.abs(userPayments.reduce((acc, p) => acc + Number(p.valor), 0));
        const currentBalance = Number(balanceInfo?.balance?.saldo_total) || 0;

        return {
          user_id: userId,
          name: profile?.name || "Sem nome",
          email: profile?.email || "",
          total_deliveries: userDeliveries.length,
          total_earned: totalEarned,
          total_paid: totalPaid,
          pending_balance: currentBalance,
        };
      }).filter((m) => m.total_deliveries > 0 || m.pending_balance > 0)
        .sort((a, b) => b.total_earned - a.total_earned);
    },
  });

  // Merchant report
  const { data: merchantReport, isLoading: isLoadingMerchant } = useQuery({
    queryKey: ["admin-merchant-report", dateFilter, customStartDate, customEndDate],
    queryFn: async () => {
      // Get all merchant stores
      const { data: stores } = await supabase
        .from("merchant_stores")
        .select("user_id, nome_loja");

      if (!stores) return [];

      const userIds = stores.map((s) => s.user_id);

      // Get merchant wallet transactions
      const { data: transactions } = await supabase
        .from("merchant_wallet_transactions")
        .select("user_id, tipo, valor")
        .in("user_id", userIds)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      // Get delivery orders for each merchant from service_orders
      const { data: orders } = await supabase
        .from("service_orders")
        .select("merchant_id, id, total_price")
        .in("merchant_id", userIds)
        .eq("service_type", "delivery")
        .eq("status", "completed")
        .gte("updated_at", start.toISOString())
        .lte("updated_at", end.toISOString());

      // Get delivery history for platform fees
      const orderIds = orders?.map((o) => o.id) || [];
      const { data: historyData } = await supabase
        .from("delivery_history")
        .select("delivery_order_id, taxa_plataforma")
        .in("delivery_order_id", orderIds);

      return userIds.map((userId) => {
        const store = stores.find((s) => s.user_id === userId);
        const userTransactions = transactions?.filter((t) => t.user_id === userId) || [];
        const userOrders = orders?.filter((o) => o.merchant_id === userId) || [];
        const userHistory = historyData?.filter((h) => 
          userOrders.some((o) => o.id === h.delivery_order_id)
        ) || [];

        const totalRecargas = userTransactions
          .filter((t) => t.tipo === "recarga")
          .reduce((acc, t) => acc + Number(t.valor), 0);
        
        const totalGastos = Math.abs(
          userTransactions
            .filter((t) => t.tipo === "pagamento_entrega")
            .reduce((acc, t) => acc + Number(t.valor), 0)
        );

        const platformFees = userHistory.reduce((acc, h) => acc + Number(h.taxa_plataforma || 0), 0);

        return {
          user_id: userId,
          store_name: store?.nome_loja || "Sem nome",
          total_billed: totalGastos,
          total_paid: totalRecargas,
          platform_fees: platformFees,
          delivery_count: userOrders.length,
        };
      }).filter((m) => m.delivery_count > 0 || m.total_paid > 0)
        .sort((a, b) => b.total_billed - a.total_billed);
    },
  });

  // Delivery audit report
  const { data: deliveryReport, isLoading: isLoadingDelivery } = useQuery({
    queryKey: ["admin-delivery-report", dateFilter, customStartDate, customEndDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("delivery_history")
        .select(`
          id,
          delivery_order_id,
          loja_nome,
          motoboy_nome,
          valor_bruto,
          taxa_plataforma,
          valor_liquido,
          status,
          finalizada_em
        `)
        .gte("finalizada_em", start.toISOString())
        .lte("finalizada_em", end.toISOString())
        .order("finalizada_em", { ascending: false })
        .limit(100);

      return data || [];
    },
  });

  const getFilterLabel = () => {
    switch (dateFilter) {
      case "today": return "Hoje";
      case "7days": return "Últimos 7 dias";
      case "30days": return "Últimos 30 dias";
      case "custom": return "Personalizado";
    }
  };

  return (
    <div className="space-y-6">
      {/* Date Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Período do Relatório
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Filtro</label>
              <Select value={dateFilter} onValueChange={(v: DateFilter) => setDateFilter(v)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="7days">Últimos 7 dias</SelectItem>
                  <SelectItem value="30days">Últimos 30 dias</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {dateFilter === "custom" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Data Início</label>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-40"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Data Fim</label>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-40"
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Recebido de Lojistas</p>
                {isLoadingSummary ? (
                  <Loader2 className="h-4 w-4 animate-spin mt-2" />
                ) : (
                  <p className="text-2xl font-bold text-green-600">
                    R$ {(summaryData?.totalReceivedFromMerchants || 0).toFixed(2)}
                  </p>
                )}
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pago aos Motoboys</p>
                {isLoadingSummary ? (
                  <Loader2 className="h-4 w-4 animate-spin mt-2" />
                ) : (
                  <p className="text-2xl font-bold text-red-600">
                    R$ {(summaryData?.totalPaidToMotoboys || 0).toFixed(2)}
                  </p>
                )}
              </div>
              <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <TrendingDown className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxas da Plataforma</p>
                {isLoadingSummary ? (
                  <Loader2 className="h-4 w-4 animate-spin mt-2" />
                ) : (
                  <p className="text-2xl font-bold text-primary">
                    R$ {(summaryData?.totalPlatformFees || 0).toFixed(2)}
                  </p>
                )}
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Percent className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-80">Lucro Líquido</p>
                {isLoadingSummary ? (
                  <Loader2 className="h-4 w-4 animate-spin mt-2" />
                ) : (
                  <p className="text-2xl font-bold">
                    R$ {(summaryData?.netProfit || 0).toFixed(2)}
                  </p>
                )}
              </div>
              <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                <DollarSign className="h-6 w-6" />
              </div>
            </div>
            <p className="text-xs opacity-70 mt-2">
              {summaryData?.deliveryCount || 0} entregas no período
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Report Tabs */}
      <Tabs defaultValue="motoboys" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="motoboys" className="gap-2">
            <User className="h-4 w-4" />
            Por Motoboy
          </TabsTrigger>
          <TabsTrigger value="merchants" className="gap-2">
            <Store className="h-4 w-4" />
            Por Lojista
          </TabsTrigger>
          <TabsTrigger value="deliveries" className="gap-2">
            <FileText className="h-4 w-4" />
            Por Entrega
          </TabsTrigger>
        </TabsList>

        {/* Motoboy Report */}
        <TabsContent value="motoboys">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Relatório por Motoboy</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingMotoboy ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : motoboyReport && motoboyReport.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Motoboy</TableHead>
                        <TableHead className="text-right">Entregas</TableHead>
                        <TableHead className="text-right">Total Ganho</TableHead>
                        <TableHead className="text-right">Total Pago</TableHead>
                        <TableHead className="text-right">Saldo Pendente</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {motoboyReport.map((motoboy) => (
                        <TableRow key={motoboy.user_id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{motoboy.name}</p>
                              <p className="text-xs text-muted-foreground">{motoboy.email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline">{motoboy.total_deliveries}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-green-600">
                            R$ {motoboy.total_earned.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-red-600">
                            R$ {motoboy.total_paid.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-mono font-bold ${motoboy.pending_balance > 0 ? "text-yellow-600" : "text-muted-foreground"}`}>
                              R$ {motoboy.pending_balance.toFixed(2)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  Nenhum dado disponível para o período selecionado.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Merchant Report */}
        <TabsContent value="merchants">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Relatório por Lojista</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingMerchant ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : merchantReport && merchantReport.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Loja</TableHead>
                        <TableHead className="text-right">Entregas</TableHead>
                        <TableHead className="text-right">Total Faturado</TableHead>
                        <TableHead className="text-right">Total Pago</TableHead>
                        <TableHead className="text-right">Taxa do App</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {merchantReport.map((merchant) => (
                        <TableRow key={merchant.user_id}>
                          <TableCell>
                            <p className="font-medium">{merchant.store_name}</p>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline">{merchant.delivery_count}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-amber-600">
                            R$ {merchant.total_billed.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-green-600">
                            R$ {merchant.total_paid.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-primary">
                            R$ {merchant.platform_fees.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  Nenhum dado disponível para o período selecionado.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Delivery Audit Report */}
        <TabsContent value="deliveries">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Auditoria de Entregas</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingDelivery ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : deliveryReport && deliveryReport.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Loja</TableHead>
                        <TableHead>Motoboy</TableHead>
                        <TableHead className="text-right">Valor Total</TableHead>
                        <TableHead className="text-right">Taxa</TableHead>
                        <TableHead className="text-right">Valor Líquido</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliveryReport.map((delivery) => (
                        <TableRow key={delivery.id}>
                          <TableCell className="font-mono text-xs">
                            {delivery.delivery_order_id?.slice(0, 8)}...
                          </TableCell>
                          <TableCell className="text-xs">
                            {delivery.finalizada_em
                              ? format(new Date(delivery.finalizada_em), "dd/MM/yy HH:mm", { locale: ptBR })
                              : "-"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {delivery.loja_nome || "-"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {delivery.motoboy_nome || "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            R$ {(Number(delivery.valor_bruto) || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-primary">
                            R$ {(Number(delivery.taxa_plataforma) || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-green-600">
                            R$ {(Number(delivery.valor_liquido) || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline" 
                              className={
                                delivery.status === "finalizada" 
                                  ? "bg-green-100 text-green-700 border-green-300" 
                                  : "bg-yellow-100 text-yellow-700 border-yellow-300"
                              }
                            >
                              {delivery.status || "Pendente"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  Nenhuma entrega encontrada para o período selecionado.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminFinanceReports;
