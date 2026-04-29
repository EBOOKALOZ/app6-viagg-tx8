import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ListOrdered, ArrowRight, Users, XCircle, Pause, Play, Clock, User, MapPin, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";

// Compute offset between client clock and server clock once
let serverOffsetMs = 0;
let offsetFetched = false;

async function fetchServerOffset() {
  if (offsetFetched) return;
  offsetFetched = true;
  try {
    const before = Date.now();
    const { data } = await supabase.rpc("get_server_timestamp" as any);
    const after = Date.now();
    if (data) {
      const serverTime = new Date(data as string).getTime();
      const clientMid = (before + after) / 2;
      serverOffsetMs = serverTime - clientMid;
    }
  } catch {
    // fallback: no offset
  }
}

function serverNow() {
  return Date.now() + serverOffsetMs;
}

function useCountdown(unlockAt: string | null) {
  const [now, setNow] = useState(() => serverNow());

  useEffect(() => {
    fetchServerOffset();
  }, []);

  useEffect(() => {
    if (!unlockAt) return;
    const timer = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(timer);
  }, [unlockAt]);

  if (!unlockAt) return { state: "no_timer" as const, label: "Timer não inicializado" };

  const diff = new Date(unlockAt).getTime() - now;
  if (diff <= 0) return { state: "available" as const, label: "Disponível para postar" };

  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  const label = hours > 0
    ? `Libera em: ${hours}h ${minutes}m ${seconds}s`
    : minutes > 0
      ? `Libera em: ${minutes}m ${seconds}s`
      : `Libera em: ${seconds}s`;

  return { state: "waiting" as const, label };
}

function CountdownBadge({ unlockAt }: { unlockAt: string | null }) {
  const { state, label } = useCountdown(unlockAt);

  const className = state === "waiting"
    ? "text-[10px] gap-1 tabular-nums border-orange-400 text-orange-600 bg-orange-50"
    : state === "no_timer"
      ? "text-[10px] gap-1 border-destructive text-destructive"
      : "text-[10px] gap-1 border-green-500 text-green-600 bg-green-50";

  return (
    <Badge variant="outline" className={className}>
      <Clock className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function useCardColors(unlockAt: string | null) {
  const { state } = useCountdown(unlockAt);
  if (state === "waiting") return "border-orange-400/50 bg-orange-50/60";
  if (state === "no_timer") return "border-destructive/40 bg-destructive/5";
  return "border-green-500/50 bg-green-50/60";
}

function ConfirmedByInfo({ confirmedBy, confirmedAt }: { confirmedBy: string | null; confirmedAt: string | null }) {
  const { data: profile } = useQuery({
    queryKey: ["profile-mini", confirmedBy],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("name, cidade, estado")
        .eq("id", confirmedBy!)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!confirmedBy,
    staleTime: 5 * 60 * 1000,
  });

  if (!confirmedBy) {
    return (
      <p className="text-[10px] text-muted-foreground italic flex items-center gap-1">
        <User className="h-3 w-3" />
        Aguardando motoboy confirmar
      </p>
    );
  }

  const formattedDate = confirmedAt
    ? new Date(confirmedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <div className="text-[10px] space-y-0.5 mt-1 border-t pt-1 border-dashed">
      <p className="flex items-center gap-1 font-medium text-foreground">
        <CheckCircle2 className="h-3 w-3 text-green-600" />
        {profile?.name || "Carregando..."}
      </p>
      {profile?.cidade && (
        <p className="flex items-center gap-1 text-muted-foreground">
          <MapPin className="h-3 w-3" />
          {profile.cidade}{profile.estado ? `/${profile.estado}` : ""}
        </p>
      )}
      <p className="text-muted-foreground">Confirmado em: {formattedDate}</p>
    </div>
  );
}

function ActiveQueueCard({ item, cancellingId, onPause, onCancel }: {
  item: any;
  cancellingId: string | null;
  onPause: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const cardColor = useCardColors(item.admin_unlock_at);
  const isConsumed = item.status === "consumed";

  return (
    <div className={`rounded-lg border p-2 transition-colors ${cardColor}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{item.title || "Sem título"}</p>
          <p className="text-[10px] text-muted-foreground line-clamp-1">{item.text_content}</p>
          <CountdownBadge unlockAt={item.admin_unlock_at} />
        </div>
        {!isConsumed && (
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="text-warning hover:text-warning hover:bg-warning/10 text-xs h-7 px-2" disabled={cancellingId === item.id} onClick={() => onPause(item.id)}>
              {cancellingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Pause className="h-3.5 w-3.5 mr-1" />Pausar</>}
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-7 px-2" disabled={cancellingId === item.id} onClick={() => onCancel(item.id)}>
              <XCircle className="h-3.5 w-3.5 mr-1" />Cancelar
            </Button>
          </div>
        )}
      </div>
      <ConfirmedByInfo confirmedBy={item.posting_confirmed_by} confirmedAt={item.posting_confirmed_at} />
    </div>
  );
}

export function CampaignQueueStatus() {
  const queryClient = useQueryClient();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { data: queueItems, isLoading } = useQuery({
    queryKey: ["admin-campaign-queue-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_queue")
        .select("id, title, text_content, status, created_at, consumed_by, admin_unlock_at, posting_confirmed_by, posting_confirmed_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const activeItems = queueItems?.filter(q => q.status === "active" && !q.consumed_by) || [];
  const pausedItems = queueItems?.filter(q => q.status === "paused") || [];
  const activeCount = activeItems.length;
  const pausedCount = pausedItems.length;
  const consumedCount = queueItems?.filter(q => q.status === "consumed").length || 0;

  const handleForceCancel = async (queueId: string) => {
    if (!confirm("Cancelar esta mensagem definitivamente? Ela será removida da fila do motoboy.")) return;

    setCancellingId(queueId);
    try {
      const { error } = await (supabase.rpc as any)("cancel_queue_message", {
        p_queue_id: queueId,
      });
      if (error) throw error;

      toast.success("Mensagem cancelada definitivamente");
      queryClient.invalidateQueries({ queryKey: ["admin-campaign-queue-status"] });
      queryClient.invalidateQueries({ queryKey: ["admin-message-library"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao cancelar");
    } finally {
      setCancellingId(null);
    }
  };

  const handlePause = async (campaignId: string) => {
    setCancellingId(campaignId);
    try {
      const { error } = await supabase.rpc("pause_campaign", {
        p_campaign_id: campaignId,
      });
      if (error) throw error;
      toast.success("Campanha pausada");
      queryClient.invalidateQueries({ queryKey: ["admin-campaign-queue-status"] });
      queryClient.invalidateQueries({ queryKey: ["admin-message-library"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao pausar");
    } finally {
      setCancellingId(null);
    }
  };

  const handleResume = async (campaignId: string) => {
    setCancellingId(campaignId);
    try {
      const { error } = await supabase.rpc("resume_campaign", {
        p_campaign_id: campaignId,
      });
      if (error) throw error;
      toast.success("Campanha retomada");
      queryClient.invalidateQueries({ queryKey: ["admin-campaign-queue-status"] });
      queryClient.invalidateQueries({ queryKey: ["admin-message-library"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao retomar");
    } finally {
      setCancellingId(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ListOrdered className="h-4 w-4 text-blue-500" />
          Fila de Mensagens → Motoboy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-green-600">{activeCount}</p>
            <p className="text-xs text-muted-foreground">Na Fila</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-muted-foreground">{pausedCount}</p>
            <p className="text-xs text-muted-foreground">Pausadas</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{consumedCount}</p>
            <p className="text-xs text-muted-foreground">Consumidas</p>
          </div>
        </div>

        {/* Active queue items with pause/cancel actions */}
        {activeItems.length > 0 && (
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Mensagens ativas na fila:</p>
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-2">
                {activeItems.map((item) => (
                  <ActiveQueueCard
                    key={item.id}
                    item={item}
                    cancellingId={cancellingId}
                    onPause={handlePause}
                    onCancel={handleForceCancel}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Paused queue items with resume/cancel actions */}
        {pausedItems.length > 0 && (
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Mensagens pausadas:</p>
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-2">
                {pausedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-lg border p-2 bg-muted/20 opacity-80"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {item.title || "Sem título"}
                      </p>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">
                        {item.text_content}
                      </p>
                      <CountdownBadge unlockAt={item.admin_unlock_at} />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary hover:text-primary hover:bg-primary/10 text-xs h-7 px-2"
                        disabled={cancellingId === item.id}
                        onClick={() => handleResume(item.id)}
                      >
                        {cancellingId === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5 mr-1" />
                            Retomar
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-7 px-2"
                        disabled={cancellingId === item.id}
                        onClick={() => handleForceCancel(item.id)}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="pt-3 border-t flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span>Campanhas ativas alimentam o</span>
          <Badge variant="outline" className="text-[10px]">
            <ArrowRight className="h-3 w-3 mr-1" />
            Painel Postador do Motoboy
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
