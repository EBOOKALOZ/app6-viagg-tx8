import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Phone, Shield, Activity, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface NumberDashboard {
  id: string;
  phone_number: string;
  status: string;
  risk_score: number;
  health_score: number;
  total_groups: number;
  health_level: string;
  cooldown_until: string | null;
  actions_24h: number;
  actions_7d: number;
}

function getHealthBadge(score: number) {
  if (score > 60) return { label: "ESTÁVEL", className: "bg-green-500/20 text-green-700 border-green-300" };
  if (score >= 40) return { label: "MODERADO", className: "bg-yellow-500/20 text-yellow-700 border-yellow-300" };
  return { label: "ALTO RISCO", className: "bg-red-500/20 text-red-700 border-red-300" };
}

function getStatusColor(status: string) {
  switch (status) {
    case "ativo": return "bg-green-500/20 text-green-700 border-green-300";
    case "pausado": return "bg-yellow-500/20 text-yellow-700 border-yellow-300";
    case "banido": return "bg-red-500/20 text-red-700 border-red-300";
    default: return "bg-muted text-muted-foreground";
  }
}

export function OperadorNumberHeader() {
  const { data: numbers, isLoading } = useQuery({
    queryKey: ["operator-number-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_posting_numbers_dashboard" as any)
        .select("*")
        .limit(1);
      if (error) throw error;
      return (data as any[]) as NumberDashboard[];
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const num = numbers?.[0];
  if (!num) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4 text-center text-sm text-muted-foreground">
          Nenhum número ativo configurado
        </CardContent>
      </Card>
    );
  }

  const healthBadge = getHealthBadge(num.health_score);
  const isCooldown = num.cooldown_until && new Date(num.cooldown_until) > new Date();

  return (
    <Card className="border-l-4 border-l-primary">
      <CardContent className="py-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* Phone + Status */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-primary/10">
              <Phone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-mono font-semibold text-lg">{num.phone_number}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={getStatusColor(num.status)}>
                  {num.status.toUpperCase()}
                </Badge>
                <Badge variant="outline" className={healthBadge.className}>
                  {healthBadge.label}
                </Badge>
                {isCooldown && (
                  <Badge variant="outline" className="bg-orange-500/20 text-orange-700 border-orange-300">
                    <Clock className="h-3 w-3 mr-1" />
                    Cooldown até {format(new Date(num.cooldown_until!), "HH:mm", { locale: ptBR })}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Health Score Bar */}
          <div className="flex-1 min-w-[150px]">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span className="flex items-center gap-1">
                <Activity className="h-3 w-3" /> Saúde
              </span>
              <span className="font-semibold">{num.health_score}/100</span>
            </div>
            <Progress value={num.health_score} className="h-2" />
          </div>

          {/* Risk Score */}
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <Shield className="h-3 w-3" /> Risco
              </div>
              <p className={`text-xl font-bold ${num.risk_score > 60 ? "text-red-600" : num.risk_score > 30 ? "text-yellow-600" : "text-green-600"}`}>
                {num.risk_score}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Grupos</p>
              <p className="text-xl font-bold">{num.total_groups}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
