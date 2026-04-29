import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Target, Clock, Play, Loader2, Phone, Users, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MissionItem {
  id: string;
  number_id: string;
  group_id: string;
  priority: number;
  status: string;
  scheduled_for: string;
  region_id: string | null;
  phone_number?: string;
  group_name?: string;
  group_cidade?: string;
  group_estado?: string;
}

interface MissionsCardProps {
  onPostNow?: (mission: MissionItem) => void;
}

function getPriorityBadge(priority: number) {
  if (priority <= 1) return { label: "P1", className: "bg-red-500/20 text-red-700 border-red-300" };
  if (priority <= 2) return { label: "P2", className: "bg-orange-500/20 text-orange-700 border-orange-300" };
  if (priority <= 3) return { label: "P3", className: "bg-yellow-500/20 text-yellow-700 border-yellow-300" };
  if (priority <= 4) return { label: "P4", className: "bg-blue-500/20 text-blue-700 border-blue-300" };
  return { label: "P5", className: "bg-muted text-muted-foreground" };
}

export function OperadorMissionsCard({ onPostNow }: MissionsCardProps) {
  const { user } = useAuth();

  const { data: missions, isLoading } = useQuery({
    queryKey: ["operator-released-missions", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("posting_missions" as any)
        .select("id, number_id, group_id, priority, status, scheduled_for, region_id")
        .eq("operator_id", user.id)
        .in("status", ["pending", "assigned"])
        .lte("scheduled_for", new Date().toISOString())
        .order("priority", { ascending: true })
        .order("scheduled_for", { ascending: true });

      if (error) throw error;
      const items = data as any as MissionItem[];

      if (!items.length) return [];

      const numberIds = [...new Set(items.map(m => m.number_id))];
      const groupIds = [...new Set(items.map(m => m.group_id))];

      const [numbersRes, driverRes, motoboyRes] = await Promise.all([
        numberIds.length > 0
          ? supabase.from("posting_numbers").select("id, phone_number").in("id", numberIds)
          : { data: [] },
        groupIds.length > 0
          ? supabase.from("driver_whatsapp_groups").select("id, cidade, estado, tipo").in("id", groupIds)
          : { data: [] },
        groupIds.length > 0
          ? supabase.from("motoboy_whatsapp_groups").select("id, cidade, estado, tipo").in("id", groupIds)
          : { data: [] },
      ]);

      const numbersMap = new Map((numbersRes.data || []).map((n: any) => [n.id, n]));
      const groupsMap = new Map([
        ...((driverRes.data || []) as any[]).map((g: any) => [g.id, g] as const),
        ...((motoboyRes.data || []) as any[]).map((g: any) => [g.id, g] as const),
      ]);

      return items.map(m => {
        const grp = groupsMap.get(m.group_id) as any;
        return {
          ...m,
          phone_number: (numbersMap.get(m.number_id) as any)?.phone_number || "—",
          group_name: grp ? `${grp.cidade} ${grp.tipo}` : "—",
          group_cidade: grp?.cidade || "—",
          group_estado: grp?.estado || "—",
        };
      });
    },
    refetchInterval: 30000,
    enabled: !!user?.id,
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

  if (!missions?.length) {
    return (
      <Card className="border-dashed bg-muted/30">
        <CardContent className="py-6 text-center">
          <Target className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            Nenhum grupo liberado neste momento.
          </p>
        </CardContent>
      </Card>
    );
  }

  const content = (
    <div className="space-y-3">
      {missions.map(mission => {
        const pBadge = getPriorityBadge(mission.priority);
        return (
          <Card key={mission.id} className="border">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{mission.group_name}</span>
                    <Badge variant="outline" className={pBadge.className}>
                      {pBadge.label}
                    </Badge>
                    <Badge variant="outline" className="bg-blue-500/20 text-blue-700 border-blue-300">
                      Liberada
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      <span className="font-mono">{mission.phone_number}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {mission.group_cidade}/{mission.group_estado}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(mission.scheduled_for), "HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={() => onPostNow?.(mission)}
              >
                <Play className="h-4 w-4 mr-2" />
                EXECUTAR MISSÃO
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  return (
    <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-5 w-5 text-green-600" />
          Missões Liberadas
          <Badge variant="outline" className="bg-green-500/20 text-green-700 border-green-300 ml-auto">
            {missions.length} grupo{missions.length !== 1 ? "s" : ""}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {missions.length >= 3 ? (
          <ScrollArea className="max-h-[400px]">
            {content}
          </ScrollArea>
        ) : (
          content
        )}
      </CardContent>
    </Card>
  );
}
