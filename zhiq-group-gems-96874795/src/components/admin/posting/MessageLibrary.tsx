import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, MessageSquare, Trash2, Loader2, Pencil, BarChart3, Pause, Play } from "lucide-react";
import { getMessageLibrary, createMessageLibraryItem, deleteMessageLibraryItem, updateMessageLibraryItem, MessageLibraryItem } from "@/lib/postingApi";
import { EditMessageModal } from "./EditMessageModal";

export function MessageLibrary() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editMessage, setEditMessage] = useState<MessageLibraryItem | null>(null);
  const [newMessage, setNewMessage] = useState({ title: "", body: "", category: "" });

  const { data: messages, isLoading } = useQuery({
    queryKey: ["message-library"],
    queryFn: getMessageLibrary,
  });

  const createMutation = useMutation({
    mutationFn: () => createMessageLibraryItem(newMessage.title, newMessage.body, newMessage.category || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-library"] });
      toast.success("Mensagem adicionada!");
      setIsDialogOpen(false);
      setNewMessage({ title: "", body: "", category: "" });
    },
    onError: (error) => toast.error("Erro: " + error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMessageLibraryItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-library"] });
      toast.success("Mensagem removida!");
    },
    onError: () => toast.error("Erro ao remover"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateMessageLibraryItem(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-library"] });
      toast.success("Status atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar status"),
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Biblioteca de Mensagens</CardTitle>
            <CardDescription>Gerencie textos para postagens</CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nova Mensagem</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Nova Mensagem</DialogTitle>
                <DialogDescription>Crie uma mensagem modelo</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input value={newMessage.title} onChange={(e) => setNewMessage(p => ({ ...p, title: e.target.value }))} placeholder="Nome da mensagem" />
                </div>
                <div className="space-y-2">
                  <Label>Conteúdo</Label>
                  <Textarea value={newMessage.body} onChange={(e) => setNewMessage(p => ({ ...p, body: e.target.value }))} placeholder="Texto da mensagem..." rows={5} />
                </div>
                <div className="space-y-2">
                  <Label>Categoria (opcional)</Label>
                  <Input value={newMessage.category} onChange={(e) => setNewMessage(p => ({ ...p, category: e.target.value }))} placeholder="Ex: institucional, promoção..." />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button onClick={() => createMutation.mutate()} disabled={!newMessage.title || !newMessage.body || createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Adicionar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : !messages?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma mensagem cadastrada</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => {
                const inactive = msg.is_active === false;
                return (
                  <Card key={msg.id} className={`transition-opacity ${inactive ? "opacity-50" : ""}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-medium">{msg.title}</h3>
                            {msg.priority && <Badge variant="secondary" className="text-xs font-bold">P{msg.priority}</Badge>}
                            <Badge variant={msg.is_active !== false ? "default" : "secondary"}>
                              {msg.is_active !== false ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">{msg.body}</p>
                          <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                            <span>Uso: {msg.total_usage ?? 0}</span>
                            {msg.category && <Badge variant="outline" className="text-xs">{msg.category}</Badge>}
                            {msg.allow_link && <Badge variant="outline" className="text-xs">🔗 Link</Badge>}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => setEditMessage(msg)} title="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleActiveMutation.mutate({ id: msg.id, is_active: msg.is_active === false })}
                            title={msg.is_active !== false ? "Pausar" : "Ativar"}
                          >
                            {msg.is_active !== false ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          </Button>
                          <Button variant="outline" size="sm" title="Estatísticas">
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(msg.id)} title="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <EditMessageModal message={editMessage} open={!!editMessage} onOpenChange={(o) => !o && setEditMessage(null)} />
    </>
  );
}
