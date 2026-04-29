import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, History, CheckCircle2, Phone, Users, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CompletedMission {
  id: string;
  number_id: string;
  group_id: string;
  priority: number;
  completed_at: string;
  region_id: string | null;
  phone_number?: string;
  group_cidade?: string;
  group_estado?: string;
  group_tipo?: string;
}

export function OperadorMissionHistory() {
  const { user } = useAuth();

  const { data: missions, isLoading } = useQuery({
    queryKey: ["operator-mission-history", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("posting_missions" as any)
        .select("id, number_id, group_id, priority, completed_at, region_id")
        .eq("operator_id", user.id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      const items = data as any as CompletedMission[];

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

      return items.map(m => ({
        ...m,
        phone_number: (numbersMap.get(m.number_id) as any)?.phone_number || "—",
        group_cidade: (groupsMap.get(m.group_id) as any)?.cidade || "—",
        group_estado: (groupsMap.get(m.group_id) as any)?.estado || "—",
        group_tipo: (groupsMap.get(m.group_id) as any)?.tipo || "—",
      }));
    },
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
          <History className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Nenhuma missão concluída ainda</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          Missões Concluídas
          <Badge variant="outline" className="ml-auto">{missions.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[400px]">
          <div className="divide-y">
            {missions.map(m => (
              <div key={m.id} className="px-4 py-3 flex items-center gap-4">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono text-xs">{m.phone_number}</span>
                    <span className="text-muted-foreground">→</span>
                    <Users className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs">{m.group_cidade}/{m.group_estado}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {m.completed_at
                      ? format(new Date(m.completed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : "—"}
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      P{m.priority}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
