import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminFinancialCharts } from "@/hooks/useAdminFinancialCharts";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    Legend
} from "recharts";
import { Info } from "lucide-react";

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
};

export function AdminFinancialCharts() {
    const { data, isLoading } = useAdminFinancialCharts();

    if (isLoading || !data) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                    <Card key={i} className="animate-pulse h-[350px]">
                        <CardHeader className="pb-2">
                            <div className="h-4 w-1/3 bg-muted rounded"></div>
                        </CardHeader>
                        <CardContent className="flex justify-center items-center h-[280px]">
                            <div className="text-muted-foreground text-sm">Carregando gráfico...</div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* 1. Receita da Plataforma */}
            <Card style={{ backgroundColor: "hsl(var(--admin-card))", borderColor: "hsl(var(--admin-border))" }}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base font-semibold" style={{ color: "hsl(var(--admin-card-foreground))" }}>
                        Receita (Últimos 30 dias)
                    </CardTitle>
                    <Info className="h-4 w-4 text-muted-foreground opacity-50" />
                </CardHeader>
                <CardContent>
                    <div className="h-[250px] mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.revenueChart}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                                <XAxis
                                    dataKey="date"
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                                    dy={10}
                                />
                                <YAxis
                                    tickFormatter={(val) => `R$ ${val}`}
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                                    width={60}
                                />
                                <Tooltip
                                    formatter={(value: number) => [formatCurrency(value), "Receita"]}
                                    contentStyle={{ backgroundColor: "hsl(var(--background))", borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="receita"
                                    stroke="hsl(var(--admin-primary))"
                                    strokeWidth={3}
                                    dot={{ r: 3, fill: "hsl(var(--admin-primary))", strokeWidth: 0 }}
                                    activeDot={{ r: 5 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* 2. Corridas por dia */}
            <Card style={{ backgroundColor: "hsl(var(--admin-card))", borderColor: "hsl(var(--admin-border))" }}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base font-semibold" style={{ color: "hsl(var(--admin-card-foreground))" }}>
                        Corridas Finalizadas
                    </CardTitle>
                    <Info className="h-4 w-4 text-muted-foreground opacity-50" />
                </CardHeader>
                <CardContent>
                    <div className="h-[250px] mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.ridesChart}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                                <XAxis
                                    dataKey="date"
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                                    dy={10}
                                />
                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                                    width={30}
                                />
                                <Tooltip
                                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.2 }}
                                    formatter={(value: number) => [value, "Corridas"]}
                                    contentStyle={{ backgroundColor: "hsl(var(--background))", borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                                />
                                <Bar
                                    dataKey="corridas"
                                    fill="hsl(var(--admin-primary))"
                                    radius={[4, 4, 0, 0]}
                                    opacity={0.8}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* 3. Distribuição de Receita */}
            <Card style={{ backgroundColor: "hsl(var(--admin-card))", borderColor: "hsl(var(--admin-border))" }}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base font-semibold" style={{ color: "hsl(var(--admin-card-foreground))" }}>
                        Distribuição de Saldo
                    </CardTitle>
                    <Info className="h-4 w-4 text-muted-foreground opacity-50" />
                </CardHeader>
                <CardContent>
                    <div className="h-[250px] mt-4 flex justify-center items-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data.distributionChart}
                                    cx="50%"
                                    cy="45%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {data.distributionChart.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: number) => formatCurrency(value)}
                                    contentStyle={{ backgroundColor: "hsl(var(--background))", borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                                />
                                <Legend
                                    verticalAlign="bottom"
                                    height={36}
                                    iconType="circle"
                                    formatter={(value) => <span style={{ color: "hsl(var(--foreground))", fontSize: 12 }}>{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

        </div>
    );
}
