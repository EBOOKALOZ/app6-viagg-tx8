import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Store, Search, Loader2, Package, TrendingUp, AlertTriangle,
    Crown, Users, Filter, Flame, Snowflake, Activity, Eye,
    Building2, Coins, Zap, X,
} from "lucide-react";
import { useStoreList360, useStore360, StoreListFilters, Store360Row } from "@/hooks/useAdminLoja5";
import { Store360Panel } from "@/components/admin/loja5/Store360Panel";
import { Account360Panel } from "@/components/admin/loja5/Account360Panel";

// ═══════════════════════════════════════
// Activity Badge
// ═══════════════════════════════════════
const activityMap: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    quente: { label: "Quente", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: Flame },
    ativa: { label: "Ativa", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: Activity },
    morna: { label: "Morna", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: TrendingUp },
    fria: { label: "Fria", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Snowflake },
    sem_movimento: { label: "Parada", color: "bg-zinc-600/30 text-zinc-400 border-zinc-600/40", icon: AlertTriangle },
};

function ActivityBadge({ badge }: { badge: string }) {
    const cfg = activityMap[badge] || activityMap.sem_movimento;
    return (
        <Badge className={`${cfg.color} text-[9px] gap-0.5 px-1.5 py-0`}>
            <cfg.icon className="h-2.5 w-2.5" />
            {cfg.label}
        </Badge>
    );
}

// ═══════════════════════════════════════
// KPI Card
// ═══════════════════════════════════════
function KpiCard({ label, value, color, icon: Icon, onClick, active }: {
    label: string; value: string | number; color: string; icon: any;
    onClick?: () => void; active?: boolean;
}) {
    return (
        <Card
            className={`border-zinc-800/60 bg-zinc-900/80 backdrop-blur-sm transition-all cursor-pointer hover:border-zinc-700 ${active ? "ring-1 ring-primary/50 border-primary/30" : ""}`}
            onClick={onClick}
        >
            <CardContent className="flex items-center gap-3 py-3 px-4">
                <Icon className={`h-5 w-5 ${color} shrink-0`} />
                <div>
                    <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold">{label}</p>
                    <p className={`text-xl font-bold ${color}`}>{value}</p>
                </div>
            </CardContent>
        </Card>
    );
}

// ═══════════════════════════════════════
// Segment Chip
// ═══════════════════════════════════════
function SegmentChip({ label, count, active, onClick, color }: {
    label: string; count: number; active: boolean; onClick: () => void; color: string;
}) {
    return (
        <button
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all border ${
                active
                    ? `${color} ring-1 ring-primary/30`
                    : "bg-zinc-900/60 text-zinc-400 border-zinc-800/60 hover:border-zinc-700"
            }`}
        >
            {label}
            <span className="bg-white/10 rounded-full px-1.5 py-0 text-[9px] font-bold">{count}</span>
        </button>
    );
}

// ═══════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════
export default function AdminLoja5() {
    // Filters state
    const [search, setSearch] = useState("");
    const [cityFilter, setCityFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [activityFilter, setActivityFilter] = useState("");
    const [upgradeFilter, setUpgradeFilter] = useState<boolean | null>(null);
    const [churnFilter, setChurnFilter] = useState<boolean | null>(null);
    const [multiProfileFilter, setMultiProfileFilter] = useState<boolean | null>(null);
    const [auctionFilter, setAuctionFilter] = useState<boolean | null>(null);
    const [arremateFilter, setArremateFilter] = useState<boolean | null>(null);

    // Active segment
    const [activeSegment, setActiveSegment] = useState<string | null>(null);

    // Detail view
    const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

    // Build filters object
    const filters: StoreListFilters = useMemo(() => ({
        search: search || undefined,
        city: cityFilter || undefined,
        status: statusFilter || undefined,
        activity: activityFilter || undefined,
        upgrade: upgradeFilter,
        churn: churnFilter,
        multiProfile: multiProfileFilter,
        hasAuction: auctionFilter,
        hasArremate: arremateFilter,
    }), [search, cityFilter, statusFilter, activityFilter, upgradeFilter, churnFilter, multiProfileFilter, auctionFilter, arremateFilter]);

    const { stores, isLoading, kpis, cities } = useStoreList360(filters);
    const { data: store360Data, isLoading: storeDetailLoading } = useStore360(selectedStoreId);

    // Segment handlers
    function toggleSegment(segment: string) {
        if (activeSegment === segment) {
            // Clear
            setActiveSegment(null);
            setUpgradeFilter(null);
            setChurnFilter(null);
            setMultiProfileFilter(null);
            setActivityFilter("");
            return;
        }
        // Reset all first
        setUpgradeFilter(null);
        setChurnFilter(null);
        setMultiProfileFilter(null);
        setActivityFilter("");
        setActiveSegment(segment);

        switch (segment) {
            case "upgrade": setUpgradeFilter(true); break;
            case "churn": setChurnFilter(true); break;
            case "multi": setMultiProfileFilter(true); break;
            case "traffic": break; // filtered client-side below
            case "new": break;
            case "subscription": break;
        }
    }

    // Client-side segment filtering for signals not filterable via RPC params
    const filtered = useMemo(() => {
        if (!activeSegment || ["upgrade", "churn", "multi"].includes(activeSegment)) return stores;
        return stores.filter(s => {
            if (activeSegment === "traffic") return s.traffic_no_conversion;
            if (activeSegment === "new") return s.new_no_activation;
            if (activeSegment === "subscription") return s.subscription_ready;
            return true;
        });
    }, [stores, activeSegment]);

    const clearAllFilters = () => {
        setSearch("");
        setCityFilter("");
        setStatusFilter("");
        setActivityFilter("");
        setUpgradeFilter(null);
        setChurnFilter(null);
        setMultiProfileFilter(null);
        setAuctionFilter(null);
        setArremateFilter(null);
        setActiveSegment(null);
    };

    const hasActiveFilters = search || cityFilter || statusFilter || activityFilter || upgradeFilter !== null || churnFilter !== null || multiProfileFilter !== null || auctionFilter !== null || arremateFilter !== null;

    // ═══ DETAIL VIEWS ═══
    if (selectedAccountId) {
        return (
            <div className="min-h-screen">
                <Account360Panel
                    userId={selectedAccountId}
                    onClose={() => setSelectedAccountId(null)}
                    onViewStore={(storeId) => {
                        setSelectedAccountId(null);
                        setSelectedStoreId(storeId);
                    }}
                />
            </div>
        );
    }

    if (selectedStoreId && store360Data) {
        return (
            <div className="min-h-screen">
                <Store360Panel
                    data={store360Data}
                    onClose={() => setSelectedStoreId(null)}
                    onViewAccount={(userId) => {
                        setSelectedStoreId(null);
                        setSelectedAccountId(userId);
                    }}
                />
            </div>
        );
    }

    if (selectedStoreId && storeDetailLoading) {
        return (
            <div className="flex items-center justify-center py-20 gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm text-zinc-500">Carregando Loja 360...</span>
            </div>
        );
    }

    // ═══ LIST VIEW ═══
    return (
        <div className="space-y-5 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                    <Building2 className="h-6 w-6 text-primary" />
                    LOJA 5 — Inteligência de Lojas
                </h1>
                <p className="text-xs text-zinc-500 mt-1">
                    Camada premium de análise administrativa • Leitura analítica consolidada
                </p>
            </div>

            {/* Executive KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                <KpiCard label="Total Lojas" value={kpis.total} icon={Store} color="text-zinc-200" />
                <KpiCard label="Ativas" value={kpis.active} icon={Activity} color="text-emerald-400" />
                <KpiCard label="Upgrade" value={kpis.upgradeReady} icon={TrendingUp} color="text-amber-400"
                    onClick={() => toggleSegment("upgrade")} active={activeSegment === "upgrade"} />
                <KpiCard label="Risco Churn" value={kpis.churnRisk} icon={AlertTriangle} color="text-red-400"
                    onClick={() => toggleSegment("churn")} active={activeSegment === "churn"} />
                <KpiCard label="Receita Total" value={`R$ ${kpis.totalRevenue.toFixed(0)}`} icon={Coins} color="text-emerald-400" />
                <KpiCard label="Multi-Perfil" value={kpis.multiProfile} icon={Users} color="text-indigo-400"
                    onClick={() => toggleSegment("multi")} active={activeSegment === "multi"} />
            </div>

            {/* Segment Chips */}
            <div className="flex flex-wrap gap-2">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold self-center mr-1">Segmentos:</span>
                <SegmentChip label="⬆ Prontas p/ Upgrade" count={kpis.upgradeReady} active={activeSegment === "upgrade"} onClick={() => toggleSegment("upgrade")} color="bg-amber-500/20 text-amber-400 border-amber-500/30" />
                <SegmentChip label="👑 Prontas p/ Assinatura" count={kpis.subscriptionReady} active={activeSegment === "subscription"} onClick={() => toggleSegment("subscription")} color="bg-purple-500/20 text-purple-400 border-purple-500/30" />
                <SegmentChip label="⚠ Risco de Churn" count={kpis.churnRisk} active={activeSegment === "churn"} onClick={() => toggleSegment("churn")} color="bg-red-500/20 text-red-400 border-red-500/30" />
                <SegmentChip label="👁 Tráfego s/ Conversão" count={kpis.trafficNoConversion} active={activeSegment === "traffic"} onClick={() => toggleSegment("traffic")} color="bg-orange-500/20 text-orange-400 border-orange-500/30" />
                <SegmentChip label="🆕 Sem Ativação" count={kpis.newNoActivation} active={activeSegment === "new"} onClick={() => toggleSegment("new")} color="bg-zinc-600/40 text-zinc-300 border-zinc-600/50" />
                <SegmentChip label="🔗 Multi-Perfil Estratégica" count={kpis.multiProfile} active={activeSegment === "multi"} onClick={() => toggleSegment("multi")} color="bg-indigo-500/20 text-indigo-400 border-indigo-500/30" />
            </div>

            {/* Filters */}
            <Card className="border-zinc-800/60 bg-zinc-900/60">
                <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-zinc-500 shrink-0" />
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Filtros Avançados</span>
                        </div>
                        {hasActiveFilters && (
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-zinc-400" onClick={clearAllFilters}>
                                <X className="h-3 w-3 mr-1" /> Limpar
                            </Button>
                        )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
                        {/* Search */}
                        <div className="relative xl:col-span-2">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                            <Input
                                placeholder="Buscar por nome, email, responsável ou ID..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-10 bg-zinc-950 border-zinc-800/60 text-zinc-200 placeholder:text-zinc-600"
                            />
                        </div>

                        <select value={cityFilter} onChange={e => setCityFilter(e.target.value)}
                            className="h-10 px-3 rounded-md border border-zinc-800/60 bg-zinc-950 text-sm text-zinc-300">
                            <option value="">Todas as Cidades</option>
                            {cities.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>

                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                            className="h-10 px-3 rounded-md border border-zinc-800/60 bg-zinc-950 text-sm text-zinc-300">
                            <option value="">Todos os Status</option>
                            <option value="ativo">Ativo</option>
                            <option value="inativo">Inativo</option>
                        </select>

                        <select value={activityFilter} onChange={e => setActivityFilter(e.target.value)}
                            className="h-10 px-3 rounded-md border border-zinc-800/60 bg-zinc-950 text-sm text-zinc-300">
                            <option value="">Todas as Atividades</option>
                            <option value="quente">🔥 Quente</option>
                            <option value="ativa">✅ Ativa</option>
                            <option value="morna">🟡 Morna</option>
                            <option value="fria">❄️ Fria</option>
                            <option value="sem_movimento">⏸ Sem Movimento</option>
                        </select>

                        <select value={auctionFilter === null ? "" : auctionFilter ? "yes" : "no"}
                            onChange={e => setAuctionFilter(e.target.value === "" ? null : e.target.value === "yes")}
                            className="h-10 px-3 rounded-md border border-zinc-800/60 bg-zinc-950 text-sm text-zinc-300">
                            <option value="">Leilão: Todos</option>
                            <option value="yes">Com Leilão Ativo</option>
                            <option value="no">Sem Leilão</option>
                        </select>

                        <select value={arremateFilter === null ? "" : arremateFilter ? "yes" : "no"}
                            onChange={e => setArremateFilter(e.target.value === "" ? null : e.target.value === "yes")}
                            className="h-10 px-3 rounded-md border border-zinc-800/60 bg-zinc-950 text-sm text-zinc-300">
                            <option value="">Arremate: Todos</option>
                            <option value="yes">Com Arremate Ativo</option>
                            <option value="no">Sem Arremate</option>
                        </select>

                        <select value={multiProfileFilter === null ? "" : multiProfileFilter ? "yes" : "no"}
                            onChange={e => setMultiProfileFilter(e.target.value === "" ? null : e.target.value === "yes")}
                            className="h-10 px-3 rounded-md border border-zinc-800/60 bg-zinc-950 text-sm text-zinc-300">
                            <option value="">Multi-Perfil: Todos</option>
                            <option value="yes">Conta Multi-Perfil</option>
                            <option value="no">Perfil Único</option>
                        </select>
                    </div>

                    <div className="text-[11px] text-zinc-500">
                        Mostrando <span className="font-bold text-zinc-300">{filtered.length}</span> de {stores.length} lojas
                    </div>
                </CardContent>
            </Card>

            {/* Main Table */}
            <Card className="shadow-xl border-zinc-800/60 bg-zinc-900/60">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-20 gap-3">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            <span className="text-sm text-zinc-500">Carregando inteligência...</span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-16">
                            <Store className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                            <p className="text-sm text-zinc-500">Nenhuma loja encontrada</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-zinc-900/80 border-zinc-800">
                                        <TableHead className="text-[10px] text-zinc-500 font-bold">Loja</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500 font-bold">Responsável</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500 font-bold">Cidade / UF</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500 font-bold text-center">Status</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500 font-bold text-center">Perfis</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500 font-bold text-center">Produtos</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500 font-bold text-center">Intenções</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500 font-bold text-center">Pedidos</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500 font-bold text-center">Créditos</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500 font-bold text-center">Atividade</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500 font-bold text-center">Upgrade</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500 font-bold text-center">Churn</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500 font-bold text-right">Receita</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500 font-bold">Criação</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filtered.map((store) => (
                                        <TableRow
                                            key={store.store_id}
                                            className="cursor-pointer hover:bg-zinc-800/50 transition-colors border-zinc-800/40"
                                            onClick={() => setSelectedStoreId(store.store_id)}
                                        >
                                            {/* Loja */}
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {store.logo_url ? (
                                                        <img src={store.logo_url} alt="" className="h-7 w-7 rounded-lg object-cover ring-1 ring-zinc-700" />
                                                    ) : (
                                                        <div className="h-7 w-7 rounded-lg bg-zinc-800 flex items-center justify-center ring-1 ring-zinc-700">
                                                            <Store className="h-3.5 w-3.5 text-zinc-500" />
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-semibold text-zinc-200 truncate max-w-[160px]">
                                                            {store.store_name || "Sem nome"}
                                                        </p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            {/* Responsável */}
                                            <TableCell>
                                                <div className="min-w-0">
                                                    <p className="text-xs text-zinc-300 truncate max-w-[130px]">{store.owner_name || "—"}</p>
                                                    <p className="text-[9px] text-zinc-600 truncate max-w-[130px]">{store.owner_email || ""}</p>
                                                </div>
                                            </TableCell>
                                            {/* Cidade */}
                                            <TableCell>
                                                <span className="text-xs text-zinc-400 truncate block max-w-[100px]">
                                                    {store.city || "—"}{store.state ? ` - ${store.state}` : ""}
                                                </span>
                                            </TableCell>
                                            {/* Status */}
                                            <TableCell className="text-center">
                                                {(store.status === "ativo" || store.status === "active" || !store.status) ? (
                                                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px]">Ativo</Badge>
                                                ) : (
                                                    <Badge className="bg-red-500/20 text-red-400 text-[9px]">{store.status}</Badge>
                                                )}
                                            </TableCell>
                                            {/* Perfis */}
                                            <TableCell className="text-center">
                                                <span className={`text-xs font-bold ${store.profile_count > 1 ? "text-indigo-400" : "text-zinc-500"}`}>
                                                    {store.profile_count}
                                                </span>
                                            </TableCell>
                                            {/* Produtos */}
                                            <TableCell className="text-center">
                                                <span className={`text-xs font-bold ${store.active_product_count > 0 ? "text-blue-400" : "text-zinc-600"}`}>
                                                    {store.active_product_count}
                                                </span>
                                            </TableCell>
                                            {/* Intenções */}
                                            <TableCell className="text-center">
                                                <span className={`text-xs font-bold ${store.intention_count > 0 ? "text-purple-400" : "text-zinc-600"}`}>
                                                    {store.intention_count}
                                                </span>
                                            </TableCell>
                                            {/* Pedidos */}
                                            <TableCell className="text-center">
                                                <span className={`text-xs font-bold ${store.order_count > 0 ? "text-emerald-400" : "text-zinc-600"}`}>
                                                    {store.order_count}
                                                </span>
                                            </TableCell>
                                            {/* Créditos */}
                                            <TableCell className="text-center">
                                                <span className={`text-xs font-mono font-bold ${store.credit_balance <= 5 ? "text-red-400" : "text-amber-400"}`}>
                                                    {store.credit_balance}
                                                </span>
                                            </TableCell>
                                            {/* Atividade */}
                                            <TableCell className="text-center">
                                                <ActivityBadge badge={store.activity_badge} />
                                            </TableCell>
                                            {/* Upgrade */}
                                            <TableCell className="text-center">
                                                {store.upgrade_signal ? (
                                                    <Badge className="bg-amber-500/20 text-amber-400 text-[9px] px-1.5">⬆</Badge>
                                                ) : <span className="text-zinc-700">—</span>}
                                            </TableCell>
                                            {/* Churn */}
                                            <TableCell className="text-center">
                                                {store.churn_signal ? (
                                                    <Badge className="bg-red-500/20 text-red-400 text-[9px] px-1.5">⚠</Badge>
                                                ) : <span className="text-zinc-700">—</span>}
                                            </TableCell>
                                            {/* Receita */}
                                            <TableCell className="text-right">
                                                {store.estimated_revenue > 0 ? (
                                                    <span className="text-xs font-mono font-bold text-emerald-400">
                                                        R$ {store.estimated_revenue.toFixed(2)}
                                                    </span>
                                                ) : (
                                                    <span className="text-zinc-700 text-xs">—</span>
                                                )}
                                            </TableCell>
                                            {/* Criação */}
                                            <TableCell>
                                                <span className="text-[10px] text-zinc-500">
                                                    {store.created_at ? new Date(store.created_at).toLocaleDateString("pt-BR") : "—"}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
