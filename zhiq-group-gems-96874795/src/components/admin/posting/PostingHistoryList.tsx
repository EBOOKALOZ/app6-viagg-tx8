import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History, CheckCircle2, XCircle, AlertCircle, Loader2, Car, Bike } from "lucide-react";
import { getPostingHistory, getMediaLibrary, PostingHistory, MediaItem } from "@/lib/postingApi";

const STATUS_CONFIG = {
  postado: {
    label: "Postado",
    variant: "default" as const,
    icon: CheckCircle2,
    color: "text-green-500",
  },
  erro: {
    label: "Erro",
    variant: "destructive" as const,
    icon: XCircle,
    color: "text-red-500",
  },
  bloqueado: {
    label: "Bloqueado",
    variant: "secondary" as const,
    icon: AlertCircle,
    color: "text-orange-500",
  },
};

export function PostingHistoryList() {
  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["posting-history"],
    queryFn: () => getPostingHistory(100),
  });

  const { data: mediaItems } = useQuery({
    queryKey: ["media-library"],
    queryFn: getMediaLibrary,
  });

  const getMediaTitle = (mediaId: string | null) => {
    if (!mediaId || !mediaItems) return "-";
    const media = mediaItems.find((m) => m.id === mediaId);
    return media?.title || "Mídia não encontrada";
  };

  if (historyLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Histórico de Postagens
        </CardTitle>
        <CardDescription>
          Últimas {history?.length || 0} postagens registradas
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!history?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma postagem registrada</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Mídia</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => {
                  const statusConfig = STATUS_CONFIG[item.status];
                  const StatusIcon = statusConfig.icon;

                  return (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(item.posted_at), "dd/MM/yyyy HH:mm", {
                          locale: ptBR,
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {item.group_type === "driver" ? (
                            <>
                              <Car className="h-4 w-4 text-blue-500" />
                              <span>Motorista</span>
                            </>
                          ) : (
                            <>
                              <Bike className="h-4 w-4 text-green-500" />
                              <span>Motoboy</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {getMediaTitle(item.media_id)}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {item.message ? (
                          <span className="truncate block">{item.message.substring(0, 50)}...</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={statusConfig.variant} className="gap-1">
                            <StatusIcon className={`h-3 w-3 ${statusConfig.color}`} />
                            {statusConfig.label}
                          </Badge>
                        </div>
                        {item.error_message && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {item.error_message}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
