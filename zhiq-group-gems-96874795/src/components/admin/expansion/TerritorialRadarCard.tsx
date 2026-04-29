import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useTerritorialImpact } from "@/hooks/useExpansionData";
import { MapPin } from "lucide-react";

const COLORS = [
  "hsl(142, 71%, 45%)",  // green
  "hsl(199, 89%, 48%)",  // blue
  "hsl(262, 83%, 58%)",  // purple
  "hsl(25, 95%, 53%)",   // orange
  "hsl(340, 82%, 52%)",  // pink
  "hsl(45, 93%, 47%)",   // yellow
  "hsl(173, 80%, 40%)",  // teal
  "hsl(0, 84%, 60%)",    // red
  "hsl(220, 70%, 50%)",  // indigo
  "hsl(280, 65%, 60%)",  // violet
];

export function TerritorialRadarCard() {
  const { data: cityData, isLoading } = useTerritorialImpact();

  const chartData = (cityData || []).map((item, index) => ({
    name: item.city,
    value: item.count,
    fill: COLORS[index % COLORS.length],
  }));

  const totalGroups = chartData.reduce((sum, item) => sum + item.value, 0);

  const chartConfig = {
    value: {
      label: "Grupos",
      color: "hsl(var(--primary))",
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">🗺️</span>
          Radar de Impacto Territorial
        </CardTitle>
        <CardDescription>
          Concentração de grupos por cidade (Top 10)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[400px] w-full" />
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Chart */}
            <div className="flex items-center justify-center">
              <ChartContainer config={chartConfig} className="h-[300px] w-[300px]">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name, props) => (
                          <div className="space-y-1">
                            <p className="font-medium">{props.payload.name}</p>
                            <p className="text-sm">{value} grupos</p>
                            <p className="text-xs text-muted-foreground">
                              {Math.round((Number(value) / totalGroups) * 100)}% do total
                            </p>
                          </div>
                        )}
                      />
                    }
                  />
                </PieChart>
              </ChartContainer>
            </div>

            {/* Legend */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                <MapPin className="h-4 w-4" />
                <span>Cidades com maior concentração</span>
              </div>
              
              {chartData.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum dado disponível
                </p>
              ) : (
                <div className="space-y-2">
                  {chartData.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="h-4 w-4 rounded-full"
                          style={{ backgroundColor: item.fill }}
                        />
                        <span className="font-medium">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">{item.value}</span>
                        <span className="text-xs text-muted-foreground">grupos</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Total summary */}
              <div className="mt-4 p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total de Grupos</span>
                  <span className="text-2xl font-bold text-primary">{totalGroups}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
