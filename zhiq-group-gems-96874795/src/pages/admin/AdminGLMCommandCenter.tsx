/**
 * AdminGLMCommandCenter — Central de Inteligência Comercial
 * Painel unificado: Comercial, Planos, Pacotes, Campanhas, Financeiro,
 * Anúncios, Fila GLM, Promoções e Consultoria IA.
 *
 * REGRA: nunca remover tabs ou funcionalidades já implementadas.
 * Adições sempre são somadas ao final da lista de tabs.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BrainCircuit, Layers, Package, Target, DollarSign, Cpu,
  RefreshCw, TrendingUp, Activity, CheckCircle2, AlertTriangle,
  ShoppingCart, CalendarDays, Loader2, Send, Bot,
  ShoppingBag, Zap, Clock, Store, Truck, Plane, Wrench, Home,
  ListFilter, MapPin, Gift,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { useGLMIntelligence } from "@/hooks/useGLMIntelligence";
import { useGLMAds } from "@/hooks/useGLMAds";
import { formatCurrencyBRL as formatCurrency } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Helpers ────────────────────────────────────────────────────────
function SectionHeader({ title, sub, onRefresh, loading }: {
  title: string; sub?: string; onRefresh?: () => void; loading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {onRefresh && (
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
          Atualizar
        </Button>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color, sub, loading }: any) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4 flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {loading ? (
            <div className="h-7 w-20 bg-muted animate-pulse rounded" />
          ) : (
            <p className={cn("text-2xl font-bold tracking-tight", color)}>{value}</p>
          )}
          {sub && <p className="text-[10px] text-muted-foreground/80">{sub}</p>}
        </div>
        <div className={cn("p-2 rounded-lg bg-muted/40", color)}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────
const TABS = [
  { id: "comercial",    label: "Comercial",      icon: BrainCircuit, emoji: "📈" },
  { id: "planos",       label: "Planos & Assin.", icon: Layers,       emoji: "📦" },
  { id: "pacotes",      label: "Pacotes",         icon: Package,      emoji: "🛒" },
  { id: "campanhas",    label: "Campanhas",       icon: Target,       emoji: "🎯" },
  { id: "financeiro",   label: "Financeiro",      icon: DollarSign,   emoji: "💰" },
  { id: "anuncios",     label: "Anúncios",        icon: ShoppingBag,  emoji: "📣" },
  { id: "fila",         label: "Fila GLM",        icon: Activity,     emoji: "⏳" },
  { id: "promocoes",    label: "Promoções",       icon: Gift,         emoji: "🎁" },
  { id: "inteligencia", label: "Consultoria IA",  icon: Cpu,          emoji: "🧠" },
] as const;
type TabId = typeof TABS[number]["id"];

// ══════════════════════════════════════════════════════════════════
// TAB: Comercial (Geral) — PRESERVADO
// ══════════════════════════════════════════════════════════════════
function ComercialTab({ data, isLoading, refetch }: any) {
  const kpis = [
    { label: "Receita Total",       value: formatCurrency(data?.financeiro?.receita_total ?? 0), color: "text-green-600",  icon: DollarSign, sub: "Toda a plataforma" },
    { label: "MRR",                 value: formatCurrency(data?.assinaturas?.mrr_brl ?? 0),      color: "text-blue-600",   icon: TrendingUp, sub: "Receita Recorrente Mensal" },
    { label: "Assinaturas Ativas",  value: data?.assinaturas?.ativas ?? 0,                       color: "text-violet-600", icon: Layers,     sub: "Planos vigentes" },
    { label: "Campanhas Ativas",    value: data?.campanhas?.ativas ?? 0,                         color: "text-amber-600",  icon: Target,     sub: "Rodando atualmente" },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader title="Visão Geral Comercial" sub="Principais indicadores de vendas e assinaturas" onRefresh={refetch} loading={isLoading} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(k => <KpiCard key={k.label} {...k} loading={isLoading} />)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Status das Assinaturas</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 h-64">
            {isLoading ? (
              <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "Ativas",     value: data?.assinaturas?.ativas ?? 0,     color: "#10b981" },
                      { name: "Canceladas", value: data?.assinaturas?.canceladas ?? 0, color: "#ef4444" },
                      { name: "Expiradas",  value: data?.assinaturas?.expiradas ?? 0,  color: "#f59e0b" },
                    ]}
                    cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value" paddingAngle={5}
                  >
                    {[{ color: "#10b981" }, { color: "#ef4444" }, { color: "#f59e0b" }].map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB: Planos — PRESERVADO
// ══════════════════════════════════════════════════════════════════
function PlanosTab({ data, isLoading }: any) {
  const planos = data?.planos ?? [];
  return (
    <div className="space-y-4">
      <SectionHeader title="Planos de Assinatura" sub="Planos disponíveis para usuários e empresas" />
      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Nome do Plano</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Intervalo</TableHead>
                <TableHead>Receita Gerada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {planos.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.title || p.name}</TableCell>
                  <TableCell>{formatCurrency(p.price || p.price_brl || 0)}</TableCell>
                  <TableCell><Badge variant="outline">{p.interval || "N/A"}</Badge></TableCell>
                  <TableCell className="text-green-600 font-medium">
                    {formatCurrency(data?.financeiro?.receita_por_plano?.[p.id] || 0)}
                  </TableCell>
                </TableRow>
              ))}
              {planos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum plano cadastrado</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB: Pacotes — PRESERVADO
// ══════════════════════════════════════════════════════════════════
function PacotesTab({ data, isLoading }: any) {
  const pacotes = data?.pacotes ?? [];
  return (
    <div className="space-y-4">
      <SectionHeader title="Pacotes Avulsos" sub="Pacotes de créditos e impulsionamentos" />
      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Nome do Pacote</TableHead>
                <TableHead>Créditos Fornecidos</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Receita Gerada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pacotes.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.title || p.name}</TableCell>
                  <TableCell>{p.credits || p.credits_amount || "N/A"} créditos</TableCell>
                  <TableCell>{formatCurrency(p.price || p.price_brl || 0)}</TableCell>
                  <TableCell className="text-green-600 font-medium">
                    {formatCurrency(data?.financeiro?.receita_por_pacote?.[p.id] || 0)}
                  </TableCell>
                </TableRow>
              ))}
              {pacotes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum pacote cadastrado</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB: Campanhas — IMPLEMENTADO (era "Em breve")
// ══════════════════════════════════════════════════════════════════
const CAMP_STATUS: Record<string, { label: string; color: string }> = {
  active:    { label: "Ativa",     color: "bg-green-100 text-green-700" },
  paused:    { label: "Pausada",   color: "bg-amber-100 text-amber-700" },
  idle:      { label: "Idle",      color: "bg-amber-100 text-amber-700" },
  completed: { label: "Concluída", color: "bg-blue-100 text-blue-700" },
  finished:  { label: "Concluída", color: "bg-blue-100 text-blue-700" },
  scheduled: { label: "Agendada",  color: "bg-purple-100 text-purple-700" },
  pending:   { label: "Pendente",  color: "bg-gray-100 text-gray-600" },
};

function CampanhasTab({ data, isLoading }: any) {
  const campanhas = data?.campanhas;
  const detalhes  = campanhas?.detalhes ?? [];

  const chartData = [
    { name: "Ativas",      value: campanhas?.ativas ?? 0,      fill: "#10b981" },
    { name: "Finalizadas", value: campanhas?.finalizadas ?? 0, fill: "#3b82f6" },
    { name: "Agendadas",   value: campanhas?.agendadas ?? 0,   fill: "#8b5cf6" },
    { name: "Pausadas",    value: campanhas?.pausadas ?? 0,    fill: "#f59e0b" },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader title="Campanhas de Marketing" sub="Visão geral e detalhes das campanhas" loading={isLoading} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Ativas"      value={campanhas?.ativas ?? 0}      icon={Activity}      color="text-green-600"  sub="Rodando agora"  loading={isLoading} />
        <KpiCard label="Finalizadas" value={campanhas?.finalizadas ?? 0} icon={CheckCircle2}  color="text-blue-600"   sub="Encerradas"     loading={isLoading} />
        <KpiCard label="Agendadas"   value={campanhas?.agendadas ?? 0}   icon={CalendarDays}  color="text-purple-600" sub="Futuras"        loading={isLoading} />
        <KpiCard label="Pausadas"    value={campanhas?.pausadas ?? 0}    icon={AlertTriangle} color="text-amber-600"  sub="Em espera"      loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Status das Campanhas</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 h-56">
            {isLoading ? (
              <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 70 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={70} />
                  <Tooltip />
                  <Bar dataKey="value" name="Campanhas" radius={[0, 4, 4, 0]}>
                    {chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Orçamento vs Gasto (Ativas)</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 h-56">
            {isLoading ? (
              <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={detalhes.filter((c: any) => c.status === "active").slice(0, 8)}
                  margin={{ top: 4, right: 4, bottom: 30, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={40} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                  <Bar dataKey="budget_brl" name="Orçamento" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="spent_brl"  name="Gasto"     fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border border-border/60 overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead>Campanha</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Orçamento</TableHead>
              <TableHead>Gasto</TableHead>
              <TableHead>Período</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detalhes.slice(0, 20).map((c: any) => {
              const s = CAMP_STATUS[c.status] || { label: c.status, color: "bg-gray-100 text-gray-500" };
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium max-w-[180px] truncate">{c.name}</TableCell>
                  <TableCell><span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", s.color)}>{s.label}</span></TableCell>
                  <TableCell>{c.budget_brl ? formatCurrency(Number(c.budget_brl)) : "—"}</TableCell>
                  <TableCell className="text-blue-600">{c.spent_brl ? formatCurrency(Number(c.spent_brl)) : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.start_date ? format(new Date(c.start_date), "dd/MM/yy", { locale: ptBR }) : "—"}
                    {" → "}
                    {c.end_date ? format(new Date(c.end_date), "dd/MM/yy", { locale: ptBR }) : "Sem fim"}
                  </TableCell>
                </TableRow>
              );
            })}
            {detalhes.length === 0 && !isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma campanha encontrada</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB: Financeiro — IMPLEMENTADO (era "Em breve")
// ══════════════════════════════════════════════════════════════════
function FinanceiroTab({ data, isLoading }: any) {
  const financeiro = data?.financeiro;

  const planosChart = Object.entries(financeiro?.receita_por_plano ?? {})
    .map(([id, value]) => {
      const pl = data?.planos?.find((p: any) => p.id === id);
      return { name: (pl?.title || pl?.name || "Plano").substring(0, 14), receita: value as number };
    })
    .sort((a, b) => b.receita - a.receita)
    .slice(0, 8);

  const pacotesChart = Object.entries(financeiro?.receita_por_pacote ?? {})
    .map(([id, value]) => {
      const pk = data?.pacotes?.find((p: any) => p.id === id);
      return { name: (pk?.title || pk?.name || "Pacote").substring(0, 14), receita: value as number };
    })
    .sort((a, b) => b.receita - a.receita)
    .slice(0, 8);

  const receitaPlanos  = Object.values(financeiro?.receita_por_plano  ?? {}).reduce((a: number, b: any) => a + Number(b), 0);
  const receitaPacotes = Object.values(financeiro?.receita_por_pacote ?? {}).reduce((a: number, b: any) => a + Number(b), 0);

  return (
    <div className="space-y-6">
      <SectionHeader title="Extrato Financeiro Consolidado" sub="Receitas por plano, pacote e assinatura" loading={isLoading} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Receita Total"       value={formatCurrency(financeiro?.receita_total ?? 0)}          icon={DollarSign}  color="text-green-600"  sub="Todas as fontes"         loading={isLoading} />
        <KpiCard label="MRR"                 value={formatCurrency(financeiro?.receita_por_assinatura ?? 0)} icon={TrendingUp}  color="text-blue-600"   sub="Receita Recorrente Mensal" loading={isLoading} />
        <KpiCard label="Assinaturas Ativas"  value={data?.assinaturas?.ativas ?? 0}                          icon={CheckCircle2} color="text-violet-600" sub="Gerando MRR"             loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { title: "Receita por Plano",   chartData: planosChart,   fill: "#8b5cf6" },
          { title: "Receita por Pacote",  chartData: pacotesChart,  fill: "#10b981" },
        ].map(({ title, chartData, fill }) => (
          <Card key={title} className="border-border/60">
            <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4 h-56">
              {isLoading ? (
                <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 30, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={40} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                    <Bar dataKey="receita" name="Receita" fill={fill} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Composição da Receita</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Fonte</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">% do Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { fonte: "Planos (Assinaturas)", valor: receitaPlanos },
                { fonte: "Pacotes Avulsos",      valor: receitaPacotes },
              ].map(row => (
                <TableRow key={row.fonte}>
                  <TableCell className="font-medium">{row.fonte}</TableCell>
                  <TableCell className="text-right font-mono text-green-600">{formatCurrency(row.valor)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {financeiro?.receita_total ? Math.round((row.valor / financeiro.receita_total) * 100) : 0}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB: Anúncios — NOVO
// ══════════════════════════════════════════════════════════════════
const AD_CATEGORIES = [
  { key: "viagens",     label: "Viagens & Turismo",  Icon: Plane,   color: "#3b82f6" },
  { key: "veiculos",    label: "Veículos",           Icon: Truck,   color: "#8b5cf6" },
  { key: "servicos",    label: "Serviços",           Icon: Wrench,  color: "#f59e0b" },
  { key: "fretes",      label: "Fretes & Mudanças",  Icon: Truck,   color: "#10b981" },
  { key: "imoveis",     label: "Imóveis",            Icon: Home,    color: "#ef4444" },
  { key: "marketplace", label: "Mercado",            Icon: Store,   color: "#6366f1" },
] as const;

function AnunciosTab({ adsData, adsLoading, refetch }: any) {
  const listings = adsData?.listings;
  const total     = listings ? Object.values(listings).reduce((acc: number, cat: any) => acc + cat.total, 0) : 0;
  const hojeTotal = listings ? Object.values(listings).reduce((acc: number, cat: any) => acc + cat.hoje, 0) : 0;

  const chartData = AD_CATEGORIES.map(cat => ({
    name:  cat.label.split(" ")[0],
    total: listings?.[cat.key]?.total ?? 0,
    hoje:  listings?.[cat.key]?.hoje  ?? 0,
  }));

  const allRecent = listings
    ? AD_CATEGORIES.flatMap(cat =>
        (listings[cat.key]?.recentes ?? []).map((l: any) => ({ ...l, _cat: cat.label, _color: cat.color }))
      ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 12)
    : [];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Anúncios por Categoria"
        sub="Monitoramento de todos os anúncios cadastrados na plataforma"
        onRefresh={refetch}
        loading={adsLoading}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total de Anúncios"  value={total}                    icon={ShoppingBag} color="text-primary"     sub="Todas as categorias" loading={adsLoading} />
        <KpiCard label="Cadastrados Hoje"   value={hojeTotal}                icon={CalendarDays} color="text-green-600"  sub="Novos anúncios"      loading={adsLoading} />
        <KpiCard label="Em Promoção"        value={adsData?.promoted?.total ?? 0} icon={Zap}    color="text-amber-600"  sub="Slots ativos"         loading={adsLoading} />
        <KpiCard label="Categorias Ativas"  value={AD_CATEGORIES.length}    icon={ListFilter}  color="text-blue-600"   sub="Integradas"           loading={adsLoading} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Volume por Categoria</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 h-64">
            {adsLoading ? (
              <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend verticalAlign="top" height={28} />
                  <Bar dataKey="total" name="Total"  fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="hoje"  name="Hoje"   fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Detalhamento por Categoria</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Hoje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {AD_CATEGORIES.map(cat => (
                  <TableRow key={cat.key}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        <cat.Icon className="h-3.5 w-3.5 shrink-0" style={{ color: cat.color }} />
                        {cat.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{adsLoading ? "—" : (listings?.[cat.key]?.total ?? 0)}</TableCell>
                    <TableCell className="text-right font-mono text-green-600">{adsLoading ? "—" : (listings?.[cat.key]?.hoje ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Últimos Anúncios Cadastrados</h3>
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Cadastrado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allRecent.map((item: any) => (
                <TableRow key={`${item.id}-${item._cat}`}>
                  <TableCell className="font-medium max-w-[200px] truncate">{item.title || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]" style={{ borderColor: item._color, color: item._color }}>
                      {item._cat}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{item.city || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.created_at ? format(new Date(item.created_at), "dd/MM HH:mm", { locale: ptBR }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {allRecent.length === 0 && !adsLoading && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum anúncio registrado</TableCell></TableRow>
              )}
              {adsLoading && (
                <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" /></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB: Fila GLM — NOVO
// ══════════════════════════════════════════════════════════════════
const LOT_STATUS_STYLE: Record<string, string> = {
  available:  "bg-blue-100 text-blue-700",
  claimed:    "bg-amber-100 text-amber-700",
  posted:     "bg-green-100 text-green-700",
  cooldown:   "bg-purple-100 text-purple-700",
  expired:    "bg-gray-100 text-gray-500",
  cancelled:  "bg-red-100 text-red-600",
  failed:     "bg-red-100 text-red-600",
};
const LOT_STATUS_LABEL: Record<string, string> = {
  available:  "Disponível",
  claimed:    "Em Uso",
  posted:     "Postado",
  cooldown:   "Cooldown",
  expired:    "Expirado",
  cancelled:  "Cancelado",
  failed:     "Falhou",
};

function FilaTab({ adsData, adsLoading, refetch }: any) {
  const fila = adsData?.fila;
  const cq   = adsData?.campanhas_queue;

  const filaPieData = [
    { name: "Disponíveis",    value: fila?.lotes_disponiveis ?? 0,   color: "#3b82f6" },
    { name: "Em Uso",         value: fila?.lotes_claimed ?? 0,       color: "#f59e0b" },
    { name: "Em Cooldown",    value: fila?.lotes_cooldown ?? 0,      color: "#8b5cf6" },
    { name: "Postados Hoje",  value: fila?.lotes_postados_hoje ?? 0, color: "#10b981" },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Fila de Divulgação GLM"
        sub="Monitoramento em tempo real dos lotes e campanhas — atualiza a cada 30s"
        onRefresh={refetch}
        loading={adsLoading}
      />

      {/* Lotes KPIs */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Lotes de Postagem (Postador 3)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Disponíveis"      value={fila?.lotes_disponiveis ?? 0}   icon={Activity}      color="text-blue-600"   sub="Aguardando operador"  loading={adsLoading} />
          <KpiCard label="Em Processamento" value={fila?.lotes_claimed ?? 0}       icon={Clock}         color="text-amber-600"  sub="Reservados"           loading={adsLoading} />
          <KpiCard label="Postados Hoje"    value={fila?.lotes_postados_hoje ?? 0} icon={CheckCircle2}  color="text-green-600"  sub="Concluídos no dia"    loading={adsLoading} />
          <KpiCard label="Em Cooldown"      value={fila?.lotes_cooldown ?? 0}      icon={AlertTriangle} color="text-purple-600" sub="Aguardando reset"     loading={adsLoading} />
        </div>
      </div>

      {/* Campaign queue KPIs */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Fila de Campanhas (Postador 2)</p>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: "Aguardando",  value: cq?.pendente ?? 0,    color: "text-gray-600" },
            { label: "Aprovadas",   value: cq?.aprovado ?? 0,    color: "text-blue-600" },
            { label: "Processando", value: cq?.processando ?? 0, color: "text-amber-600" },
            { label: "Postadas",    value: cq?.postado ?? 0,     color: "text-green-600" },
            { label: "Falhas",      value: cq?.falhou ?? 0,      color: "text-red-600" },
            { label: "Canceladas",  value: cq?.cancelado ?? 0,   color: "text-gray-400" },
          ].map(kpi => (
            <Card key={kpi.label} className="border-border/60">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className={cn("text-xl font-bold mt-1", kpi.color)}>{adsLoading ? "—" : kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pie chart de lotes */}
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Distribuição dos Lotes</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 h-56">
            {adsLoading ? (
              <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : filaPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={filaPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} dataKey="value" paddingAngle={4}>
                    {filaPieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Nenhum lote na fila</div>
            )}
          </CardContent>
        </Card>

        {/* Campaign queue status bars */}
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Status da Fila de Campanhas</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 h-56">
            {adsLoading ? (
              <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: "Aguardando",  value: cq?.pendente ?? 0,    fill: "#94a3b8" },
                    { name: "Aprovadas",   value: cq?.aprovado ?? 0,    fill: "#3b82f6" },
                    { name: "Processando", value: cq?.processando ?? 0, fill: "#f59e0b" },
                    { name: "Postadas",    value: cq?.postado ?? 0,     fill: "#10b981" },
                    { name: "Falhas",      value: cq?.falhou ?? 0,      fill: "#ef4444" },
                  ]}
                  layout="vertical"
                  margin={{ top: 4, right: 20, bottom: 4, left: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="value" name="Campanhas" radius={[0, 4, 4, 0]}>
                    {[
                      { fill: "#94a3b8" }, { fill: "#3b82f6" }, { fill: "#f59e0b" },
                      { fill: "#10b981" }, { fill: "#ef4444" },
                    ].map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lotes table */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Últimos Lotes na Fila</h3>
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead className="text-center">Itens</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cadastrado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(fila?.detalhes ?? []).slice(0, 20).map((lot: any) => (
                <TableRow key={lot.id}>
                  <TableCell className="font-medium max-w-[150px] truncate">{lot.store_name || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{lot.target_city || "—"}</TableCell>
                  <TableCell className="text-center">{lot.items_count ?? "—"}</TableCell>
                  <TableCell>
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", LOT_STATUS_STYLE[lot.status] || "bg-gray-100 text-gray-500")}>
                      {LOT_STATUS_LABEL[lot.status] || lot.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {lot.created_at ? format(new Date(lot.created_at), "dd/MM HH:mm", { locale: ptBR }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {(!fila?.detalhes || fila.detalhes.length === 0) && !adsLoading && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum lote na fila</TableCell></TableRow>
              )}
              {adsLoading && (
                <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" /></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB: Promoções — NOVO
// ══════════════════════════════════════════════════════════════════
const PROMO_CAT_LABELS: Record<string, string> = {
  viagens:    "Viagens & Turismo",
  veiculos:   "Veículos",
  servicos:   "Serviços",
  fretes:     "Fretes & Mudanças",
  imoveis:    "Imóveis",
  produto:    "Mercado / Produtos",
  outros:     "Outros",
};
const PROMO_CAT_COLORS: Record<string, string> = {
  viagens:    "#3b82f6",
  veiculos:   "#8b5cf6",
  servicos:   "#f59e0b",
  fretes:     "#10b981",
  imoveis:    "#ef4444",
  produto:    "#6366f1",
  outros:     "#94a3b8",
};

function PromocoesTab({ adsData, adsLoading }: any) {
  const promoted = adsData?.promoted;

  const pieData = Object.entries(promoted?.por_categoria ?? {})
    .map(([key, value]) => ({
      name:  PROMO_CAT_LABELS[key] || key,
      value: value as number,
      color: PROMO_CAT_COLORS[key] || "#94a3b8",
    }))
    .filter(d => d.value > 0);

  const topCat = Object.entries(promoted?.por_categoria ?? {}).sort((a, b) => (b[1] as number) - (a[1] as number))[0];
  const topCatLabel = topCat ? (PROMO_CAT_LABELS[topCat[0]] || topCat[0]) : "—";

  return (
    <div className="space-y-6">
      <SectionHeader title="Promoções Ativas" sub="Anúncios em promoção, slots pagos e divulgação via GLM" />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Slots em Promoção"    value={promoted?.total ?? 0}                              icon={Zap}        color="text-amber-600"  sub="Total de slots ativos" loading={adsLoading} />
        <KpiCard label="Categorias com Promo" value={Object.keys(promoted?.por_categoria ?? {}).length} icon={ListFilter}  color="text-blue-600"   sub="Diversificação"        loading={adsLoading} />
        <KpiCard label="Maior Categoria"      value={topCatLabel}                                       icon={TrendingUp} color="text-green-600"  sub="Em promoção"           loading={adsLoading} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Distribuição por Categoria</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 h-64">
            {adsLoading ? (
              <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={4}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Nenhuma promoção ativa</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Slots por Categoria</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Slots</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(promoted?.por_categoria ?? {})
                  .sort((a, b) => (b[1] as number) - (a[1] as number))
                  .map(([key, count]) => (
                    <TableRow key={key}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PROMO_CAT_COLORS[key] || "#94a3b8" }} />
                          {PROMO_CAT_LABELS[key] || key}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">{count as number}</TableCell>
                      <TableCell className="text-right text-muted-foreground text-xs">
                        {promoted?.total ? Math.round(((count as number) / promoted.total) * 100) : 0}%
                      </TableCell>
                    </TableRow>
                  ))}
                {Object.keys(promoted?.por_categoria ?? {}).length === 0 && !adsLoading && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Nenhuma promoção ativa</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Slots Recentes em Promoção</h3>
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Adicionado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(promoted?.recentes ?? []).map((slot: any) => (
                <TableRow key={slot.id}>
                  <TableCell className="font-medium max-w-[200px] truncate">{slot.listing_title || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {PROMO_CAT_LABELS[slot.listing_type] || slot.listing_type || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{slot.listing_city || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {slot.created_at ? format(new Date(slot.created_at), "dd/MM HH:mm", { locale: ptBR }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {(!promoted?.recentes || promoted.recentes.length === 0) && !adsLoading && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum slot em promoção</TableCell></TableRow>
              )}
              {adsLoading && (
                <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" /></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB: Consultoria IA — PRESERVADO + contexto expandido
// ══════════════════════════════════════════════════════════════════
function InteligenciaTab({ data, adsData }: any) {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAskAI = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResponse("");

    try {
      const contextData = JSON.stringify({
        assinaturas:       data?.assinaturas,
        receita_total:     data?.financeiro?.receita_total,
        campanhas_ativas:  data?.campanhas?.ativas,
        anuncios: {
          total_viagens:     adsData?.listings?.viagens?.total     ?? 0,
          total_veiculos:    adsData?.listings?.veiculos?.total    ?? 0,
          total_servicos:    adsData?.listings?.servicos?.total    ?? 0,
          total_fretes:      adsData?.listings?.fretes?.total      ?? 0,
          total_imoveis:     adsData?.listings?.imoveis?.total     ?? 0,
          total_marketplace: adsData?.listings?.marketplace?.total ?? 0,
          cadastrados_hoje:  adsData
            ? Object.values(adsData.listings).reduce((a: number, c: any) => a + c.hoje, 0)
            : 0,
          em_promocao:       adsData?.promoted?.total ?? 0,
        },
        fila: {
          lotes_disponiveis:   adsData?.fila?.lotes_disponiveis   ?? 0,
          lotes_em_uso:        adsData?.fila?.lotes_claimed       ?? 0,
          lotes_postados_hoje: adsData?.fila?.lotes_postados_hoje ?? 0,
          campanhas_pendentes: adsData?.campanhas_queue?.pendente  ?? 0,
          campanhas_postadas:  adsData?.campanhas_queue?.postado   ?? 0,
        },
      });

      const systemPrompt = `Você é a IA GLM, atuando como Diretor de Inteligência Comercial da plataforma Viagg.
Dados em tempo real: ${contextData}.
Responda de forma estratégica e objetiva, com foco em receita, retenção e crescimento da plataforma.`;

      const { data: aiResponse, error } = await supabase.functions.invoke("chat-with-glm", {
        body: {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: prompt },
          ],
        },
      });

      if (error) throw error;
      setResponse(aiResponse?.reply || "Nenhuma resposta obtida da IA.");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao consultar a IA GLM.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <SectionHeader
        title="Consultoria Estratégica (IA GLM)"
        sub="Perguntas sobre dados da plataforma — anúncios, campanhas, fila, receita, promoções."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
        {[
          "Quantos anúncios gratuitos foram cadastrados hoje?",
          "Qual categoria possui mais anúncios?",
          "Quantos lotes estão disponíveis na fila de divulgação?",
          "Qual categoria gera mais slots em promoção?",
        ].map(q => (
          <button
            key={q}
            onClick={() => setPrompt(q)}
            className="text-left px-3 py-2 rounded-lg border border-border/60 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
          >
            💡 {q}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ex: Qual categoria possui mais anúncios pagos ativos?"
          onKeyDown={(e) => e.key === "Enter" && handleAskAI()}
        />
        <Button onClick={handleAskAI} disabled={loading || !prompt.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span className="ml-2 hidden sm:inline">Consultar IA</span>
        </Button>
      </div>

      {response && (
        <div className="mt-6 p-6 bg-primary/5 rounded-xl border border-primary/20 space-y-4">
          <div className="flex items-center gap-2 text-primary font-bold">
            <Bot className="h-5 w-5" />
            Resposta da IA GLM
          </div>
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{response}</div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function AdminGLMCommandCenter() {
  const [activeTab, setActiveTab] = useState<TabId>("comercial");
  const { data, isLoading, refetch }                       = useGLMIntelligence();
  const { data: adsData, isLoading: adsLoading, refetch: refetchAds } = useGLMAds();

  const handleRefreshAll = () => { refetch(); refetchAds(); };

  return (
    <div className="min-h-[calc(100vh-65px)] bg-muted/10 p-2 md:p-6 pb-24 md:pb-6 space-y-4 max-w-[1400px] mx-auto animate-in fade-in zoom-in-95 duration-300">

      {/* Header */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-card p-4 rounded-xl border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-32 bg-primary/5 blur-[100px] rounded-full pointer-events-none" />
        <div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight flex items-center gap-2">
            <Cpu className="h-6 w-6 text-primary" />
            Central de Inteligência Comercial
            <Badge variant="secondary" className="ml-2 font-mono text-[10px]">GLM-4</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Painel unificado — planos, campanhas, financeiro, anúncios, fila GLM, promoções e consultoria IA.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={isLoading || adsLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", (isLoading || adsLoading) && "animate-spin")} />
            Atualizar Tudo
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all border",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground border-transparent hover:bg-muted/80 hover:text-foreground"
            )}
          >
            <span className="text-sm">{tab.emoji}</span>
            <span className="hidden md:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-card rounded-xl border border-border/50 shadow-sm p-4 md:p-6 min-h-[500px]">
        {activeTab === "comercial"   && <ComercialTab   data={data}    isLoading={isLoading}  refetch={handleRefreshAll} />}
        {activeTab === "planos"      && <PlanosTab      data={data}    isLoading={isLoading} />}
        {activeTab === "pacotes"     && <PacotesTab     data={data}    isLoading={isLoading} />}
        {activeTab === "campanhas"   && <CampanhasTab   data={data}    isLoading={isLoading} />}
        {activeTab === "financeiro"  && <FinanceiroTab  data={data}    isLoading={isLoading} />}
        {activeTab === "anuncios"    && <AnunciosTab    adsData={adsData} adsLoading={adsLoading} refetch={refetchAds} />}
        {activeTab === "fila"        && <FilaTab        adsData={adsData} adsLoading={adsLoading} refetch={refetchAds} />}
        {activeTab === "promocoes"   && <PromocoesTab   adsData={adsData} adsLoading={adsLoading} />}
        {activeTab === "inteligencia"&& <InteligenciaTab data={data}   adsData={adsData} />}
      </div>
    </div>
  );
}
