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
import { Plus, Image, Video, Trash2, Pause, Play, Upload, Loader2, Pencil, BarChart3 } from "lucide-react";
import { getMediaLibrary, createMedia, updateMediaStatus, deleteMedia, uploadMediaFile, MediaItem } from "@/lib/postingApi";
import { EditMediaModal } from "./EditMediaModal";

const TAG_OPTIONS = [
  { value: "motorista", label: "Motorista" },
  { value: "motoboy", label: "Motoboy" },
  { value: "lojista", label: "Lojista" },
  { value: "geral", label: "Geral" },
];

export function MediaLibrary() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editMedia, setEditMedia] = useState<MediaItem | null>(null);
  const [newMedia, setNewMedia] = useState({
    title: "",
    description: "",
    media_type: "image" as "image" | "video",
    tags: [] as string[],
    file: null as File | null,
  });

  const { data: mediaItems, isLoading } = useQuery({
    queryKey: ["media-library"],
    queryFn: getMediaLibrary,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newMedia.file) throw new Error("Selecione um arquivo");
      setIsUploading(true);
      const url = await uploadMediaFile(newMedia.file);
      return createMedia(newMedia.title, newMedia.media_type, url, newMedia.tags, newMedia.description || undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-library"] });
      toast.success("Mídia adicionada!");
      setIsDialogOpen(false);
      setNewMedia({ title: "", description: "", media_type: "image", tags: [], file: null });
    },
    onError: (error) => toast.error("Erro: " + error.message),
    onSettled: () => setIsUploading(false),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ativo' | 'pausado' }) => updateMediaStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-library"] });
      toast.success("Status atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar status"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMedia,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-library"] });
      toast.success("Mídia removida!");
    },
    onError: () => toast.error("Erro ao remover mídia"),
  });

  const handleTagToggle = (tag: string) => {
    setNewMedia((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewMedia((prev) => ({ ...prev, file, media_type: file.type.startsWith("video/") ? "video" : "image" }));
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Biblioteca de Mídia</CardTitle>
            <CardDescription>Gerencie imagens e vídeos para postagens</CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nova Mídia</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Adicionar Nova Mídia</DialogTitle>
                <DialogDescription>Faça upload de uma imagem ou vídeo</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input value={newMedia.title} onChange={(e) => setNewMedia(p => ({ ...p, title: e.target.value }))} placeholder="Nome da mídia" />
                </div>
                <div className="space-y-2">
                  <Label>Descrição (opcional)</Label>
                  <Textarea value={newMedia.description} onChange={(e) => setNewMedia(p => ({ ...p, description: e.target.value }))} placeholder="Descrição da mídia" />
                </div>
                <div className="space-y-2">
                  <Label>Arquivo</Label>
                  <Input type="file" accept="image/*,video/*" onChange={handleFileChange} />
                  {newMedia.file && <p className="text-sm text-muted-foreground">{newMedia.file.name}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Tags</Label>
                  <div className="flex flex-wrap gap-2">
                    {TAG_OPTIONS.map((tag) => (
                      <Badge key={tag.value} variant={newMedia.tags.includes(tag.value) ? "default" : "outline"} className="cursor-pointer" onClick={() => handleTagToggle(tag.value)}>{tag.label}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isUploading}>Cancelar</Button>
                <Button onClick={() => createMutation.mutate()} disabled={!newMedia.title || !newMedia.file || isUploading}>
                  {isUploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</> : <><Upload className="h-4 w-4 mr-2" />Adicionar</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : !mediaItems?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Image className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma mídia cadastrada</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mediaItems.map((item) => {
                const inactive = item.is_active === false;
                return (
                  <Card key={item.id} className={`overflow-hidden transition-opacity ${inactive ? "opacity-50" : ""}`}>
                    <div className="aspect-video relative bg-muted">
                      {item.media_type === "video" ? (
                        <video src={item.media_url} className="w-full h-full object-cover" controls />
                      ) : (
                        <img src={item.media_url} alt={item.title} className="w-full h-full object-cover" />
                      )}
                      {/* Top-right badges */}
                      <div className="absolute top-2 right-2 flex gap-1">
                        {item.priority && (
                          <Badge variant="secondary" className="text-xs font-bold">P{item.priority}</Badge>
                        )}
                        <Badge variant={item.is_active !== false ? "default" : "secondary"} className="text-xs">
                          {item.is_active !== false ? "Ativo" : "Pausado"}
                        </Badge>
                      </div>
                      <div className="absolute top-2 left-2">
                        {item.media_type === "video" ? <Video className="h-5 w-5 text-white drop-shadow-md" /> : <Image className="h-5 w-5 text-white drop-shadow-md" />}
                      </div>
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-medium truncate">{item.title}</h3>
                      {item.description && <p className="text-sm text-muted-foreground truncate">{item.description}</p>}
                      
                      {/* Indicators */}
                      <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                        <span>Uso: {item.total_usage ?? 0}</span>
                        <span>Limite: {item.max_daily_usage ?? "∞"}/dia</span>
                        {item.campaign_type && <Badge variant="outline" className="text-xs">{item.campaign_type}</Badge>}
                      </div>

                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">{TAG_OPTIONS.find((t) => t.value === tag)?.label || tag}</Badge>
                        ))}
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 mt-4">
                        <Button variant="outline" size="sm" onClick={() => setEditMedia(item)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => statusMutation.mutate({ id: item.id, status: item.status === "ativo" ? "pausado" : "ativo" })} title={item.status === "ativo" ? "Pausar" : "Ativar"}>
                          {item.status === "ativo" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Button variant="outline" size="sm" title="Estatísticas">
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(item.id)} title="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <EditMediaModal media={editMedia} open={!!editMedia} onOpenChange={(o) => !o && setEditMedia(null)} />
    </>
  );
}
