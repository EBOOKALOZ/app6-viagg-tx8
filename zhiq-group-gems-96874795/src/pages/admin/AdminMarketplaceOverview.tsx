import { useState, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
    Store, Package, Gavel, Hammer, Coins, TrendingUp, 
    ArrowUpRight, ArrowDownRight, RefreshCw, BarChart3, 
    Search, Eye, Building2, LayoutDashboard, Loader2,
    Calendar, Users, Activity, Layers, Landmark
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminDashboardSnapshot } from "@/hooks/admin/useAdminDashboardSnapshot";
import { useAuth } from "@/contexts/AuthContext";

// ═══════════════════════════════════════
// Helper Components
// ═══════════════════════════════════════

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
};

const formatNumber = (value: number) => {
    return new Intl.NumberFormat("pt-BR").format(value);
};

const DeltaBadge = ({ delta }: { delta: number }) => {
    const isPositive = delta >= 0;
    return (
        <Badge variant="outline" className={`text-[10px] font-bold ${isPositive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
            {isPositive ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
            {Math.abs(delta).toFixed(2)}%
        </Badge>
    );
};

const KpiCard = ({ title, value, subtitle, delta, icon: Icon, color }: any) => (
    <Card className="border-zinc-800/60 bg-zinc-900/80 backdrop-blur-sm shadow-xl">
        <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <div className={`p-2 rounded-lg bg-zinc-950 border border-zinc-800 shadow-inner ${color}`}>
                    <Icon className="h-5 w-5" />
                </div>
                <DeltaBadge delta={delta} />
            </div>
            <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">{title}</p>
                <p className="text-2xl font-black text-white tracking-tight">{value}</p>
                <p className="text-[11px] text-zinc-600 mt-1">{subtitle}</p>
            </div>
        </CardContent>
    </Card>
);

const DetailBlock = ({ title, items, icon: Icon }: any) => (
    <Card className="border-zinc-800/60 bg-zinc-900/40">
        <CardHeader className="py-4 px-5 border-b border-zinc-800/60 flex flex-row items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-bold text-zinc-300 uppercase tracking-wider">{title}</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
            <div className="grid grid-cols-2 gap-4">
                {items.map((item: any, i: number) => (
                    <div key={i} className="space-y-1">
                        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">{item.label}</p>
                        <p className="text-lg font-bold text-zinc-200">{item.value}</p>
                        {item.delta !== undefined && <DeltaBadge delta={item.delta} />}
                    </div>
                ))}
            </div>
        </CardContent>
    </Card>
);

const RankingList = ({ title, items, icon: Icon, labels }: any) => (
    <Card className="border-zinc-800/60 bg-zinc-900/60">
        <CardHeader className="py-4 px-5 border-b border-zinc-800/60 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-amber-400" />
                <CardTitle className="text-sm font-bold text-zinc-300 uppercase tracking-wider">{title}</CardTitle>
            </div>
        </CardHeader>
        <CardContent className="p-0">
            {items.length === 0 ? (
                <div className="p-10 text-center text-zinc-600 text-xs italic">Sem dados ainda</div>
            ) : (
                <div className="divide-y divide-zinc-800/40">
                    {items.slice(0, 5).map((item: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-4 hover:bg-zinc-800/20 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="text-xs font-bold text-zinc-700 w-4">{i + 1}.</span>
                                <p className="text-xs font-semibold text-zinc-300 truncate">
                                    {item[labels.name]}
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-xs font-black text-zinc-100">{labels.format ? labels.format(item[labels.value]) : item[labels.value]}</p>
                                {labels.sub && <p className="text-[9px] text-zinc-500 uppercase">{labels.sub(item)}</p>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </CardContent>
    </Card>
);

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════

export default function AdminMarketplaceOverview() {
    const { session, initialized: authInitialized } = useAuth();
    const [days, setDays] = useState(30);

    const dates = useMemo(() => {
        const to = new Date();
        const from = new Date();
        from.setDate(to.getDate() - days);
        return {
            from: from.toISOString(),
            to: to.toISOString()
        };
    }, [days]);

    const { data: snapshot, isLoading, error, refetch } = useAdminDashboardSnapshot(
        dates.from, 
        dates.to, 
        { enabled: authInitialized && !!session }
    );

    // 1. Loading Session State
    if (!authInitialized) {
        return (
            <div className="flex flex-col items-center justify-center py-40 gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary opacity-50" />
                <p className="text-sm text-zinc-500 font-medium animate-pulse tracking-wide uppercase">Sincronizando Sessão...</p>
            </div>
        );
    }

    // 2. Authentication check
    if (!session) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="p-4 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500">
                    <Activity className="h-8 w-8" />
                </div>
                <div className="text-center max-w-md">
                    <h2 className="text-xl font-bold text-white">Sessão Admin Expirada</h2>
                    <p className="text-sm text-zinc-500 mt-2">Por favor, realize o login novamente para acessar o painel de inteligência do marketplace.</p>
                </div>
                <Button onClick={() => window.location.href = "/auth"} variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-300 mt-4">
                    Ir para Login
                </Button>
            </div>
        );
    }

    // 3. Error State with rich info
    if (error) {
        const err = error as any;
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="p-4 rounded-full bg-red-500/10 border border-red-500/20 text-red-500">
                    <Activity className="h-8 w-8" />
                </div>
                <div className="text-center max-w-2xl px-6">
                    <h2 className="text-xl font-bold text-white">Falha ao carregar dashboard</h2>
                    <p className="text-sm text-red-400 mt-2 font-mono bg-red-500/5 p-3 rounded-lg border border-red-500/10">
                        {err.message || "Erro desconhecido na RPC do Supabase"}
                    </p>
                    {err.code && (
                        <p className="text-[10px] text-zinc-600 mt-2 uppercase tracking-widest font-bold">
                            ErrorCode: {err.code} • {err.hint || "Sem sugestão técnica"}
                        </p>
                    )}
                </div>
                <div className="flex gap-3">
                    <Button onClick={() => refetch()} variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-300">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Tentar Novamente
                    </Button>
                </div>
            </div>
        );
    }

    // 4. Loading Data State
    if (isLoading || !snapshot) {
        return (
            <div className="flex flex-col items-center justify-center py-40 gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-zinc-500 font-medium animate-pulse tracking-wide uppercase">Carregando dados do marketplace...</p>
            </div>
        );
    }

    const { stores, products, listings, credits, market_intelligence, profit } = snapshot;

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                            <LayoutDashboard className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-white tracking-tight">Inteligência consolidada das lojas</h1>
                            <p className="text-xs text-zinc-500 mt-1 font-medium uppercase tracking-wider leading-relaxed max-w-2xl">
                                visão unificada de lojas, produtos, leilões, arremates, créditos, inteligência de mercado e profit.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 bg-zinc-900/60 p-1 rounded-xl border border-zinc-800/60 self-start md:self-auto">
                    {[7, 30, 90].map((d) => (
                        <Button
                            key={d}
                            size="sm"
                            variant="ghost"
                            onClick={() => setDays(d)}
                            className={`text-[11px] h-8 px-4 font-bold ${days === d ? "bg-primary text-primary-foreground shadow-lg" : "text-zinc-500 hover:text-zinc-300"}`}
                        >
                            {d} dias
                        </Button>
                    ))}
                    <div className="w-[1px] h-4 bg-zinc-800 mx-1" />
                    <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => refetch()}
                        className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
                        title="Atualizar dados"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </header>

            {/* BLOCO A: CARDS PRINCIPAIS */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <KpiCard 
                    title="Total Lojas" 
                    value={formatNumber(stores.total_stores)} 
                    subtitle="lojas cadastradas" 
                    delta={stores.growth_new_stores_pct} 
                    icon={Store} 
                    color="text-blue-400"
                />
                <KpiCard 
                    title="Total Produtos" 
                    value={formatNumber(products.total_products)} 
                    subtitle="no marketplace" 
                    delta={products.growth_products_pct} 
                    icon={Package} 
                    color="text-emerald-400"
                />
                <KpiCard 
                    title="Total Leilões" 
                    value={formatNumber(listings.total_auctions)} 
                    subtitle={`${listings.active_auctions} ativos`} 
                    delta={listings.growth_auctions_pct} 
                    icon={Gavel} 
                    color="text-orange-400"
                />
                <KpiCard 
                    title="Total Arremates" 
                    value={formatNumber(listings.total_arremates)} 
                    subtitle={`${listings.active_arremates} ativos`} 
                    delta={listings.growth_arremates_pct} 
                    icon={Hammer} 
                    color="text-purple-400"
                />
                <KpiCard 
                    title="Compras Crédito" 
                    value={formatNumber(credits.total_purchases)} 
                    subtitle={formatCurrency(credits.total_value)} 
                    delta={credits.growth_purchases_pct} 
                    icon={Coins} 
                    color="text-amber-400"
                />
                <KpiCard 
                    title="Profit Líquido" 
                    value={formatCurrency(profit.total_net)} 
                    subtitle={`Margem: ${profit.margin_pct}%`} 
                    delta={profit.growth_net_pct} 
                    icon={TrendingUp} 
                    color="text-emerald-500"
                />
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* BLOCO B: LOJAS */}
                <DetailBlock 
                    title="Lojas" 
                    icon={Building2}
                    items={[
                        { label: "Lojas Totais", value: formatNumber(stores.total_stores) },
                        { label: "Lojas Ativas", value: formatNumber(stores.active_stores) },
                        { label: "Com Produtos", value: formatNumber(stores.stores_with_products) },
                        { label: "Atividade Recente", value: formatNumber(stores.active_recently_stores) }
                    ]}
                />
                {/* BLOCO C: PRODUTOS */}
                <DetailBlock 
                    title="Produtos" 
                    icon={Package}
                    items={[
                        { label: "Total Produtos", value: formatNumber(products.total_products), delta: products.growth_products_pct },
                        { label: "Produtos Novos", value: formatNumber(products.new_products), delta: products.growth_new_pct },
                        { label: "Produtos Usados", value: formatNumber(products.used_products), delta: products.growth_used_pct },
                        { label: "Média p/ Loja", value: products.avg_products_per_store.toFixed(1) }
                    ]}
                />
                {/* BLOCO D: LEILÕES E ARREMATES */}
                <DetailBlock 
                    title="Leilões e Arremates" 
                    icon={Gavel}
                    items={[
                        { label: "Leilões Totais", value: formatNumber(listings.total_auctions), delta: listings.growth_auctions_pct },
                        { label: "Leilões Ativos", value: formatNumber(listings.active_auctions) },
                        { label: "Arremates Totais", value: formatNumber(listings.total_arremates), delta: listings.growth_arremates_pct },
                        { label: "Arremates Ativos", value: formatNumber(listings.active_arremates) }
                    ]}
                />
            </div>

            {/* BLOCO F: INTELIGÊNCIA DE MERCADO */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <RankingList 
                    title="Termos Buscados" 
                    icon={Search}
                    items={market_intelligence.top_search_terms}
                    labels={{ name: "term", value: "count" }}
                />
                <RankingList 
                    title="Lojas Mais Visitadas" 
                    icon={Store}
                    items={market_intelligence.top_visited_stores}
                    labels={{ name: "store_name", value: "visit_count" }}
                />
                <RankingList 
                    title="Produtos Populares" 
                    icon={Eye}
                    items={market_intelligence.top_viewed_products}
                    labels={{ name: "product_name", value: "view_count" }}
                />
                <RankingList 
                    title="Categorias Acessadas" 
                    icon={Activity}
                    items={market_intelligence.top_categories}
                    labels={{ name: "category", value: "access_count" }}
                />
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* BLOCO E: CRÉDITOS */}
                <Card className="border-zinc-800/60 bg-zinc-900/60 shadow-2xl overflow-hidden">
                    <CardHeader className="py-4 px-5 border-b border-zinc-800/60 bg-zinc-900/20 flex flex-row items-center gap-2">
                        <Coins className="h-5 w-5 text-amber-400" />
                        <CardTitle className="text-sm font-black text-zinc-100 uppercase tracking-widest">Fluxo de Créditos</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                                        <p className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Total Compras</p>
                                        <p className="text-xl font-black text-white">{formatNumber(credits.total_purchases)}</p>
                                        <DeltaBadge delta={credits.growth_purchases_pct} />
                                    </div>
                                    <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                                        <p className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Valor Total</p>
                                        <p className="text-xl font-black text-amber-400">{formatCurrency(credits.total_value)}</p>
                                        <DeltaBadge delta={credits.growth_value_pct} />
                                    </div>
                                    <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/50 col-span-2 flex justify-between items-center">
                                        <div>
                                            <p className="text-[9px] text-zinc-500 font-bold uppercase">No Período</p>
                                            <p className="text-sm font-black text-zinc-300">{formatNumber(credits.period_purchases)} compras</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[9px] text-zinc-500 font-bold uppercase">Volume Período</p>
                                            <p className="text-sm font-black text-amber-500/80">{formatCurrency(credits.period_value)}</p>
                                        </div>
                                    </div>
                                </div>
                                
                                <div>
                                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 underline decoration-amber-500/30 underline-offset-4">Top Lojas Compradoras</p>
                                    <div className="space-y-2">
                                        {credits.top_buying_stores.slice(0, 3).map((st, i) => (
                                            <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/20">
                                                <span className="text-xs text-zinc-300 truncate pr-2">{st.store_name}</span>
                                                <span className="text-xs font-bold text-amber-400">{formatCurrency(st.total_spent)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 underline decoration-amber-500/30 underline-offset-4">Pacotes mais Comprados</p>
                                    <div className="space-y-2">
                                        {credits.top_packages.slice(0, 3).map((pkg, i) => (
                                            <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/20">
                                                <span className="text-xs text-zinc-300 font-medium">{pkg.package_name}</span>
                                                <span className="text-xs font-bold text-white">{pkg.count} unidades</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                                    <p className="text-[10px] text-amber-500 font-bold uppercase mb-2">Categorias com mais uso</p>
                                    <div className="flex flex-wrap gap-2">
                                        {credits.top_credit_usage_categories.slice(0, 4).map((cat, i) => (
                                            <Badge key={i} variant="outline" className="bg-zinc-950 border-zinc-800 text-[10px] text-zinc-400 font-bold">
                                                {cat.category}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* BLOCO G: PROFIT */}
                <Card className="border-zinc-800/60 bg-zinc-900/60 shadow-2xl overflow-hidden">
                    <CardHeader className="py-4 px-5 border-b border-zinc-800/60 bg-emerald-500/5 flex flex-row items-center justify-between">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-emerald-400" />
                            <CardTitle className="text-sm font-black text-zinc-100 uppercase tracking-widest">Análise de Profit</CardTitle>
                        </div>
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 font-black">
                            {profit.margin_pct}% MARGEM
                        </Badge>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 group relative">
                                    <Landmark className="absolute top-4 right-4 h-10 w-10 opacity-5 group-hover:opacity-10 transition-opacity" />
                                    <p className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Profit Bruto</p>
                                    <p className="text-2xl font-black text-white">{formatCurrency(profit.total_gross)}</p>
                                    <div className="mt-3 flex items-center gap-2">
                                        <DeltaBadge delta={profit.growth_gross_pct} />
                                    </div>
                                </div>

                                <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                                    <p className="text-[10px] text-emerald-500 font-bold uppercase mb-1">Profit Líquido</p>
                                    <p className="text-2xl font-black text-emerald-400">{formatCurrency(profit.total_net)}</p>
                                    <div className="mt-3 flex items-center gap-2">
                                        <DeltaBadge delta={profit.growth_net_pct} />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4 underline decoration-emerald-500/30 underline-offset-4">Composição da Receita</p>
                                {[
                                    { label: "Receita de Comissão", value: profit.commission_revenue, color: "bg-blue-500/10 text-blue-400" },
                                    { label: "Receita de Créditos", value: profit.credits_revenue, color: "bg-amber-500/10 text-amber-400" },
                                    { label: "Outras Receitas", value: profit.other_revenue, color: "bg-zinc-500/10 text-zinc-400" }
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/50 border border-zinc-800/50">
                                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-tight">{item.label}</span>
                                        <span className="text-sm font-black text-white">{formatCurrency(item.value)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
