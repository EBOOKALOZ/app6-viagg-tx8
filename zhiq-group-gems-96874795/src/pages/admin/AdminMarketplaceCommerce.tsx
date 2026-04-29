/**
 * AdminMarketplaceCommerce — Página premium de gestão de mercado, lojas e inteligência comercial.
 * Reaproveita o sistema de CRUD de pacotes de veículos e adiciona dashboards avançados.
 */

import { useMemo, useState } from "react";
import { useAdminPacketsOverview } from "@/hooks/useAdminPacketsOverview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Loader2, TrendingUp, TrendingDown, Users, Store, Package, Coins,
  DollarSign, Search, ShoppingBag, CheckCircle2, Clock, Sparkles, ShoppingCart,
} from "lucide-react";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ProductPackagesManager } from "@/components/admin/ProductPackagesManager";

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; className: string; icon: any }> = {
  Ativa:   { label: "Ativa",    className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", icon: CheckCircle2 },
  Inativa: { label: "Inativa",  className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",    icon: Clock },
};

function StatusPill({ status }: { status: string | null }) {
  const meta = status ? (STATUS_META[status] || { label: status, className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", icon: Clock }) : STATUS_META["Inativa"];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-bold uppercase text-[10px] tracking-wider", meta.className)}>
      {Icon && <Icon className="w-3 h-3" />} {meta.label}
    </Badge>
  );
}

function formatPct(n: number): string {
  if (!isFinite(n)) return "0%";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function formatNumber(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString('pt-BR');
}

// ── Card de KPI ────────────────────────────────────────────────────────────

function MetricCard({ title, value, delta, icon: Icon, className }: any) {
  const positive = delta !== undefined && delta >= 0;
  const negative = delta !== undefined && delta < 0;
  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {delta !== undefined && (
          <div className={cn("text-[11px] font-semibold mt-1 flex items-center gap-1", positive ? "text-emerald-500" : "text-red-500")}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {formatPct(delta)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Mini Gráfico de Barras ─────────────────────────────────────────────────

function MiniBarChart({ data, valueKey = "value", color = "bg-blue-500" }: any) {
  const max = Math.max(...data.map((d: any) => d[valueKey] || 0));
  return (
    <div className="flex items-end gap-0.5 h-16">
      {data.slice(-10).map((d: any, i: number) => (
        <div
          key={i}
          className={cn("flex-1 rounded-t transition-all", color)}
          style={{ height: `${max > 0 ? ((d[valueKey] || 0) / max) * 100 : 0}%` }}
          title={`${d.day || d.hour}: ${d[valueKey]}`}
        />
      ))}
    </div>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────

export default function AdminMarketplaceCommerce() {
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [storeSearch, setStoreSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [packagesFilter, setPackagesFilter] = useState<string>("all");

  const query = useAdminPacketsOverview({ periodDays });

  const { data, isLoading } = query;
  const stores = data?.stores || [];
  const categories = data?.categories || [];
  const packages = data?.packages || [];
  const salesByStoreAndCategory = data?.salesByStoreAndCategory || [];

  // Filtro de lojas
  const filteredStores = useMemo(() => {
    if (!stores) return [];
    return stores.filter((s) => {
      if (storeSearch && !s.store_name.toLowerCase().includes(storeSearch.toLowerCase()) && !s.owner_name.toLowerCase().includes(storeSearch.toLowerCase())) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (packagesFilter !== "all" && s.package_name !== packagesFilter) return false;
      return true;
    });
  }, [stores, storeSearch, statusFilter, packagesFilter]);

  const kpis = data?.kpis;

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">MERCADO</h1>
          <p className="text-muted-foreground text-[13px]">
            Gestão de pacotes, lojas, produtos e inteligência comercial
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v))}>
            <TabsList>
              <TabsTrigger value="7">7d</TabsTrigger>
              <TabsTrigger value="30">30d</TabsTrigger>
              <TabsTrigger value="90">90d</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* ── Cards KPIs ── */}
      {kpis && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Lojas Total" value={formatNumber(kpis.total_stores)} delta={kpis.growth_pct} icon={Store} />
          <MetricCard title="Anunciantes" value={formatNumber(kpis.total_advertisers)} delta={undefined} icon={Users} />
          <MetricCard title="Produtos" value={formatNumber(kpis.total_products)} delta={undefined} icon={ShoppingBag} />
          <MetricCard title="Categorias" value={formatNumber(kpis.total_categories)} delta={undefined} icon={Package} />
          <MetricCard title="Pacotes Ativos" value={formatNumber(kpis.total_active_packages)} delta={undefined} icon={Package} />
          <MetricCard title="Créditos/Hora" value={formatNumber(Math.round(kpis.credits_per_hour))} delta={undefined} icon={Coins} />
          <MetricCard title="Créditos/Dia" value={formatNumber(Math.round(kpis.credits_per_day))} delta={undefined} icon={Coins} />
          <MetricCard title="Receita/Hora" value={formatCurrencyBRL(kpis.revenue_per_hour)} delta={undefined} icon={DollarSign} />
          <MetricCard title="Receita/Dia" value={formatCurrencyBRL(kpis.revenue_per_day)} delta={undefined} icon={DollarSign} />
          <MetricCard title="Crescimento" value={`${formatPct(kpis.growth_pct)}`} delta={undefined} icon={TrendingUp} />
          <MetricCard title="Lojas Ativas" value={`${kpis.active_stores_pct.toFixed(1)}%`} delta={undefined} icon={CheckCircle2} />
          <MetricCard title="Ticket Médio" value={formatCurrencyBRL(kpis.avg_ticket_brl)} delta={undefined} icon={Sparkles} />
        </div>
      )}

      {/* ── Filtros ── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar loja ou anunciante..."
                className="pl-9"
                value={storeSearch}
                onChange={(e) => setStoreSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="Ativa">Ativa</SelectItem>
                <SelectItem value="Inativa">Inativa</SelectItem>
              </SelectContent>
            </Select>
            <Select value={packagesFilter} onValueChange={setPackagesFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Pacote" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos pacotes</SelectItem>
                {packages?.map((p) => (
                  <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Lojas / Anunciantes ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[16px]">Lojas / Anunciantes ({filteredStores.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loja</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>CPF/CNPJ</TableHead>
                    <TableHead className="text-center">Produtos</TableHead>
                    <TableHead className="text-right">Créditos Cons.</TableHead>
                    <TableHead>Pacote</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead>Última Ativ.</TableHead>
                    <TableHead>Cidade/UF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStores.map((store) => (
                    <TableRow key={store.id}>
                      <TableCell className="font-medium max-w-[180px] truncate">{store.store_name}</TableCell>
                      <TableCell className="text-[12px]">{store.owner_name}</TableCell>
                      <TableCell className="font-mono text-[12px]">{store.cpf_cnpj || "—"}</TableCell>
                      <TableCell className="text-center">{store.products_count}</TableCell>
                      <TableCell className="text-right font-mono">{formatNumber(store.credits_consumed)}</TableCell>
                      <TableCell className="text-[12px]">{store.package_name || "—"}</TableCell>
                      <TableCell><StatusPill status={store.status} /></TableCell>
                      <TableCell className="text-right font-mono">{formatCurrencyBRL(store.total_revenue_brl)}</TableCell>
                      <TableCell className="text-[11px] text-muted-foreground">
                        {store.last_activity_at ? format(new Date(store.last_activity_at), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}
                      </TableCell>
                      <TableCell className="text-[12px]">{store.city || "—"} / {store.state || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {filteredStores.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        Nenhuma loja encontrada com os filtros atuais.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Produtos por Categoria ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[16px]">Produtos por Categoria</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-center">Produtos</TableHead>
                    <TableHead className="text-center">Percentual</TableHead>
                    <TableHead>Crescimento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories?.map((cat) => (
                    <TableRow key={cat.category_id}>
                      <TableCell className="font-medium">{cat.category_name}</TableCell>
                      <TableCell className="text-center">{cat.products_count}</TableCell>
                      <TableCell className="text-center">{cat.percentage.toFixed(1)}%</TableCell>
                      <TableCell>
                        <span className={cn("text-sm font-semibold", cat.growth_pct >= 0 ? "text-emerald-500" : "text-red-500")}>
                          {formatPct(cat.growth_pct)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {categories?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Nenhuma categoria cadastrada.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Vendas por Loja e Categoria ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[16px] flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Vendas por Loja e Categoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loja</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-center">Vendas</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesByStoreAndCategory && salesByStoreAndCategory.length > 0 ? (
                    salesByStoreAndCategory.map((row, idx) => (
                      <TableRow key={`${row.store_name}-${row.category}-${idx}`}>
                        <TableCell className="font-medium max-w-[180px] truncate">{row.store_name}</TableCell>
                        <TableCell className="text-[12px]">{row.category}</TableCell>
                        <TableCell className="text-center font-mono">{formatNumber(row.sales_count)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrencyBRL(row.revenue_brl)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Nenhuma venda registrada no período.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Consumo de Créditos (Horário + Diário) ── */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[16px]">Consumo por Hora (Últimas 24h)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data?.creditHourly && data.creditHourly.length > 0 ? (
              <>
                <MiniBarChart data={data.creditHourly} valueKey="credits_consumed" color="bg-orange-500" />
                <div className="text-[11px] text-muted-foreground text-center">
                  Total últimas 24h: {formatNumber(data.creditHourly.reduce((a, b) => a + b.credits_consumed, 0))} créditos
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-[16px]">Consumo Diário ({periodDays} dias)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data?.creditDaily && data.creditDaily.length > 0 ? (
              <>
                <MiniBarChart data={data.creditDaily} valueKey="credits_consumed" color="bg-emerald-500" />
                <div className="text-[11px] text-muted-foreground text-center">
                  Total período: {formatNumber(data.creditDaily.reduce((a, b) => a + b.credits_consumed, 0))} créditos
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Receita (Horário + Diário) ── */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[16px]">Receita por Hora (Últimas 24h)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data?.revenueHourly && data.revenueHourly.length > 0 ? (
              <>
                <MiniBarChart data={data.revenueHourly} valueKey="revenue_brl" color="bg-green-500" />
                <div className="text-[11px] text-muted-foreground text-center">
                  Total últimas 24h: {formatCurrencyBRL(data.revenueHourly.reduce((a, b) => a + b.revenue_brl, 0))}
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-[16px]">Receita Diária ({periodDays} dias)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data?.revenueDaily && data.revenueDaily.length > 0 ? (
              <>
                <MiniBarChart data={data.revenueDaily} valueKey="revenue_brl" color="bg-blue-500" />
                <div className="text-[11px] text-muted-foreground text-center">
                  Total período: {formatCurrencyBRL(data.revenueDaily.reduce((a, b) => a + b.revenue_brl, 0))}
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top Consumidores e Anunciantes ── */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[16px]">Top 10 Lojas por Consumo de Créditos</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.topConsumers && data.topConsumers.length > 0 ? (
              <div className="space-y-2">
                {data.topConsumers.map((c, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <div className="font-medium text-sm">{c.store_name}</div>
                      <div className="text-[11px] text-muted-foreground">{c.advertiser_name}</div>
                    </div>
                    <div className="font-mono font-bold text-orange-500">{formatNumber(c.credits_consumed)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-[16px]">Top 10 Anunciantes por Receita</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.topAdvertisers && data.topAdvertisers.length > 0 ? (
              <div className="space-y-2">
                {data.topAdvertisers.map((a, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <div className="font-medium text-sm">{a.store_name}</div>
                      <div className="text-[11px] text-muted-foreground">{a.advertiser_name}</div>
                    </div>
                    <div className="font-mono font-bold text-emerald-600">{formatCurrencyBRL(a.credits_consumed)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Histórico de Crescimento ── */}
      {data?.periodGrowth && data.periodGrowth.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-[16px]">Histórico ({periodDays} dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end gap-1">
              {data.periodGrowth.map((point, i) => (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={`${point.day}: R$ ${point.revenue.toFixed(0)}`}
                >
                  <div className="w-full bg-primary/20 rounded-t" style={{ height: `${Math.max(4, Math.sqrt(point.revenue || 1) * 5)}px` }} />
                  <div className="w-2 h-2 rounded-full bg-primary-60" />
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-between text-[11px] text-muted-foreground">
              <span>Lojas</span>
              <span>Produtos</span>
              <span>Receita</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Gestão de Pacotes ── */}
      <section className="space-y-6">
        <ProductPackagesManager />
      </section>
    </div>
  );
}
