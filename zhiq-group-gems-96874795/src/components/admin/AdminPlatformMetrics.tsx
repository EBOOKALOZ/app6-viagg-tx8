/**
 * 📊 AdminPlatformMetrics — Visão Geral da Plataforma
 * 
 * KPI cards + leads-per-day chart.
 * Auto-refreshes every 30 seconds.
 * Only visible for admin users.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Store, Package, MessageCircle, Tag, Globe, TrendingUp,
    Loader2, RefreshCw, Users, Truck, Coins
} from "lucide-react";
import { getGlobalSandboxStats } from "@/lib/api";

interface MetricCard {
    label: string;
    value: number | null;
    icon: React.ReactNode;
    color: string;
    bgColor: string;
}

interface DailyLeads {
    date: string;
    count: number;
}

export default function AdminPlatformMetrics() {
    const [metrics, setMetrics] = useState<Record<string, number | null>>({
        stores: null,
        products: null,
        leads: null,
        discounts: null,
        cities: null,
        motoboys: null,
        deliveries: null,
        sandboxCredits: null,
    });
    const [dailyLeads, setDailyLeads] = useState<DailyLeads[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

    const fetchMetrics = useCallback(async () => {
        try {
            // Parallel count queries
            const [
                { count: storesCount },
                { count: productsCount },
                { count: leadsCount },
                { count: discountsCount },
                { count: motoboysCount },
                { count: deliveriesCount },
            ] = await Promise.all([
                supabase.from("stores").select("*", { count: "exact", head: true }),
                supabase.from("products").select("*", { count: "exact", head: true }),
                supabase.from("product_leads").select("*", { count: "exact", head: true }),
                supabase.from("discount_requests").select("*", { count: "exact", head: true }),
                supabase.from("motoboy_profiles").select("*", { count: "exact", head: true }),
                supabase.from("service_orders").select("*", { count: "exact", head: true }),
            ]);

            // Distinct cities
            const { data: citiesData } = await supabase.from("stores")
                .select("city")
                .not("city", "is", null);
            const uniqueCities = new Set((citiesData || []).map((r: Record<string, unknown>) => r.city).filter(Boolean));

            setMetrics({
                stores: storesCount ?? 0,
                products: productsCount ?? 0,
                leads: leadsCount ?? 0,
                discounts: discountsCount ?? 0,
                cities: uniqueCities.size,
                motoboys: motoboysCount ?? 0,
                deliveries: deliveriesCount ?? 0,
                sandboxCredits: (await getGlobalSandboxStats()).totalCredits,
            });

            // Daily leads (last 14 days)
            const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
            const { data: leadsDaily } = await supabase.from("product_leads")
                .select("created_at")
                .gte("created_at", fourteenDaysAgo)
                .order("created_at", { ascending: true });

            if (leadsDaily) {
                const grouped: Record<string, number> = {};
                leadsDaily.forEach((l: Record<string, unknown>) => {
                    const day = l.created_at ? String(l.created_at).split("T")[0] : "";
                    if (day) grouped[day] = (grouped[day] || 0) + 1;
                });
                setDailyLeads(Object.entries(grouped).map(([date, count]) => ({ date, count })));
            }

            setLastUpdate(new Date());
        } catch (err) {
            console.error("[AdminPlatformMetrics] error:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMetrics();
        const interval = setInterval(fetchMetrics, 30_000);
        return () => clearInterval(interval);
    }, [fetchMetrics]);

    const cards: MetricCard[] = [
        { label: "Lojas Cadastradas", value: metrics.stores, icon: <Store className="h-6 w-6" />, color: "#FF6A00", bgColor: "#FFF3E8" },
        { label: "Produtos", value: metrics.products, icon: <Package className="h-6 w-6" />, color: "#2563EB", bgColor: "#EFF6FF" },
        { label: "Leads Gerados", value: metrics.leads, icon: <MessageCircle className="h-6 w-6" />, color: "#16A34A", bgColor: "#F0FDF4" },
        { label: "Pedidos de Desconto", value: metrics.discounts, icon: <Tag className="h-6 w-6" />, color: "#9333EA", bgColor: "#FAF5FF" },
        { label: "Cidades Ativas", value: metrics.cities, icon: <Globe className="h-6 w-6" />, color: "#0891B2", bgColor: "#ECFEFF" },
        { label: "Motoboys", value: metrics.motoboys, icon: <Truck className="h-6 w-6" />, color: "#D97706", bgColor: "#FFFBEB" },
        { label: "Entregas", value: metrics.deliveries, icon: <Users className="h-6 w-6" />, color: "#DC2626", bgColor: "#FEF2F2" },
        { 
            label: "Total Créditos Sandbox", 
            value: metrics.sandboxCredits !== null ? `R$ ${metrics.sandboxCredits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "...", 
            icon: <Coins className="h-6 w-6" />, 
            color: "#F59E0B", 
            bgColor: "#FFFBEB" 
        },
    ];

    // Simple chart: max bar height
    const maxLeads = Math.max(...dailyLeads.map(d => d.count), 1);

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "hsl(var(--admin-card-foreground, var(--foreground)))" }}>
                        <TrendingUp className="h-5 w-5" style={{ color: "hsl(var(--admin-primary, var(--primary)))" }} />
                        Visão Geral da Plataforma
                    </h2>
                    <p className="text-xs" style={{ color: "hsl(var(--admin-muted-foreground, var(--muted-foreground)))" }}>
                        Atualizado em {lastUpdate.toLocaleTimeString("pt-BR")}
                    </p>
                </div>
                <Badge variant="outline" className="text-[10px] animate-pulse gap-1 flex items-center" style={{
                    borderColor: "hsl(var(--admin-primary, var(--primary)))",
                    color: "hsl(var(--admin-primary, var(--primary)))"
                }}>
                    <RefreshCw className="h-2.5 w-2.5" /> Auto 30s
                </Badge>
            </div>

            {/* KPI Cards */}
            {loading ? (
                <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" style={{ color: "hsl(var(--admin-primary))" }} />
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    {cards.map((card) => (
                        <Card key={card.label} className="border shadow-sm hover:shadow-md transition-shadow" style={{
                            backgroundColor: "hsl(var(--admin-card, var(--card)))",
                            borderColor: "hsl(var(--admin-border, var(--border)))",
                        }}>
                            <CardContent className="p-4 text-center space-y-2">
                                <div className="w-11 h-11 rounded-xl flex items-center justify-center mx-auto"
                                    style={{ backgroundColor: card.bgColor, color: card.color }}>
                                    {card.icon}
                                </div>
                                <p className="text-2xl font-black" style={{ color: card.color }}>
                                    {card.value?.toLocaleString("pt-BR") ?? "—"}
                                </p>
                                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "hsl(var(--admin-muted-foreground, var(--muted-foreground)))" }}>
                                    {card.label}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Leads per Day Chart */}
            {dailyLeads.length > 0 && (
                <Card style={{
                    backgroundColor: "hsl(var(--admin-card, var(--card)))",
                    borderColor: "hsl(var(--admin-border, var(--border)))",
                }}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2" style={{ color: "hsl(var(--admin-card-foreground, var(--foreground)))" }}>
                            <Coins className="h-4 w-4" style={{ color: "hsl(var(--admin-primary))" }} />
                            Leads por Dia (últimos 14 dias)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                        <div className="flex items-end gap-1 h-32">
                            {dailyLeads.map((d) => {
                                const height = Math.max((d.count / maxLeads) * 100, 4);
                                return (
                                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                                        <span className="text-[9px] font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                                            style={{ color: "hsl(var(--admin-primary))" }}>
                                            {d.count}
                                        </span>
                                        <div
                                            className="w-full rounded-t-md transition-all duration-300 hover:opacity-80"
                                            style={{
                                                height: `${height}%`,
                                                background: `linear-gradient(to top, hsl(var(--admin-primary)), hsl(var(--admin-primary) / 0.6))`,
                                                minHeight: "4px",
                                            }}
                                        />
                                        <span className="text-[7px] font-medium" style={{ color: "hsl(var(--admin-muted-foreground))" }}>
                                            {d.date.slice(5).replace("-", "/")}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
