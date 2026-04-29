import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, XCircle, Globe, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface NSIData {
  national_stability_index: number;
  avg_health_national: number;
  total_blocked: number;
  total_critical: number;
}

function getNSIConfig(nsi: number) {
  if (nsi > 60) return {
    label: "NORMAL",
    message: "Modo Nacional: NORMAL — Operação plena",
    icon: CheckCircle2,
    bgClass: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
    textClass: "text-green-700 dark:text-green-300",
    iconClass: "text-green-600",
  };
  if (nsi >= 40) return {
    label: "WARNING",
    message: "Modo Nacional: WARNING — Ritmo moderado",
    icon: AlertTriangle,
    bgClass: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800",
    textClass: "text-yellow-700 dark:text-yellow-300",
    iconClass: "text-yellow-600",
  };
  return {
    label: "CRITICAL",
    message: "Modo Nacional: CRITICAL — Ritmo reduzido automaticamente",
    icon: XCircle,
    bgClass: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
    textClass: "text-red-700 dark:text-red-300",
    iconClass: "text-red-600",
  };
}

export function OperadorNSIIndicator() {
  const { data, isLoading } = useQuery({
    queryKey: ["operator-nsi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_national_stability_index" as any)
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data as unknown as NSIData;
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const nsi = Number(data.national_stability_index) || 0;
  const config = getNSIConfig(nsi);
  const Icon = config.icon;

  return (
    <Card className={config.bgClass}>
      <CardContent className="py-4">
        <div className="flex items-center gap-4">
          <Icon className={`h-6 w-6 ${config.iconClass} shrink-0`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className={`font-semibold text-sm ${config.textClass}`}>
                {config.message}
              </p>
              <span className={`font-bold text-lg ${config.textClass}`}>{nsi.toFixed(0)}</span>
            </div>
            <Progress value={nsi} className="h-2" />
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                NSI Nacional
              </span>
              <span>Bloqueados: {data.total_blocked}</span>
              <span>Críticos: {data.total_critical}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
