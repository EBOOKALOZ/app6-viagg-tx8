import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Zap } from "lucide-react";
import type { AdminBillingEvent, AdminCreditsData } from "@/hooks/useAdminCredits";

const COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#ec4899"];
const EVENT_LABELS: Record<string, string> = {
  store_view: "Entrada na Loja",
  product_click: "Visualização de Produto",
  buy_click: "Clique em Comprar",
  purchase_completed: "Compra Concluída",
};

interface Props { data: AdminCreditsData; }

export function AdminCreditsEvents({ data }: Props) {
  const { billingEvents } = data;

  // Group by event type
  const byType = useMemo(() => {
    const map: Record<string, { count: number; total_cents: number }> = {};
    for (const e of billingEvents) {
      if (!map[e.event_type]) map[e.event_type] = { count: 0, total_cents: 0 };
      map[e.event_type].count++;
      map[e.event_type].total_cents += e.charge_amount_cents || 0;
    }
    return Object.entries(map).map(([type, d]) => ({
      type, label: EVENT_LABELS[type] || type, ...d, total_brl: (d.total_cents / 100).toFixed(2),
    }));
  }, [billingEvents]);

  // Daily chart
  const dailyData = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const e of billingEvents) {
      const day = (e.created_at || "").slice(0, 10);
      if (!day) continue;
      if (!map[day]) map[day] = {};
      map[day][e.event_type] = (map[day][e.event_type] || 0) + 1;
    }
    return Object.entries(map).sort().slice(-30).map(([date, types]) => ({ date, ...types }));
  }, [billingEvents]);

  // By store
  const byStore = useMemo(() => {
    const map: Record<string, { store_name: string; count: number; cents: number }> = {};
    for (const e of billingEvents) {
      if (!map[e.merchant_store_id]) map[e.merchant_store_id] = { store_name: e.store_name || "—", count: 0, cents: 0 };
      map[e.merchant_store_id].count++;
      map[e.merchant_store_id].cents += e.charge_amount_cents || 0;
    }
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [billingEvents]);

  const pieData = byType.map(t => ({ name: t.label, value: t.count }));

  return (
    <div className="space-y-4">
      {/* Type Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {byType.map((t) => (
          <Card key={t.type} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">{t.label}</p>
              <p className="text-2xl font-bold mt-1">{t.count.toLocaleString("pt-BR")}</p>
              <p className="text-xs text-emerald-600 font-mono mt-0.5">R$ {t.total_brl}</p>
            </CardContent>
          </Card>
        ))}
        {byType.length === 0 && (
          <Card className="col-span-4 border-0 shadow-sm">
            <CardContent className="p-8 text-center text-muted-foreground">Sem eventos registrados</CardContent>
          </Card>
        )}
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="shadow-md border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Consumo Diário por Tipo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dailyData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="store_view" name="Entrada" fill="#f59e0b" stackId="a" />
                  <Bar dataKey="product_click" name="Produto" fill="#3b82f6" stackId="a" />
                  <Bar dataKey="buy_click" name="Comprar" fill="#10b981" stackId="a" />
                  <Bar dataKey="purchase_completed" name="Compra" fill="#8b5cf6" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>}
          </CardContent>
        </Card>

        <Card className="shadow-md border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Distribuição por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>}
          </CardContent>
        </Card>
      </div>

      {/* Top Stores + Event Table */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="shadow-md border-0">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top Lojas por Eventos</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {byStore.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-1 border-b border-dashed last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}.</span>
                    <span className="text-xs font-medium truncate max-w-[120px]">{s.store_name}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono">{s.count} ev</Badge>
                </div>
              ))}
              {byStore.length === 0 && <p className="text-xs text-muted-foreground">Sem dados</p>}
            </div>
          </CardContent>
        </Card>

        {/* Recent Events */}
        <Card className="shadow-md border-0 md:col-span-2 overflow-hidden">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Eventos Recentes</CardTitle></CardHeader>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 sticky top-0">
                <tr>
                  {["Data", "Loja", "Evento", "Origem", "Cobrança"].map(h => (
                    <th key={h} className="text-left p-2 font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {billingEvents.slice(0, 50).map((e: AdminBillingEvent) => (
                  <tr key={e.id} className="border-b">
                    <td className="p-2 text-muted-foreground whitespace-nowrap">{new Date(e.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="p-2 font-medium truncate max-w-[100px]">{e.store_name}</td>
                    <td className="p-2"><Badge variant="outline" className="text-[9px]">{EVENT_LABELS[e.event_type] || e.event_type}</Badge></td>
                    <td className="p-2">{e.source_type}</td>
                    <td className="p-2 font-mono text-amber-600">R$ {((e.charge_amount_cents || 0) / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
