import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Zap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface NumberDashboard {
  actions_24h: number;
  actions_7d: number;
}

// Default limits — these come from backend config in production
const LIMIT_24H = 50;
const LIMIT_7D = 200;

function getRitmoConfig(pct: number) {
  if (pct > 95) return { color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800", alert: "LIMITE QUASE ATINGIDO" };
  if (pct > 80) return { color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800", alert: "ATENÇÃO: Ritmo elevado" };
  return { color: "text-green-600", bg: "", alert: null };
}

export function OperadorRitmoFooter() {
  const { data, isLoading } = useQuery({
    queryKey: ["operator-number-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_posting_numbers_dashboard" as any)
        .select("actions_24h, actions_7d")
        .limit(1)
        .single();
      if (error) throw error;
      return data as unknown as NumberDashboard;
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const pct24h = Math.min((Number(data.actions_24h) / LIMIT_24H) * 100, 100);
  const pct7d = Math.min((Number(data.actions_7d) / LIMIT_7D) * 100, 100);
  const config24 = getRitmoConfig(pct24h);
  const config7d = getRitmoConfig(pct7d);
  const showAlert = config24.alert || config7d.alert;
  const alertConfig = pct24h > pct7d ? config24 : config7d;

  return (
    <Card className={showAlert ? alertConfig.bg : ""}>
      <CardContent className="py-3">
        {showAlert && (
          <div className={`flex items-center gap-2 mb-2 text-sm font-semibold ${alertConfig.color}`}>
            <AlertTriangle className="h-4 w-4" />
            {alertConfig.alert}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" /> Ações 24h
              </span>
              <span className={`font-semibold ${config24.color}`}>{data.actions_24h}/{LIMIT_24H}</span>
            </div>
            <Progress value={pct24h} className="h-1.5" />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" /> Ações 7d
              </span>
              <span className={`font-semibold ${config7d.color}`}>{data.actions_7d}/{LIMIT_7D}</span>
            </div>
            <Progress value={pct7d} className="h-1.5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
