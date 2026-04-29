import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function MerchantGrowth() {
    const { data, isLoading } = useQuery({
        queryKey: ["admin-merchant-metrics-growth"],
        queryFn: async () => {
            const { data: metrics, error } = await supabase
                .from("v_admin_lojistas_metrics")
                .select("*")
                .single();

            if (error) throw error;
            return metrics;
        },
        staleTime: 60_000,
    });

    const renderGrowthCard = () => {
        if (isLoading) {
            return (
                <Card className="shadow-sm border-muted">
                    <CardContent className="p-4 flex flex-col items-center justify-center space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-8 w-16" />
                    </CardContent>
                </Card>
            );
        }

        const growthPct = data?.crescimento_percentual || 0;
        const current = data?.total_lojistas || 0;

        const isPositive = growthPct > 0;
        const isNegative = growthPct < 0;
        const isNeutral = growthPct === 0;

        let Icon = Minus;
        let colorClass = "text-muted-foreground";
        let bgClass = "bg-muted";

        if (isPositive) {
            Icon = TrendingUp;
            colorClass = "text-emerald-500";
            bgClass = "bg-emerald-500/10";
        } else if (isNegative) {
            Icon = TrendingDown;
            colorClass = "text-rose-500";
            bgClass = "bg-rose-500/10";
        }

        return (
            <Card className="shadow-sm border-muted transition-all hover:shadow-md max-w-sm">
                <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                        Taxa de Crescimento Global
                    </p>
                    <div className="flex items-end justify-between">
                        <div className="text-3xl font-bold">{current}</div>
                        <div className={`flex items-center gap-1 text-sm font-semibold px-2 py-1 rounded-md ${colorClass} ${bgClass}`}>
                            <Icon className="h-4 w-4" />
                            <span>{isNeutral ? "0%" : `${Math.abs(growthPct).toFixed(1)}%`}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="space-y-4 fade-in">
            <h3 className="text-lg font-bold">Crescimento da Base</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {renderGrowthCard()}
            </div>
        </div>
    );
}
