import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfDay, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function useAdminFinancialCharts() {
    return useQuery({
        queryKey: ["admin", "financial-charts"],
        queryFn: async () => {
            const thirtyDaysAgo = startOfDay(subDays(new Date(), 30)).toISOString();

            // Gráfico 1: Receita da Plataforma por dia (ledger_entries.source_type = 'platform_fee')
            const { data: revenueData } = await supabase
                .from("ledger_entries")
                .select("amount_cents, created_at")
                .eq("source_type", "platform_fee")
                .gte("created_at", thirtyDaysAgo)
                .order("created_at", { ascending: true });

            const revenueByDate = revenueData?.reduce((acc: any, curr) => {
                const date = format(parseISO(curr.created_at), "dd/MMM", { locale: ptBR });
                acc[date] = (acc[date] || 0) + Number(curr.amount_cents || 0) / 100;
                return acc;
            }, {});

            const revenueChart = Object.keys(revenueByDate || {}).map((date) => ({
                date,
                receita: revenueByDate[date],
            }));

            // Gráfico 2: Corridas por dia (service_orders.status = 'delivered')
            const { data: ridesData } = await supabase
                .from("service_orders")
                .select("created_at")
                .eq("status", "delivered" as any)
                .gte("created_at", thirtyDaysAgo)
                .order("created_at", { ascending: true });

            const ridesByDate = ridesData?.reduce((acc: any, curr) => {
                const date = format(parseISO(curr.created_at!), "dd/MMM", { locale: ptBR });
                acc[date] = (acc[date] || 0) + 1;
                return acc;
            }, {});

            const ridesChart = Object.keys(ridesByDate || {}).map((date) => ({
                date,
                corridas: ridesByDate[date],
            }));

            // Gráfico 3: Distribuição de receita (Accounts balances sum)
            // @ts-ignore: bypass outdated types.ts
            const { data: ledgers } = await (supabase.from("ledger_entries") as any)
                .select("amount_cents, direction, profile_type");

            let totalPlataforma = 0;
            let totalLojistas = 0;
            let totalMotoboys = 0;

            ledgers?.forEach((entry) => {
                const val = (Number(entry.amount_cents || 0) / 100) * (entry.direction === 'credit' ? 1 : -1);
                if (!entry.profile_type || entry.profile_type === 'platform') totalPlataforma += val;
                else if (entry.profile_type === 'merchant' || entry.profile_type === 'lojista') totalLojistas += val;
                else if (entry.profile_type === 'motoboy' || entry.profile_type === 'driver') totalMotoboys += val;
            });

            // If platform has no direct account, calculate from fee ledger again to show the slice
            if (totalPlataforma === 0) {
                const { data: allRevenue } = await supabase.from("ledger_entries").select("amount_cents").eq("source_type", "platform_fee");
                totalPlataforma = (allRevenue?.reduce((acc, curr) => acc + Number(curr.amount_cents || 0), 0) || 0) / 100;
            }

            const distributionChart = [
                { name: "Plataforma", value: totalPlataforma, fill: "hsl(var(--admin-primary))" },
                { name: "Motoboys", value: totalMotoboys, fill: "#f97316" }, // Orange
                { name: "Lojistas", value: totalLojistas, fill: "#6366f1" }, // Indigo
            ];

            return {
                revenueChart,
                ridesChart,
                distributionChart,
            };
        },
    });
}
