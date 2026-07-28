import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminCreditsData } from "@/hooks/useAdminCredits";
import { Badge } from "@/components/ui/badge";
import {
  Coins, TrendingUp, TrendingDown, Users, CreditCard,
  ShoppingBag, Zap, BarChart3, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#ec4899", "#06b6d4", "#84cc16"];

interface Props {
  data: AdminCreditsData;
}

export function AdminCreditsOverview({ data }: Props) {
  const { overview, ledger, billingEvents } = data;

  // Daily credits chart from ledger
  const dailyMap: Record<string, { date: string; sold: number; consumed: number }> = {};
  for (const e of ledger) {
    const day = (e.created_at || "").slice(0, 10);
    if (!day) continue;
    if (!dailyMap[day]) dailyMap[day] = { date: day, sold: 0, consumed: 0 };
    const isCredit = e.entry_type === "credit" || (e.credits > 0);
    if (isCredit) dailyMap[day].sold += Math.abs(e.credits || e.amount || 0);
    else dailyMap[day].consumed += Math.abs(e.credits || e.amount || 0);
  }
  const dailyData = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);

  // Event type distribution from billing events
  const eventTypeMap: Record<string, number> = {};
  for (const e of billingEvents) {
    eventTypeMap[e.event_type] = (eventTypeMap[e.event_type] || 0) + 1;
  }
  const eventPieData = Object.entries(eventTypeMap).map(([name, value]) => ({ name: translateEventType(name), value }));

  const kpis = [
    { label: "Créditos Vendidos", value: overview.totalCreditsSold, icon: TrendingUp, color: "from-emerald-500 to-green-600" },
    { label: "Créditos Consumidos", value: overview.totalCreditsConsumed, icon: TrendingDown, color: "from-red-500 to-rose-600" },
    { label: "Saldo Ativo Total", value: overview.totalCreditsActive, icon: Coins, color: "from-amber-500 to-orange-600" },
    { label: "Assinaturas Ativas", value: overview.activeSubscriptions, icon: CreditCard, color: "from-blue-500 to-indigo-600" },
    { label: "Lojas com Saldo", value: overview.storesWithBalance, icon: Users, color: "from-violet-500 to-purple-600" },
    { label: "Lojas sem Saldo", value: overview.storesWithoutBalance, icon: ShoppingBag, color: "from-slate-500 to-gray-600" },
    { label: "Taxa de Consumo", value: `${overview.avgConsumptionRate}%`, icon: Zap, color: "from-cyan-500 to-teal-600" },
    { label: "Eventos M1", value: billingEvents.length, icon: BarChart3, color: "from-pink-500 to-rose-600" },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="relative overflow-hidden border-0 shadow-md">
            <div className={`absolute inset-0 bg-gradient-to-br ${kpi.color} opacity-[0.08]`} />
            <CardContent className="p-4 relative">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{kpi.label}</p>
                  <p className="text-2xl font-bold tracking-tight">{typeof kpi.value === "number" ? kpi.value.toLocaleString("pt-BR") : kpi.value}</p>
                </div>
                <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${kpi.color} flex items-center justify-center shadow`}>
                  <kpi.icon className="h-4.5 w-4.5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Daily Credits Chart */}
        <Card className="shadow-md border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-amber-500" />
              Evolução Diária de Créditos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dailyData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(val: number) => val.toLocaleString("pt-BR")} />
                  <Bar dataKey="sold" name="Vendidos" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="consumed" name="Consumidos" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-60 text-muted-foreground text-sm">Sem dados no período</div>
            )}
          </CardContent>
        </Card>

        {/* Event Distribution Pie */}
        <Card className="shadow-md border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-500" />
              Distribuição de Eventos M1
            </CardTitle>
          </CardHeader>
          <CardContent>
            {eventPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={eventPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {eventPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-60 text-muted-foreground text-sm">Sem eventos registrados</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Rankings */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="shadow-md border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ArrowDownRight className="h-4 w-4 text-red-500" />
              Top Consumidores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overview.topConsumers.slice(0, 8).map((c: { store_name: string; consumed: number }, i: number) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-dashed last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                    <span className="text-sm font-medium truncate max-w-[180px]">{c.store_name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono">{c.consumed} cr</Badge>
                </div>
              ))}
              {overview.topConsumers.length === 0 && <p className="text-sm text-muted-foreground">Sem dados</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-md border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-emerald-500" />
              Maiores Saldos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overview.topBalances.slice(0, 8).map((c: { store_name: string; balance: number }, i: number) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-dashed last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                    <span className="text-sm font-medium truncate max-w-[180px]">{c.store_name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono text-emerald-600">{c.balance} cr</Badge>
                </div>
              ))}
              {overview.topBalances.length === 0 && <p className="text-sm text-muted-foreground">Sem dados</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function translateEventType(t: string) {
  const map: Record<string, string> = {
    store_view: "Entrada na Loja",
    product_click: "Clique em Produto",
    buy_click: "Clique em Comprar",
    purchase_completed: "Compra Concluída",
  };
  return map[t] || t;
}
