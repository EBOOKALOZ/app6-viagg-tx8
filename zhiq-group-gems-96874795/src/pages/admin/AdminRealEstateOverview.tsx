/**
 * AdminRealEstateOverview — Hiper-página administrativa de anúncios de imóveis.
 *
 * Reúne em um único painel:
 *   - KPIs (total, ativos, pendentes, rejeitados, anunciantes, pacotes, créditos)
 *   - Crescimento comparado ao período anterior
 *   - Tabela de anúncios com filtros profissionais
 *   - Visão de anunciantes (lojista x pessoa) com agregações
 *   - Pacotes adquiridos + métricas por pacote
 *   - Ledger de créditos (consumo real)
 *   - Histórico / tendência
 *   - Drawer de detalhe por anúncio
 *
 * Alimentado 100% por dados reais via useAdminRealEstateOverview.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useAdminRealEstateOverview,
  type AdminRealEstateListingRow,
  type AdvertiserKind,
} from "@/hooks/useAdminRealEstateOverview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Building2, Search, Loader2, TrendingUp, TrendingDown, Users,
  Package, Coins, CheckCircle2, Clock, Ban, MapPin, Store,
  User as UserIcon, Eye, Calendar, Sparkles, Filter, ArrowUpRight, ExternalLink,
} from "lucide-react";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_META: Record<
  string,
  { label: string; className: string; icon: any }
> = {
  published:   { label: "Publicado",  className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", icon: CheckCircle2 },
  approved:    { label: "Aprovado",   className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", icon: CheckCircle2 },
  active:      { label: "Ativo",      className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", icon: CheckCircle2 },
  pending_review: { label: "Pendente", className: "bg-amber-500/15 text-amber-500 border-amber-500/30", icon: Clock },
  pending:     { label: "Pendente",   className: "bg-amber-500/15 text-amber-500 border-amber-500/30", icon: Clock },
  draft:       { label: "Rascunho",   className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", icon: Clock },
  rejected:    { label: "Rejeitado",  className: "bg-red-500/15 text-red-500 border-red-500/30", icon: Ban },
  blocked:     { label: "Bloqueado",  className: "bg-red-500/15 text-red-500 border-red-500/30", icon: Ban },
  suspended:   { label: "Suspenso",   className: "bg-red-500/15 text-red-500 border-red-500/30", icon: Ban },
};

function StatusPill({ status }: { status: string | null }) {
  const meta = STATUS_META[status || ""] || { label: status || "—", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", icon: Clock };
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-bold uppercase text-[10px] tracking-wider", meta.className)}>
      <Icon className="w-3 h-3" /> {meta.label}
    </Badge>
  );
}

function KindPill({ kind }: { kind: AdvertiserKind }) {
  if (kind === "lojista") {
    return (
      <span className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
        <Store className="w-3 h-3" /> Lojista
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
      <UserIcon className="w-3 h-3" /> Pessoa
    </span>
  );
}

function formatPct(n: number): string {
  if (!isFinite(n)) return "0%";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

// ── Página ─────────────────────────────────────────────────────────────────

export default function AdminRealEstateOverview() {
  const navigate = useNavigate();
  const [periodDays, setPeriodDays] = useState<number>(30);
  const { data, isLoading, cities } = useAdminRealEstateOverview({ periodDays });

  const [tab, setTab] = useState<"anuncios" | "anunciantes" | "pacotes" | "creditos" | "crescimento">("anuncios");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [packageFilter, setPackageFilter] = useState("all");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState("all");

  const [selectedRow, setSelectedRow] = useState<AdminRealEstateListingRow | null>(null);

  const kpis = data?.kpis;
  const rows = data?.rows || [];
  const advertisers = data?.advertisers || [];
  const packages = data?.packages || [];
  const ledger = data?.ledger || [];
  const growth = data?.growth || [];

  // ── Filtros da tabela ────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all") {
        const s = r.visibility_status || "";
        if (statusFilter === "active" && !["published", "approved", "active"].includes(s)) return false;
        if (statusFilter === "pending" && !["pending_review", "pending", "draft"].includes(s)) return false;
        if (statusFilter === "rejected" && !["rejected", "blocked", "suspended"].includes(s)) return false;
      }
      if (kindFilter !== "all" && r.advertiser_kind !== kindFilter) return false;
      if (cityFilter !== "all" && r.city !== cityFilter) return false;
      if (propertyTypeFilter !== "all" && r.property_type !== propertyTypeFilter) return false;
      if (packageFilter !== "all") {
        if (packageFilter === "with" && !r.package_name) return false;
        if (packageFilter === "without" && !!r.package_name) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay =
          `${r.title || ""} ${r.advertiser_name || ""} ${r.city || ""} ${r.neighborhood || ""} ${r.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, kindFilter, cityFilter, propertyTypeFilter, packageFilter]);

  const propertyTypes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.property_type && s.add(r.property_type));
    return Array.from(s).sort();
  }, [rows]);

  // ── Chart bars ───────────────────────────────────────────────────────────
  const chartMax = useMemo(
    () => Math.max(1, ...growth.map((g) => Math.max(g.listings, g.advertisers))),
    [growth]
  );

  // ── Top anunciantes ──────────────────────────────────────────────────────
  const topAdvertisers = useMemo(
    () => [...advertisers].sort((a, b) => b.total_listings - a.total_listings).slice(0, 10),
    [advertisers]
  );

  // ─────────────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary opacity-60" />
        <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">
          Carregando painel de imóveis…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-foreground tracking-tight">
              Anúncio de Imóvel — Painel Admin
            </h1>
            <p className="text-xs text-muted-foreground mt-1 font-medium">
              Visão operacional, comercial e analítica dos anúncios de imóveis da plataforma.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v))}>
            <SelectTrigger className="w-[160px] h-9">
              <Calendar className="w-3.5 h-3.5 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/admin/imoveis/moderacao")}
            className="h-9 gap-1.5"
          >
            <Clock className="w-3.5 h-3.5" /> Fila de moderação
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/admin/imoveis/pacotes")}
            className="h-9 gap-1.5"
          >
            <Package className="w-3.5 h-3.5" /> Pacotes
          </Button>
        </div>
      </header>

      {/* ── KPI CARDS ──────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Total de Anúncios"
          value={kpis?.total_listings ?? 0}
          icon={Building2}
          tone="primary"
          delta={kpis ? formatPct(kpis.listings_growth_pct) : undefined}
          deltaPositive={kpis ? kpis.listings_growth_pct >= 0 : undefined}
          subtitle={`+${kpis?.new_listings_period ?? 0} no período`}
        />
        <KpiCard
          label="Ativos"
          value={kpis?.active_listings ?? 0}
          icon={CheckCircle2}
          tone="emerald"
          subtitle={`${kpis ? kpis.approval_rate_pct.toFixed(0) : 0}% taxa de aprovação`}
        />
        <KpiCard
          label="Pendentes"
          value={kpis?.pending_listings ?? 0}
          icon={Clock}
          tone="amber"
          subtitle="aguardando revisão"
        />
        <KpiCard
          label="Rejeitados / Bloqueados"
          value={kpis?.rejected_listings ?? 0}
          icon={Ban}
          tone="red"
          subtitle="removidos da vitrine"
        />
        <KpiCard
          label="Anunciantes"
          value={kpis?.total_advertisers ?? 0}
          icon={Users}
          tone="blue"
          delta={kpis ? formatPct(kpis.advertisers_growth_pct) : undefined}
          deltaPositive={kpis ? kpis.advertisers_growth_pct >= 0 : undefined}
          subtitle={`${kpis?.total_lojistas ?? 0} lojistas · ${kpis?.total_pessoas ?? 0} pessoas`}
        />

        <KpiCard
          label="Pacotes Vendidos"
          value={kpis?.total_packages_sold ?? 0}
          icon={Package}
          tone="purple"
          subtitle="compras totais"
        />
        <KpiCard
          label="Créditos Consumidos"
          value={kpis?.total_credits_consumed ?? 0}
          icon={Coins}
          tone="primary"
          subtitle={`~${(kpis?.avg_credits_per_listing ?? 0).toFixed(1)} por anúncio`}
        />
        <KpiCard
          label="Novos no Período"
          value={kpis?.new_listings_period ?? 0}
          icon={Sparkles}
          tone="emerald"
          delta={kpis ? formatPct(kpis.listings_growth_pct) : undefined}
          deltaPositive={kpis ? kpis.listings_growth_pct >= 0 : undefined}
          subtitle="novos anúncios"
        />
        <KpiCard
          label="Novos Anunciantes"
          value={kpis?.new_advertisers_period ?? 0}
          icon={Users}
          tone="blue"
          delta={kpis ? formatPct(kpis.advertisers_growth_pct) : undefined}
          deltaPositive={kpis ? kpis.advertisers_growth_pct >= 0 : undefined}
          subtitle="no período"
        />
        <KpiCard
          label="Média Imóveis / Anunciante"
          value={(kpis?.avg_listings_per_advertiser ?? 0).toFixed(1) as any}
          icon={TrendingUp}
          tone="amber"
          subtitle="densidade do portfólio"
        />
      </section>

      {/* ── TABS ───────────────────────────────────────────────────────── */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full md:w-auto md:inline-flex">
          <TabsTrigger value="anuncios">Anúncios</TabsTrigger>
          <TabsTrigger value="anunciantes">Anunciantes</TabsTrigger>
          <TabsTrigger value="pacotes">Pacotes</TabsTrigger>
          <TabsTrigger value="creditos">Créditos</TabsTrigger>
          <TabsTrigger value="crescimento">Crescimento</TabsTrigger>
        </TabsList>

        {/* ── Aba: Anúncios ─────────────────────────────────────────── */}
        <TabsContent value="anuncios" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Filtros
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por título, anunciante, cidade, ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="rejected">Rejeitados</SelectItem>
                </SelectContent>
              </Select>
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Tipo anunciante" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos anunciantes</SelectItem>
                  <SelectItem value="lojista">Lojistas</SelectItem>
                  <SelectItem value="pessoa">Pessoa anunciante</SelectItem>
                </SelectContent>
              </Select>
              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Cidade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas cidades</SelectItem>
                  {cities.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={propertyTypeFilter} onValueChange={setPropertyTypeFilter}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Tipo imóvel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos tipos</SelectItem>
                  {propertyTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={packageFilter} onValueChange={setPackageFilter}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Pacote" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Com ou sem pacote</SelectItem>
                  <SelectItem value="with">Com pacote</SelectItem>
                  <SelectItem value="without">Sem pacote</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Anúncios ({filteredRows.length.toLocaleString("pt-BR")})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[280px]">Anúncio</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Anunciante</TableHead>
                      <TableHead className="text-right">Imóveis do anunciante</TableHead>
                      <TableHead>Cidade</TableHead>
                      <TableHead>Pacote</TableHead>
                      <TableHead className="text-right">Créditos</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead>Cadastro</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.slice(0, 500).map((r) => (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => setSelectedRow(r)}
                      >
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="font-semibold text-sm line-clamp-1">{r.title}</div>
                            <div className="text-[10px] text-muted-foreground font-mono uppercase">
                              {(r.property_type || "imóvel")} · {r.id.slice(0, 8)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><StatusPill status={r.visibility_status} /></TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium text-sm line-clamp-1">{r.advertiser_name}</div>
                            <KindPill kind={r.advertiser_kind} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          {r.advertiser_listings_total}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3" /> {r.city || "—"}{r.state ? `/${r.state}` : ""}
                          </div>
                        </TableCell>
                        <TableCell>
                          {r.package_name ? (
                            <span className="text-xs font-medium">{r.package_name}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-semibold">
                          {r.credits_consumed || 0}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {r.lead_count}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-semibold text-emerald-500">
                          {formatCurrencyBRL(r.price_brl)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(r.created_at), "dd/MM/yy", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRow(r);
                            }}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-16 text-sm text-muted-foreground">
                          Nenhum anúncio encontrado com os filtros atuais.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {filteredRows.length > 500 && (
                <div className="text-center text-[11px] text-muted-foreground py-2 border-t">
                  Mostrando as primeiras 500 linhas. Refine os filtros para ver menos.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Aba: Anunciantes ──────────────────────────────────────── */}
        <TabsContent value="anunciantes" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MiniCard
              title="Lojistas"
              value={kpis?.total_lojistas ?? 0}
              subtitle={`${kpis ? ((kpis.total_lojistas / Math.max(1, kpis.total_advertisers)) * 100).toFixed(0) : 0}% dos anunciantes`}
              icon={Store}
              tone="blue"
            />
            <MiniCard
              title="Pessoas Anunciantes"
              value={kpis?.total_pessoas ?? 0}
              subtitle={`${kpis ? ((kpis.total_pessoas / Math.max(1, kpis.total_advertisers)) * 100).toFixed(0) : 0}% dos anunciantes`}
              icon={UserIcon}
              tone="purple"
            />
            <MiniCard
              title="Média imóveis/anunciante"
              value={(kpis?.avg_listings_per_advertiser ?? 0).toFixed(1) as any}
              subtitle="densidade do portfólio"
              icon={TrendingUp}
              tone="emerald"
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Top Anunciantes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anunciante</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Ativos</TableHead>
                    <TableHead className="text-right">Pendentes</TableHead>
                    <TableHead className="text-right">Bloqueados</TableHead>
                    <TableHead className="text-right">Pacotes</TableHead>
                    <TableHead className="text-right">Créditos consumidos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topAdvertisers.map((a) => (
                    <TableRow key={a.user_id}>
                      <TableCell className="font-medium text-sm line-clamp-1">{a.name}</TableCell>
                      <TableCell><KindPill kind={a.kind} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.city || "—"}{a.state ? `/${a.state}` : ""}
                      </TableCell>
                      <TableCell className="text-right font-bold">{a.total_listings}</TableCell>
                      <TableCell className="text-right text-emerald-500 font-semibold">{a.active_listings}</TableCell>
                      <TableCell className="text-right text-amber-500 font-semibold">{a.pending_listings}</TableCell>
                      <TableCell className="text-right text-red-500 font-semibold">{a.blocked_listings}</TableCell>
                      <TableCell className="text-right">{a.packages_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.credits_consumed}</TableCell>
                    </TableRow>
                  ))}
                  {topAdvertisers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-10 text-sm text-muted-foreground">
                        Nenhum anunciante encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Aba: Pacotes ─────────────────────────────────────────── */}
        <TabsContent value="pacotes" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MiniCard
              title="Pacotes vendidos"
              value={kpis?.total_packages_sold ?? 0}
              subtitle="compras totais"
              icon={Package}
              tone="purple"
            />
            <MiniCard
              title="Pacotes ativos"
              value={packages.filter((p) => p.is_active).length}
              subtitle={`${packages.length} cadastrados`}
              icon={Sparkles}
              tone="amber"
            />
            <MiniCard
              title="Receita total (pacotes)"
              value={formatCurrencyBRL(packages.reduce((s, p) => s + p.total_revenue_brl, 0)) as any}
              subtitle="acumulado bruto"
              icon={Coins}
              tone="emerald"
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Desempenho por pacote
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pacote</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="text-right">Créditos</TableHead>
                    <TableHead className="text-right">Compras</TableHead>
                    <TableHead className="text-right">Compradores únicos</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Anúncios ligados</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packages.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-semibold text-sm">{p.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{p.slug}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrencyBRL(p.price_brl)}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.credits_amount}</TableCell>
                      <TableCell className="text-right font-bold">{p.purchases_count}</TableCell>
                      <TableCell className="text-right">{p.unique_buyers}</TableCell>
                      <TableCell className="text-right text-emerald-500 font-semibold tabular-nums">
                        {formatCurrencyBRL(p.total_revenue_brl)}
                      </TableCell>
                      <TableCell className="text-right">{p.listings_linked}</TableCell>
                      <TableCell>
                        {p.is_active ? (
                          <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Ativo</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Inativo</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {packages.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-10 text-sm text-muted-foreground">
                        Nenhum pacote cadastrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Aba: Créditos ────────────────────────────────────────── */}
        <TabsContent value="creditos" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MiniCard
              title="Créditos consumidos"
              value={kpis?.total_credits_consumed ?? 0}
              subtitle={`~${(kpis?.avg_credits_per_listing ?? 0).toFixed(1)} por anúncio`}
              icon={Coins}
              tone="amber"
            />
            <MiniCard
              title="Eventos no ledger"
              value={ledger.length}
              subtitle="últimas movimentações"
              icon={TrendingUp}
              tone="blue"
            />
            <MiniCard
              title="Anunciantes consumindo"
              value={advertisers.filter((a) => a.credits_consumed > 0).length}
              subtitle="com débito real"
              icon={Users}
              tone="purple"
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Histórico de consumo de créditos
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Anunciante</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Imóvel</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.slice(0, 200).map((e) => {
                    const isDebit = e.amount < 0 || e.entry_type === "debit";
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(e.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{e.advertiser_name}</TableCell>
                        <TableCell className="text-xs">
                          <span className="font-mono uppercase text-[10px] text-muted-foreground">
                            {e.reason_code || "—"}
                          </span>
                          {e.description && (
                            <div className="text-xs line-clamp-1">{e.description}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {e.listing_title || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums font-bold", isDebit ? "text-red-500" : "text-emerald-500")}>
                          {isDebit ? "" : "+"}{e.amount}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {e.entry_type}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {ledger.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-sm text-muted-foreground">
                        Nenhum lançamento de crédito encontrado no módulo real_estate.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Aba: Crescimento ─────────────────────────────────────── */}
        <TabsContent value="crescimento" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GrowthCard
              title="Novos anúncios"
              value={kpis?.new_listings_period ?? 0}
              deltaPct={kpis?.listings_growth_pct ?? 0}
              subtitle={`vs. ${periodDays} dias anteriores`}
            />
            <GrowthCard
              title="Novos anunciantes"
              value={kpis?.new_advertisers_period ?? 0}
              deltaPct={kpis?.advertisers_growth_pct ?? 0}
              subtitle={`vs. ${periodDays} dias anteriores`}
            />
          </div>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Série temporal — últimos {periodDays} dias
              </CardTitle>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary" /> anúncios</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500" /> anunciantes</span>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex items-end gap-1 h-44">
                {growth.map((g) => (
                  <div key={g.day} className="flex-1 flex flex-col items-center justify-end gap-0.5" title={`${g.day}: ${g.listings} anúncios · ${g.advertisers} anunciantes`}>
                    <div className="w-full flex items-end justify-center gap-[2px] h-full">
                      <div
                        className="w-1/2 bg-primary/80 rounded-t-sm"
                        style={{ height: `${(g.listings / chartMax) * 100}%` }}
                      />
                      <div
                        className="w-1/2 bg-blue-500/70 rounded-t-sm"
                        style={{ height: `${(g.advertisers / chartMax) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-2 font-mono">
                <span>{growth[0]?.day}</span>
                <span>{growth[growth.length - 1]?.day}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── DETAIL DRAWER ──────────────────────────────────────────────── */}
      <Sheet open={!!selectedRow} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {selectedRow && (
            <>
              <SheetHeader>
                <SheetTitle className="text-xl">{selectedRow.title}</SheetTitle>
                <div className="flex items-center gap-2 mt-1">
                  <StatusPill status={selectedRow.visibility_status} />
                  <KindPill kind={selectedRow.advertiser_kind} />
                </div>
              </SheetHeader>
              <div className="space-y-6 py-6">
                <div className="grid grid-cols-2 gap-3">
                  <DetailItem label="ID" value={selectedRow.id} mono />
                  <DetailItem label="Tipo" value={selectedRow.property_type || "—"} />
                  <DetailItem label="Preço" value={formatCurrencyBRL(selectedRow.price_brl)} />
                  <DetailItem
                    label="Área total"
                    value={
                      selectedRow.total_area_m2
                        ? `${(selectedRow.total_area_m2 / 10000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha`
                        : "—"
                    }
                  />
                  <DetailItem label="Quartos" value={String(selectedRow.bedrooms ?? 0)} />
                  <DetailItem label="Banheiros" value={String(selectedRow.bathrooms ?? 0)} />
                  <DetailItem label="Cidade" value={`${selectedRow.city ?? "—"}${selectedRow.state ? `/${selectedRow.state}` : ""}`} />
                  <DetailItem label="Bairro" value={selectedRow.neighborhood || "—"} />
                </div>

                <div className="border-t pt-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Anunciante
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <DetailItem label="Nome" value={selectedRow.advertiser_name} />
                    <DetailItem label="Tipo" value={selectedRow.advertiser_kind} />
                    <DetailItem label="Cidade" value={selectedRow.advertiser_city || "—"} />
                    <DetailItem label="Telefone" value={selectedRow.advertiser_phone || "—"} />
                    <DetailItem label="Total de imóveis" value={String(selectedRow.advertiser_listings_total)} />
                    <DetailItem label="Pacote vinculado" value={selectedRow.package_name || "—"} />
                  </div>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Métricas
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <DetailItem label="Créditos consumidos" value={String(selectedRow.credits_consumed)} />
                    <DetailItem label="Leads gerados" value={String(selectedRow.lead_count)} />
                    <DetailItem
                      label="Cadastro"
                      value={format(new Date(selectedRow.created_at), "dd 'de' MMMM yyyy", { locale: ptBR })}
                    />
                    <DetailItem
                      label="Publicação"
                      value={
                        selectedRow.published_at
                          ? format(new Date(selectedRow.published_at), "dd/MM/yyyy", { locale: ptBR })
                          : "—"
                      }
                    />
                  </div>
                </div>

                {selectedRow.description && (
                  <div className="border-t pt-4 space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Descrição
                    </h4>
                    <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                      {selectedRow.description}
                    </p>
                  </div>
                )}

                <div className="border-t pt-4 flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={() => window.open(`/imoveis/${selectedRow.id}`, "_blank")}
                  >
                    <ExternalLink className="w-4 h-4" /> Ver página pública
                  </Button>
                  {selectedRow.owner_user_id && (
                    <Button
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={() => navigate(`/admin/users/${selectedRow.owner_user_id}`)}
                    >
                      <UserIcon className="w-4 h-4" /> Abrir anunciante
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Subcomponentes ─────────────────────────────────────────────────────────

const TONE: Record<string, { bg: string; fg: string; accent: string }> = {
  primary: { bg: "bg-primary/10", fg: "text-primary", accent: "border-primary/30" },
  emerald: { bg: "bg-emerald-500/10", fg: "text-emerald-500", accent: "border-emerald-500/30" },
  amber:   { bg: "bg-amber-500/10",   fg: "text-amber-500",   accent: "border-amber-500/30" },
  red:     { bg: "bg-red-500/10",     fg: "text-red-500",     accent: "border-red-500/30" },
  blue:    { bg: "bg-blue-500/10",    fg: "text-blue-500",    accent: "border-blue-500/30" },
  purple:  { bg: "bg-purple-500/10",  fg: "text-purple-500",  accent: "border-purple-500/30" },
};

function KpiCard({
  label, value, icon: Icon, tone = "primary", subtitle, delta, deltaPositive,
}: {
  label: string;
  value: number | string;
  icon: any;
  tone?: keyof typeof TONE;
  subtitle?: string;
  delta?: string;
  deltaPositive?: boolean;
}) {
  const t = TONE[tone];
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className={cn("p-2 rounded-lg", t.bg)}>
            <Icon className={cn("w-4 h-4", t.fg)} />
          </div>
          {delta !== undefined && (
            <div
              className={cn(
                "flex items-center gap-0.5 text-[10px] font-bold",
                deltaPositive ? "text-emerald-500" : "text-red-500"
              )}
            >
              {deltaPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {delta}
            </div>
          )}
        </div>
        <div>
          <div className="text-2xl font-black tabular-nums tracking-tight">
            {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">
            {label}
          </div>
          {subtitle && (
            <div className="text-[11px] text-muted-foreground mt-1">{subtitle}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniCard({
  title, value, subtitle, icon: Icon, tone = "primary",
}: {
  title: string; value: number | string; subtitle?: string; icon: any; tone?: keyof typeof TONE;
}) {
  const t = TONE[tone];
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={cn("p-3 rounded-xl", t.bg)}>
          <Icon className={cn("w-5 h-5", t.fg)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</div>
          <div className="text-2xl font-black tabular-nums mt-0.5">
            {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
          </div>
          {subtitle && <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function GrowthCard({
  title, value, deltaPct, subtitle,
}: {
  title: string; value: number; deltaPct: number; subtitle: string;
}) {
  const positive = deltaPct >= 0;
  return (
    <Card>
      <CardContent className="p-5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</div>
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-bold",
              positive ? "text-emerald-500" : "text-red-500"
            )}
          >
            {positive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {formatPct(deltaPct)}
          </div>
        </div>
        <div className="text-4xl font-black tabular-nums">{value.toLocaleString("pt-BR")}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </CardContent>
    </Card>
  );
}

function DetailItem({
  label, value, mono,
}: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className={cn("text-sm font-medium break-words", mono && "font-mono text-xs")}>
        {value}
      </div>
    </div>
  );
}
