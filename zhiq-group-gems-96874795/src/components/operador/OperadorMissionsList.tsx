import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Target, Clock, Play, MapPin, Phone, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface Mission {
  id: string;
  operator_id: string;
  number_id: string;
  group_id: string;
  media_id: string | null;
  message_id: string | null;
  priority: number;
  status: string;
  scheduled_for: string;
  executed_at: string | null;
  region_id: string | null;
  created_at: string;
  assigned_at: string | null;
  completed_at: string | null;
  attempt_count: number;
  mission_score: number | null;
  // Joined data
  phone_number?: string;
  number_status?: string;
  number_health_score?: number;
  group_cidade?: string;
  group_estado?: string;
  group_tipo?: string;
  group_link?: string;
}

interface Props {
  onExecuteMission: (mission: Mission) => void;
  activeMission: Mission | null;
  numberBlocked: boolean;
  healthTooLow: boolean;
}

function getMissionBadge(mission: Mission) {
  const now = new Date();
  const scheduledFor = new Date(mission.scheduled_for);

  if (mission.status === "in_progress") {
    return { label: "Em Execução", className: "bg-orange-500/20 text-orange-700 border-orange-300" };
  }
  if (scheduledFor > now) {
    return { label: "Aguardando Janela", className: "bg-muted text-muted-foreground border-muted" };
  }
  if (mission.status === "pending" || mission.status === "assigned") {
    return { label: "Liberada", className: "bg-blue-500/20 text-blue-700 border-blue-300" };
  }
  return { label: mission.status, className: "bg-muted text-muted-foreground" };
}

function getPriorityBadge(priority: number) {
  if (priority <= 1) return { label: "Urgente", className: "bg-red-500/20 text-red-700 border-red-300" };
  if (priority <= 3) return { label: "Alta", className: "bg-orange-500/20 text-orange-700 border-orange-300" };
  if (priority <= 5) return { label: "Normal", className: "bg-blue-500/20 text-blue-700 border-blue-300" };
  return { label: "Baixa", className: "bg-muted text-muted-foreground" };
}

export function OperadorMissionsList({ onExecuteMission, activeMission, numberBlocked, healthTooLow }: Props) {
  const { user } = useAuth();

  const { data: missions, isLoading } = useQuery({
    queryKey: ["operator-missions", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("posting_missions" as any)
        .select("*")
        .eq("operator_id", user.id)
        .in("status", ["pending", "assigned", "in_progress"])
        .order("scheduled_for", { ascending: true });

      if (error) throw error;

      const missions = data as any as Mission[];

      // Enrich with number and group data
      const numberIds = [...new Set(missions.map(m => m.number_id))];
      const groupIds = [...new Set(missions.map(m => m.group_id))];

      const [numbersRes, driverGroupsRes, motoboyGroupsRes] = await Promise.all([
        numberIds.length > 0
          ? supabase.from("posting_numbers").select("id, phone_number, status, health_score").in("id", numberIds)
          : { data: [] },
        groupIds.length > 0
          ? supabase.from("driver_whatsapp_groups").select("id, cidade, estado, tipo, link").in("id", groupIds)
          : { data: [] },
        groupIds.length > 0
          ? supabase.from("motoboy_whatsapp_groups").select("id, cidade, estado, tipo, link").in("id", groupIds)
          : { data: [] },
      ]);

      const numbersMap = new Map((numbersRes.data || []).map((n: any) => [n.id, n]));
      const groupsMap = new Map([
        ...((driverGroupsRes.data || []) as any[]).map((g: any) => [g.id, g] as const),
        ...((motoboyGroupsRes.data || []) as any[]).map((g: any) => [g.id, g] as const),
      ]);

      return missions.map(m => {
        const num = numbersMap.get(m.number_id) as any;
        const grp = groupsMap.get(m.group_id) as any;
        return {
          ...m,
          phone_number: num?.phone_number || "—",
          number_status: num?.status,
          number_health_score: num?.health_score,
          group_cidade: grp?.cidade || "—",
          group_estado: grp?.estado || "—",
          group_tipo: grp?.tipo || "—",
          group_link: grp?.link,
        };
      });
    },
    refetchInterval: 30000,
    enabled: !!user?.id,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const now = new Date();
  const released = missions?.filter(m => new Date(m.scheduled_for) <= now && (m.status === "pending" || m.status === "assigned")) || [];
  const inProgress = missions?.filter(m => m.status === "in_progress") || [];
  const waiting = missions?.filter(m => new Date(m.scheduled_for) > now) || [];

  if (!missions?.length) {
    return (
      <Card className="border-dashed bg-muted/30">
        <CardContent className="py-8 text-center">
          <Target className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          <p className="font-medium text-muted-foreground">Nenhuma missão ativa no momento</p>
          <p className="text-xs text-muted-foreground mt-1">Aguarde atribuição pelo sistema</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Missões Atribuídas
          <Badge variant="outline" className="ml-auto">
            {missions.length} missão(ões)
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[500px]">
          <div className="p-4 space-y-3">
            {/* In Progress first */}
            {inProgress.map(mission => (
              <MissionCard key={mission.id} mission={mission} isActive={activeMission?.id === mission.id} onExecute={onExecuteMission} disabled={false} numberBlocked={numberBlocked} healthTooLow={healthTooLow} />
            ))}
            {/* Released */}
            {released.map(mission => (
              <MissionCard key={mission.id} mission={mission} isActive={false} onExecute={onExecuteMission} disabled={!!activeMission} numberBlocked={numberBlocked} healthTooLow={healthTooLow} />
            ))}
            {/* Waiting */}
            {waiting.map(mission => (
              <MissionCard key={mission.id} mission={mission} isActive={false} onExecute={() => {}} disabled={true} numberBlocked={numberBlocked} healthTooLow={healthTooLow} />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function MissionCard({ mission, isActive, onExecute, disabled, numberBlocked, healthTooLow }: {
  mission: Mission;
  isActive: boolean;
  onExecute: (m: Mission) => void;
  disabled: boolean;
  numberBlocked: boolean;
  healthTooLow: boolean;
}) {
  const badge = getMissionBadge(mission);
  const priorityBadge = getPriorityBadge(mission.priority);
  const isReleased = new Date(mission.scheduled_for) <= new Date() && (mission.status === "pending" || mission.status === "assigned");
  const isInProgress = mission.status === "in_progress";
  const canExecute = (isReleased || isInProgress) && !numberBlocked && !healthTooLow;

  return (
    <Card className={`transition-all ${isActive ? "ring-2 ring-primary border-primary" : ""} ${numberBlocked ? "opacity-50" : ""}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
              <Badge variant="outline" className={priorityBadge.className}>{priorityBadge.label}</Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span className="font-mono">{mission.phone_number}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span>{mission.group_cidade}/{mission.group_estado} — {mission.group_tipo}</span>
            </div>
            {mission.region_id && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span>{mission.region_id}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span>
                Programado: {format(new Date(mission.scheduled_for), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
          </div>
        </div>

        {canExecute && !disabled && (
          <Button className="w-full" size="lg" onClick={() => onExecute(mission)}>
            <Play className="h-5 w-5 mr-2" />
            {isInProgress ? "CONTINUAR MISSÃO" : "EXECUTAR MISSÃO"}
          </Button>
        )}

        {numberBlocked && (
          <p className="text-xs text-destructive text-center">Número bloqueado pelo sistema nacional</p>
        )}
        {healthTooLow && !numberBlocked && (
          <p className="text-xs text-destructive text-center">Health score abaixo do limite ({"<"}40)</p>
        )}
      </CardContent>
    </Card>
  );
}
