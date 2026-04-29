import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, MessageSquare, CheckCircle, Percent, TrendingDown, MapPin } from "lucide-react";
import { useExpansionMetrics } from "@/hooks/useExpansionData";

export function ExpansionMetricsCard() {
  const { data: metrics, isLoading } = useExpansionMetrics();

  const metricCards = [
    {
      title: "Total de Usuários",
      value: metrics?.totalUsers ?? 0,
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Total de Grupos",
      value: metrics?.totalGroups ?? 0,
      icon: MessageSquare,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Grupos Ativos",
      value: metrics?.activeGroups ?? 0,
      icon: CheckCircle,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Comissão Média",
      value: `${metrics?.averageCommission ?? 35}%`,
      icon: Percent,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      title: "Economia Média",
      value: `${metrics?.averageSavings ?? 0}%`,
      icon: TrendingDown,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
      subtitle: "por usuário",
    },
    {
      title: "Cidades Ativas",
      value: metrics?.activeCities ?? 0,
      icon: MapPin,
      color: "text-pink-500",
      bgColor: "bg-pink-500/10",
    },
  ];

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">📊</span>
          Resumo Econômico Global
        </CardTitle>
        <CardDescription>
          Métricas consolidadas da plataforma em tempo real
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {metricCards.map((card, index) => (
            <div
              key={index}
              className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <p className="text-2xl font-bold">{card.value}</p>
                  )}
                  {card.subtitle && (
                    <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                  )}
                </div>
                <div className={`rounded-lg p-2.5 ${card.bgColor}`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
