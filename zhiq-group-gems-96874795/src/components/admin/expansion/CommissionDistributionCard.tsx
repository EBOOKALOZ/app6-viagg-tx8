import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";
import { useCommissionDistribution } from "@/hooks/useExpansionData";

const COLORS = [
  "hsl(0, 84%, 60%)",    // 0 groups - red
  "hsl(25, 95%, 53%)",   // 1 group - orange
  "hsl(45, 93%, 47%)",   // 2 groups - yellow
  "hsl(142, 71%, 45%)",  // 3 groups - green
  "hsl(173, 80%, 40%)",  // 4 groups - teal
  "hsl(199, 89%, 48%)",  // 5 groups - blue
  "hsl(262, 83%, 58%)",  // 6 groups - purple
];

export function CommissionDistributionCard() {
  const { data: distribution, isLoading } = useCommissionDistribution();

  const chartData = (distribution || []).map((d, index) => ({
    name: d.groups === 6 ? "6+" : `${d.groups}`,
    grupos: d.groups,
    taxa: d.rate,
    usuarios: d.userCount,
    percentual: d.percentage,
    fill: COLORS[index],
  }));

  const chartConfig = {
    usuarios: {
      label: "Usuários",
      color: "hsl(var(--primary))",
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">📈</span>
          Distribuição de Comissão
        </CardTitle>
        <CardDescription>
          Usuários por faixa de grupos ativos e taxa de comissão correspondente
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : (
          <div className="space-y-4">
            <ChartContainer config={chartConfig} className="h-[300px]">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <XAxis 
                  dataKey="name" 
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value} grupos`}
                />
                <YAxis 
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}`}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name, props) => (
                        <div className="space-y-1">
                          <p className="font-medium">{props.payload.usuarios} usuários</p>
                          <p className="text-xs text-muted-foreground">
                            Taxa: {props.payload.taxa}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {props.payload.percentual}% do total
                          </p>
                        </div>
                      )}
                    />
                  }
                />
                <Bar dataKey="usuarios" radius={[8, 8, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>

            {/* Legend */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {chartData.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-lg border p-2 text-xs"
                >
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: item.fill }}
                  />
                  <div>
                    <p className="font-medium">{item.name === "6+" ? "6+" : item.name} grupos</p>
                    <p className="text-muted-foreground">{item.taxa}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
