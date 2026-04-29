import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, DollarSign, Target, Wallet } from "lucide-react";

function useGlobalCommissionImpact() {
  return useQuery({
    queryKey: ['admin-global-commission-impact'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_admin_global_commission_impact')
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 30000,
  });
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0%';
  return `${Number(value).toFixed(1)}%`;
}

function formatNumber(value: number | bigint | null | undefined): string {
  if (value === null || value === undefined) return '0';
  return new Intl.NumberFormat('pt-BR').format(Number(value));
}

export function NacionalEconomy() {
  const { data: commission, isLoading } = useGlobalCommissionImpact();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-muted-foreground uppercase tracking-wide">Economia Nacional</h2>
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="shadow-xl"><CardHeader className="pb-2"><Skeleton className="h-4 w-32" /></CardHeader><CardContent><Skeleton className="h-10 w-24" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const cards = [
    { title: "Comissão Média Atual", value: formatPercent(commission?.avg_commission_percent), sub: `${formatNumber(commission?.total_motoboys)} motoboys ativos`, icon: TrendingUp, color: "emerald" },
    { title: "Receita Atual (Comissões)", value: formatCurrency(Number(commission?.total_current_commission_value || 0)), sub: "Volume de comissões no sistema", icon: DollarSign, color: "blue" },
    { title: "Receita Mínima Possível", value: formatCurrency(Number(commission?.total_minimum_commission_value || 0)), sub: "Se todos atingissem 6%", icon: Target, color: "purple" },
    { title: "Economia Potencial Total", value: formatCurrency(Number(commission?.total_potential_savings || 0)), sub: "Valor que motoboys podem economizar", icon: Wallet, color: "amber" },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-muted-foreground uppercase tracking-wide">
        Economia Nacional
      </h2>
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title} className={`shadow-xl border-${card.color}-500/20 bg-gradient-to-br from-${card.color}-500/5 to-${card.color}-600/10`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-5 w-5 text-${card.color}-500`} />
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold text-${card.color}-600`}>{card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
