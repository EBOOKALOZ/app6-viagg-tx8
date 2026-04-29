import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, Loader2, Image, MessageSquare, CheckCircle2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveMedia, getActiveMessages } from "@/lib/postingApi";
import type { Mission } from "./OperadorMissionsList";

interface Props {
  mission: Mission;
  onComplete: () => void;
}

export function OperadorMissionExecution({ mission, onComplete }: Props) {
  const queryClient = useQueryClient();
  const [selectedMedia, setSelectedMedia] = useState<string | null>(mission.media_id);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(mission.message_id);
  const [isPosting, setIsPosting] = useState(false);

  const { data: mediaItems } = useQuery({
    queryKey: ["active-media"],
    queryFn: getActiveMedia,
  });

  const { data: messages } = useQuery({
    queryKey: ["active-messages"],
    queryFn: getActiveMessages,
  });

  // If mission has specific media/message, filter to those
  const availableMedia = mission.media_id
    ? mediaItems?.filter(m => m.id === mission.media_id)
    : mediaItems;

  const availableMessages = mission.message_id
    ? messages?.filter(m => m.id === mission.message_id)
    : messages;

  const handlePost = async () => {
    if (!selectedMedia && !selectedMessage) {
      toast.error("Selecione uma mídia ou mensagem");
      return;
    }

    setIsPosting(true);
    try {
      // 1. Call register_number_action RPC
      const { error: rpcError } = await supabase.rpc("register_number_action", {
        p_number_id: mission.number_id,
        p_action: "post_media",
        p_group_id: mission.group_id,
        p_template_id: selectedMedia || selectedMessage || null,
        p_metadata: { mission_id: mission.id },
      });

      if (rpcError) {
        toast.error(rpcError.message || "Erro ao registrar ação");
        setIsPosting(false);
        return;
      }

      // 2. Update mission to completed
      const { error: updateError } = await supabase
        .from("posting_missions" as any)
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          executed_at: new Date().toISOString(),
        } as any)
        .eq("id", mission.id);

      if (updateError) {
        toast.error("Ação registrada mas erro ao atualizar missão");
        setIsPosting(false);
        return;
      }

      toast.success("Missão concluída com sucesso");
      queryClient.invalidateQueries({ queryKey: ["operator-missions"] });
      queryClient.invalidateQueries({ queryKey: ["operator-released-missions"] });
      queryClient.invalidateQueries({ queryKey: ["operator-number-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["operator-mission-history"] });
      onComplete();
    } catch (err: any) {
      toast.error(err?.message || "Erro inesperado");
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mission context */}
      <Card className="border-primary/50 bg-primary/5">
        <CardContent className="py-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm">
              <span className="font-semibold">Missão ativa:</span>{" "}
              <span className="font-mono">{mission.phone_number}</span> →{" "}
              <span>{mission.group_cidade}/{mission.group_estado}</span>
            </div>
            {mission.group_link && (
              <a
                href={mission.group_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary flex items-center gap-1 hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Abrir Grupo
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Media Selection */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Image className="h-4 w-4" />
              Mídia {mission.media_id ? "(vinculada)" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="grid grid-cols-2 gap-2">
                {availableMedia?.map(media => (
                  <div
                    key={media.id}
                    className={`relative aspect-video rounded-lg overflow-hidden cursor-pointer border-2 transition-colors ${
                      selectedMedia === media.id
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-transparent hover:border-muted-foreground/50"
                    }`}
                    onClick={() => setSelectedMedia(selectedMedia === media.id ? null : media.id)}
                  >
                    {media.media_type === "video" ? (
                      <video src={media.media_url} className="w-full h-full object-cover" />
                    ) : (
                      <img src={media.media_url} alt={media.title} className="w-full h-full object-cover" />
                    )}
                    <div className="absolute inset-0 bg-black/40 flex items-end p-2">
                      <span className="text-white text-xs truncate">{media.title}</span>
                    </div>
                    {selectedMedia === media.id && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      </div>
                    )}
                  </div>
                ))}
                {!availableMedia?.length && (
                  <p className="col-span-2 text-center text-sm text-muted-foreground py-4">
                    Nenhuma mídia disponível
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Message Selection */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Mensagens {mission.message_id ? "(vinculada)" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {availableMessages?.map(msg => (
                  <div
                    key={msg.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedMessage === msg.id
                        ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                        : "border-border hover:border-muted-foreground/50"
                    }`}
                    onClick={() => setSelectedMessage(selectedMessage === msg.id ? null : msg.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{msg.title}</span>
                      {selectedMessage === msg.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{msg.content}</p>
                  </div>
                ))}
                {!availableMessages?.length && (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    Nenhuma mensagem disponível
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Post Button */}
      <Button
        className="w-full"
        size="lg"
        onClick={handlePost}
        disabled={isPosting || (!selectedMedia && !selectedMessage)}
      >
        {isPosting ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Executando...
          </>
        ) : (
          <>
            <Send className="h-5 w-5 mr-2" />
            CONCLUIR MISSÃO
          </>
        )}
      </Button>
    </div>
  );
}
