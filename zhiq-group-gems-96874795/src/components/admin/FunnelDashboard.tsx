import { useConversionFunnel, FunnelMetrics } from "@/hooks/useAdminMarketplaceAnalytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Eye, Store, MousePointer2, ShoppingCart, CheckCircle, MessageSquare,
  ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, FunnelChart, Funnel, LabelList, AreaChart, Area } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  funnelData: ReturnType<useConversionFunnel>;
}

export function FunnelDashboard({ funnelData }: Props) {
  const { summary, daily, byStore, byProduct, byCategory, hourly, productQuestions, gaps, isLoading } = funnelData;

  const funnelChartData = summary ? [
    { name: 'Visualizações', value: summary.total_product_views, fill: '#3b82f6' },
    { name: 'Entradas na Loja', value: summary.total_store_entries, fill: '#10b981' },
    { name: 'Cliques na Loja', value: summary.total_in_store_clicks, fill: '#f59e0b' },
    { name: 'Cliques em Comprar', value: summary.total_buy_clicks, fill: '#ef4444' },
    { name: 'Pedidos Finalizados', value: summary.total_orders_finished, fill: '#8b5cf6' },
    { name: 'Perguntas', value: summary.total_product_questions, fill: '#06b6d4' },
  ].filter(d => d.value > 0) : [];

  if (isLoading || !summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}><CardHeader><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-16 mt-2" /></CardHeader></Card>
          ))}
        </div>
        <Card><CardContent><Skeleton className="h-80 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <FunnelMetricCard title="Visualizações" value={summary.total_product_views} icon={<Eye className="w-4 h-4" />} color="blue" />
        <FunnelMetricCard title="Entradas na Loja" value={summary.total_store_entries} rate={`${summary.view_to_store_rate}%`} sublabel="conv. view→loja" icon={<Store className="w-4 h-4" />} color="emerald" />
        <FunnelMetricCard title="Cliques na Loja" value={summary.total_in_store_clicks} rate={`${summary.store_to_product_rate}%`} sublabel="conv. loja→produto" icon={<MousePointer2 className="w-4 h-4" />} color="amber" />
        <FunnelMetricCard title="Cliques em Comprar" value={summary.total_buy_clicks} rate={`${summary.product_to_buy_rate}%`} sublabel="conv. produto→compra" icon={<ShoppingCart className="w-4 h-4" />} color="red" />
        <FunnelMetricCard title="Pedidos Finalizados" value={summary.total_orders_finished} rate={`${summary.buy_to_order_rate}%`} sublabel="conv. compra→pedido" icon={<CheckCircle className="w-4 h-4" />} color="violet" />
        <FunnelMetricCard title="Perguntas (Leads)" value={summary.total_product_questions} icon={<MessageSquare className="w-4 h-4" />} color="cyan" />
      </div>

      {/* FUNIL VISUAL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Funil de Conversão</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <Tooltip />
                  <Funnel dataKey="value" data={funnelChartData} isAnimationActive animationDuration={800}>
                    <LabelList position="inside" fill="#fff" stroke="none" dataKey="name" fontSize={12} />
                    <LabelList position="right" fill="#666" dataKey="value" fontSize={12} />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Taxas de Conversão */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Taxas de Conversão</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <ConversionRateRow label="View → Entrada na Loja" rate={summary.view_to_store_rate} from={summary.total_product_views} to={summary.total_store_entries} />
              <ConversionRateRow label="Loja → Produto" rate={summary.store_to_product_rate} from={summary.total_store_entries} to={summary.total_in_store_clicks} />
              <ConversionRateRow label="Produto → Clique Comprar" rate={summary.product_to_buy_rate} from={summary.total_in_store_clicks} to={summary.total_buy_clicks} />
              <ConversionRateRow label="Comprar → Pedido Finalizado" rate={summary.buy_to_order_rate} from={summary.total_buy_clicks} to={summary.total_orders_finished} />
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-zinc-600">Conversão Total (View → Pedido)</span>
                  <Badge className="text-sm font-bold bg-indigo-100 text-indigo-700">{summary.overall_conversion_rate}%</Badge>
                </div>
                <div className="text-xs text-zinc-500 text-right">
                  {summary.total_product_views.toLocaleString()} visualizações → {summary.total_orders_finished.toLocaleString()} pedidos
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* TENDÊNCIA DIÁRIA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Tendência do Funil — Últimos 30 Dias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily.map(d => ({
                date: new Date(d.funnel_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                views: d.product_views,
                stores: d.store_entries,
                buyClicks: d.buy_clicks,
                orders: d.orders_finished,
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="views" stroke="#3b82f6" fill="#93c5fd" name="Visualizações" stackId="1" />
                <Area type="monotone" dataKey="stores" stroke="#10b981" fill="#a7f3d0" name="Entradas Loja" stackId="1" />
                <Area type="monotone" dataKey="buyClicks" stroke="#f59e0b" fill="#fde68a" name="Cliques Comprar" stackId="1" />
                <Area type="monotone" dataKey="orders" stroke="#8b5cf6" fill="#ddd6fe" name="Pedidos" stackId="1" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* INSIGHTS GAPS (se houver) */}
      {gaps.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">Insights — Gaps de Conversão</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {gaps.slice(0, 5).map((gap, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-white/70 rounded-xl border border-amber-100">
                  <div className="mt-0.5">
                    {gap.drop_percent > 50 ? <ArrowDownRight className="w-5 h-5 text-red-500" /> : <ArrowUpRight className="w-5 h-5 text-amber-600" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{gap.entity_name}</div>
                    <div className="text-xs text-zinc-600">
                      {gap.gap_type === 'high_view_low_conversion'
                        ? `Alto volume de views (${gap.product_views}) mas baixa conversão. Apenas ${gap.buy_clicks} cliques em comprar.`
                        : `Vendas iniciais mas sem finalização: ${gap.buy_clicks} cliques → 0 pedidos.`}
                    </div>
                    <Badge variant="outline" className="mt-1 text-[10px]">Drop: {gap.drop_percent.toFixed(1)}%</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FunnelMetricCard({ title, value, rate, sublabel, icon, color }: {
  title: string;
  value: number;
  rate?: string | null;
  sublabel?: string;
  icon: React.ReactNode;
  color: 'blue' | 'emerald' | 'amber' | 'red' | 'violet' | 'cyan';
}) {
  const colorClasses = {
    blue: "from-blue-50 to-blue-100/50 border-blue-200 text-blue-600",
    emerald: "from-emerald-50 to-emerald-100/50 border-emerald-200 text-emerald-600",
    amber: "from-amber-50 to-amber-100/50 border-amber-200 text-amber-600",
    red: "from-rose-50 to-rose-100/50 border-rose-200 text-rose-600",
    violet: "from-violet-50 to-violet-100/50 border-violet-200 text-violet-600",
    cyan: "from-cyan-50 to-cyan-100/50 border-cyan-200 text-cyan-600",
  };

  const badgeColor = {
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-rose-100 text-rose-700",
    violet: "bg-violet-100 text-violet-700",
    cyan: "bg-cyan-100 text-cyan-700",
  };

  return (
    <Card className={cn("bg-gradient-to-br", colorClasses[color])}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-black">{value.toLocaleString()}</div>
        {rate && (
          <div className="mt-2">
            <Badge className={cn("text-[10px] font-bold", badgeColor[color])}>
              Taxa: {rate}
            </Badge>
          </div>
        )}
        {sublabel && <p className="text-[10px] text-zinc-500 font-bold mt-1">{sublabel}</p>}
      </CardContent>
    </Card>
  );
}

function ConversionRateRow({ label, rate, from, to }: { label: string; rate: number; from: number; to: number }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div className="text-sm text-zinc-600">{label}</div>
      <div className="flex items-center gap-3">
        <div className="text-xs text-zinc-400 font-mono">
          {from.toLocaleString()} → {to.toLocaleString()}
        </div>
        <Badge variant={rate >= 10 ? "default" : "secondary"} className="font-mono text-xs">
          {rate.toFixed(1)}%
        </Badge>
      </div>
    </div>
  );
}
