import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, TrendingDown, Zap, CheckCircle } from "lucide-react";

function useWarRoomAlerts() {
  return useQuery({
    queryKey: ['admin-war-room-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_admin_war_room_city')
        .select('*');
      if (error) throw error;

      const cities = data || [];
      const alerts: { type: 'danger' | 'warning' | 'success'; icon: React.ElementType; message: string }[] = [];

      const highErrors = cities.filter(c => (c.errors_7d ?? 0) > 10);
      highErrors.forEach(c => {
        alerts.push({ type: 'danger', icon: AlertTriangle, message: `${c.city_id} (${c.region_id}) — ${c.errors_7d} erros nos últimos 7 dias` });
      });

      const weakRegions = cities.filter(c => (c.active_groups ?? 0) === 0);
      weakRegions.forEach(c => {
        alerts.push({ type: 'warning', icon: TrendingDown, message: `${c.city_id} (${c.region_id}) — Nenhum grupo ativo` });
      });

      const highEligible = cities.filter(c => (c.eligible_now ?? 0) > 20);
      highEligible.forEach(c => {
        alerts.push({ type: 'warning', icon: Zap, message: `${c.city_id} — ${c.eligible_now} grupos elegíveis aguardando envio` });
      });

      return alerts.slice(0, 10);
    },
    staleTime: 30000,
  });
}

export function NacionalAlerts() {
  const { data: alerts } = useWarRoomAlerts();

  if (!alerts || alerts.length === 0) {
    return (
      <Card className="border-emerald-500/20 bg-emerald-500/5 shadow-lg">
        <CardContent className="flex items-center gap-3 py-4">
          <CheckCircle className="h-5 w-5 text-emerald-500" />
          <span className="text-sm font-medium text-emerald-700">Sistema operando normalmente — sem alertas ativos</span>
        </CardContent>
      </Card>
    );
  }

  const colorMap = {
    danger: { bg: 'bg-red-500/10 border-red-500/30', text: 'text-red-600', badge: 'destructive' as const },
    warning: { bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-600', badge: 'secondary' as const },
    success: { bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-600', badge: 'outline' as const },
  };

  return (
    <Card className="shadow-lg border-red-500/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          Alertas Operacionais
          <Badge variant="destructive" className="ml-2">{alerts.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.map((alert, i) => {
          const colors = colorMap[alert.type];
          return (
            <div key={i} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${colors.bg}`}>
              <alert.icon className={`h-4 w-4 shrink-0 ${colors.text}`} />
              <span className="text-sm">{alert.message}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
