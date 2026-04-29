import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Store, Search, Loader2, Eye, ShoppingBag, Zap,
    CheckCircle, XCircle, MapPin, Package, BarChart3, Filter,
    Wifi, WifiOff,
} from "lucide-react";
import { useAdminStores, AdminStore } from "@/hooks/useAdminStores";
import { useAdminStoresRealtime } from "@/hooks/useAdminStoresRealtime";

export default function AdminStores() {
    const navigate = useNavigate();
    const { stores, isLoading, kpis, cities, bairros } = useAdminStores();
    const { lastSyncedAt, isConnected } = useAdminStoresRealtime();

    const [search, setSearch] = useState("");
    const [cityFilter, setCityFilter] = useState("all");
    const [bairroFilter, setBairroFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [productFilter, setProductFilter] = useState("all"); // all | with | without
    const [m1Filter, setM1Filter] = useState("all"); // all | with | without

    const filtered = useMemo(() => {
        return stores.filter(s => {
            if (cityFilter !== "all" && s.city !== cityFilter) return false;
            if (bairroFilter !== "all" && s.bairro !== bairroFilter) return false;
            if (statusFilter !== "all" && s.status !== statusFilter) return false;
            if (productFilter === "with" && s.product_count === 0) return false;
            if (productFilter === "without" && s.product_count > 0) return false;
            if (m1Filter === "with" && s.m1_event_count === 0) return false;
            if (m1Filter === "without" && s.m1_event_count > 0) return false;
            if (search.trim()) {
                const q = search.toLowerCase();
                if (
                    !(s.store_name || "").toLowerCase().includes(q) &&
                    !(s.owner_name || "").toLowerCase().includes(q) &&
                    !(s.email || "").toLowerCase().includes(q) &&
                    !(s.id || "").toLowerCase().includes(q)
                ) return false;
            }
            return true;
        });
    }, [stores, search, cityFilter, bairroFilter, statusFilter, productFilter, m1Filter]);

    const kpiCards = [
        { label: "Total de Lojas", value: kpis.total, icon: Store, color: "text-primary" },
        { label: "Ativas", value: kpis.active, icon: CheckCircle, color: "text-emerald-500" },
        { label: "Inativas", value: kpis.inactive, icon: XCircle, color: "text-red-400" },
        { label: "Com Produtos", value: kpis.withProducts, icon: Package, color: "text-blue-500" },
        { label: "Sem Produtos", value: kpis.withoutProducts, icon: ShoppingBag, color: "text-amber-500" },
        { label: "Com M1", value: kpis.withM1, icon: Zap, color: "text-purple-500" },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
                        <Store className="h-6 w-6 text-primary" />
                        Gestão de Lojas
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Visão completa de todas as lojas cadastradas na plataforma
                    </p>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] shrink-0 mt-1">
                    {isConnected ? (
                        <Wifi className="h-3 w-3 text-emerald-500" />
                    ) : (
                        <WifiOff className="h-3 w-3 text-red-400" />
                    )}
                    <span className={isConnected ? "text-emerald-600" : "text-red-400"}>
                        {isConnected ? "Ao vivo" : "Reconectando..."}
                    </span>
                    <span className="text-muted-foreground/50 ml-1">
                        Sincronizado {lastSyncedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                {kpiCards.map(kpi => (
                    <Card key={kpi.label} className="border-border/60 bg-card/80 backdrop-blur-sm">
                        <CardContent className="flex items-center gap-3 py-3 px-4">
                            <kpi.icon className={`h-5 w-5 ${kpi.color} shrink-0`} />
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{kpi.label}</p>
                                <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Search + Filters */}
            <Card className="border-border/60">
                <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Filtros</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        {/* Search */}
                        <div className="relative xl:col-span-2">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nome, email, responsável ou ID..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-10 bg-background border-border/60"
                            />
                        </div>

                        {/* City */}
                        <select
                            value={cityFilter}
                            onChange={e => setCityFilter(e.target.value)}
                            className="h-10 px-3 rounded-md border border-border/60 bg-background text-sm"
                        >
                            <option value="all">Todas as Cidades</option>
                            {cities.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>

                        {/* Bairro */}
                        <select
                            value={bairroFilter}
                            onChange={e => setBairroFilter(e.target.value)}
                            className="h-10 px-3 rounded-md border border-border/60 bg-background text-sm"
                        >
                            <option value="all">Todos os Bairros</option>
                            {bairros.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>

                        {/* Status */}
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="h-10 px-3 rounded-md border border-border/60 bg-background text-sm"
                        >
                            <option value="all">Todos os Status</option>
                            <option value="ativo">Ativo</option>
                            <option value="inativo">Inativo</option>
                        </select>

                        {/* Products */}
                        <select
                            value={productFilter}
                            onChange={e => setProductFilter(e.target.value)}
                            className="h-10 px-3 rounded-md border border-border/60 bg-background text-sm"
                        >
                            <option value="all">Produtos: Todos</option>
                            <option value="with">Com Produtos</option>
                            <option value="without">Sem Produtos</option>
                        </select>

                        {/* M1 */}
                        <select
                            value={m1Filter}
                            onChange={e => setM1Filter(e.target.value)}
                            className="h-10 px-3 rounded-md border border-border/60 bg-background text-sm"
                        >
                            <option value="all">M1: Todos</option>
                            <option value="with">Com Eventos M1</option>
                            <option value="without">Sem Eventos M1</option>
                        </select>
                    </div>

                    <div className="text-xs text-muted-foreground">
                        Mostrando <span className="font-bold text-foreground">{filtered.length}</span> de {stores.length} lojas
                    </div>
                </CardContent>
            </Card>

            {/* Main Table */}
            <Card className="shadow-lg border-border/60">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-16">
                            <Store className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                            <p className="text-sm text-muted-foreground">Nenhuma loja encontrada</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/30">
                                        <TableHead className="font-bold">Loja</TableHead>
                                        <TableHead className="font-bold">Responsável</TableHead>
                                        <TableHead className="font-bold">Cidade</TableHead>
                                        <TableHead className="font-bold text-center">Status</TableHead>
                                        <TableHead className="font-bold text-center">Produtos</TableHead>
                                        <TableHead className="font-bold text-center">M1 Eventos</TableHead>
                                        <TableHead className="font-bold text-center">M1 Cobrado</TableHead>
                                        <TableHead className="font-bold">Criação</TableHead>
                                        <TableHead className="font-bold text-center">Ação</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filtered.map(store => (
                                        <TableRow
                                            key={store.id}
                                            className="cursor-pointer hover:bg-muted/40 transition-colors"
                                            onClick={() => navigate(`/admin/lojas/${store.id}`)}
                                        >
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {store.logo_url ? (
                                                        <img src={store.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
                                                    ) : (
                                                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                                            <Store className="h-4 w-4 text-primary" />
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-sm truncate max-w-[200px]">
                                                            {store.store_name || "Sem nome"}
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
                                                            {store.id.substring(0, 8)}...
                                                        </p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="min-w-0">
                                                    <p className="text-sm truncate max-w-[160px]">{store.owner_name || "—"}</p>
                                                    <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">{store.email || ""}</p>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1 text-sm">
                                                    <MapPin className="h-3 w-3 text-muted-foreground" />
                                                    <span className="truncate max-w-[120px]">
                                                        {store.city || "—"}
                                                        {store.state ? ` - ${store.state}` : ""}
                                                    </span>
                                                </div>
                                                {store.bairro && (
                                                    <p className="text-[10px] text-muted-foreground ml-4">{store.bairro}</p>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {(store.status === "ativo" || store.status === "active" || !store.status) ? (
                                                    <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-400/30 text-[10px]">
                                                        Ativo
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="destructive" className="text-[10px]">
                                                        {store.status}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className={`font-bold text-sm ${store.product_count > 0 ? "text-blue-500" : "text-muted-foreground"}`}>
                                                    {store.product_count}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className={`font-bold text-sm ${store.m1_event_count > 0 ? "text-purple-500" : "text-muted-foreground"}`}>
                                                    {store.m1_event_count}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {store.m1_total_charged > 0 ? (
                                                    <span className="font-mono text-sm font-bold text-emerald-600">
                                                        R$ {store.m1_total_charged.toFixed(2)}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground text-sm">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-xs text-muted-foreground">
                                                    {store.created_at
                                                        ? new Date(store.created_at).toLocaleDateString("pt-BR")
                                                        : "—"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-xs"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/admin/lojas/${store.id}`);
                                                    }}
                                                >
                                                    <Eye className="h-3 w-3 mr-1" />
                                                    Ver
                                                </Button>
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
