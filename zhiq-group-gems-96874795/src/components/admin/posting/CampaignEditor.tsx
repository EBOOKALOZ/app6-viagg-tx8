import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Megaphone, Plus, Pencil, Trash2, Save, Eye, Image, Video,
  FileText, Link, Loader2, X, MessageSquare, Upload, ImagePlus,
  Pause, Play
} from "lucide-react";
import {
  getMessageLibrary,
  createMessageLibraryItem,
  updateMessageLibraryItem,
  deleteMessageLibraryItem,
  getMediaLibrary,
  createMedia,
  updateMediaFields,
  deleteMedia,
  uploadMediaFile,
  type MessageLibraryItem,
  type MediaItem
} from "@/lib/postingApi";
import { supabase } from "@/integrations/supabase/client";
import { ColorPaletteCard } from "./ColorPaletteCard";

type MediaType = "image" | "video" | null;

interface EditorState {
  mode: "create" | "edit";
  id?: string;
  title: string;
  body: string;
  category: string;
  priority: number;
  mediaType: MediaType;
  mediaUrl: string;
  linkUrl: string;
  themeColor: string;
  targetProfile: string;
}

const EMPTY_EDITOR: EditorState = {
  mode: "create",
  title: "",
  body: "",
  category: "geral",
  priority: 3,
  mediaType: null,
  mediaUrl: "",
  linkUrl: "",
  themeColor: "green",
  targetProfile: "motoboy",
};

const ACCEPTED_IMAGE = ".jpg,.jpeg,.png,.webp";
const ACCEPTED_VIDEO = ".mp4,.mov";

export function CampaignEditor() {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: messages, isLoading: loadingMsgs } = useQuery({
    queryKey: ["admin-message-library"],
    queryFn: getMessageLibrary,
  });

  const { data: mediaItems, isLoading: loadingMedia } = useQuery({
    queryKey: ["admin-media-library"],
    queryFn: getMediaLibrary,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-message-library"] });
    queryClient.invalidateQueries({ queryKey: ["admin-media-library"] });
  };

  const openCreate = () => setEditor({ ...EMPTY_EDITOR });

  const openEdit = (msg: MessageLibraryItem, media?: MediaItem) => {
    const mt: MediaType = media
      ? media.media_type === "video" ? "video" : "image"
      : null;
    setEditor({
      mode: "edit",
      id: msg.id,
      title: msg.title,
      body: msg.body,
      category: msg.category || "geral",
      priority: msg.priority || 3,
      mediaType: mt,
      mediaUrl: media?.media_url || "",
      linkUrl: "",
      themeColor: "green",
      targetProfile: "motoboy",
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    // Detect type from file
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      toast.error("Formato não suportado. Use JPG, PNG, WEBP, MP4 ou MOV.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 50MB.");
      return;
    }

    setIsUploading(true);
    try {
      const url = await uploadMediaFile(file);
      setEditor({ ...editor, mediaUrl: url, mediaType: isVideo ? "video" : "image" });
      toast.success("Arquivo enviado");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar arquivo");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveMedia = () => {
    if (!editor) return;
    setEditor({ ...editor, mediaUrl: "", mediaType: null });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async () => {
    if (!editor) return;
    if (!editor.title.trim() || !editor.body.trim()) {
      toast.error("Título e corpo são obrigatórios");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editor.mode === "create") {
        await createMessageLibraryItem(
          editor.title,
          editor.body,
          editor.category,
          editor.priority
        );

        // If has media, create media entry linked by title
        if (editor.mediaType && editor.mediaUrl) {
          await createMedia(
            editor.title,
            editor.mediaType,
            editor.mediaUrl,
            [editor.category]
          );
        }

        // Insert into campaign_queue with status = 'active'
        const { data: userData } = await supabase.auth.getUser();
        const contentType = editor.mediaType
          ? (editor.body.trim() ? "mixed" : editor.mediaType)
          : "text";

        const { data: insertedRows, error: queueError } = await supabase
          .from("campaign_queue")
          .insert({
            title: editor.title,
            text_content: editor.body,
            content_type: contentType,
            media_url: editor.mediaUrl || null,
            link_url: editor.linkUrl || null,
            status: "active",
            is_global: true,
            theme_color: editor.themeColor,
            target_profile: editor.targetProfile,
            created_by: userData.user?.id || null,
          })
          .select("id")
          .single();

        if (queueError) throw queueError;

        // Arm the 5-minute timer via backend RPC (source of truth)
        const { error: timerError } = await supabase.rpc("admin_start_campaign_timer", {
          p_campaign_id: insertedRows.id,
        });
        if (timerError) {
          console.error("Timer RPC error:", timerError);
          toast.error("Campanha criada mas timer falhou. Tente novamente.");
        }

        toast.success("Campanha criada e publicada na fila");
      } else {
        await updateMessageLibraryItem(editor.id!, {
          title: editor.title,
          body: editor.body,
          category: editor.category,
          priority: editor.priority,
          is_active: true,
        });

        toast.success("Campanha atualizada");
      }

      invalidateAll();
      setEditor(null);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (msgId: string) => {
    if (!confirm("Cancelar esta campanha definitivamente?")) return;
    try {
      const msg = messages?.find(m => m.id === msgId);
      if (msg?.title) {
        const { data: queueItems } = await supabase
          .from("campaign_queue")
          .select("id")
          .eq("title", msg.title)
          .in("status", ["pending", "active"]);

        if (queueItems?.length) {
          for (const item of queueItems) {
            const { error: rpcError } = await supabase.rpc("cancel_campaign", {
              p_campaign_id: item.id,
            });
            if (rpcError) console.warn("cancel_campaign RPC:", rpcError.message);
          }
        }
      }

      await deleteMessageLibraryItem(msgId);
      toast.success("Campanha cancelada");
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["admin-campaign-queue-status"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao cancelar");
    }
  };

  const handlePause = async (msgId: string) => {
    try {
      const msg = messages?.find(m => m.id === msgId);
      if (msg?.title) {
        const { data: queueItems } = await supabase
          .from("campaign_queue")
          .select("id")
          .eq("title", msg.title)
          .eq("status", "active");

        if (queueItems?.length) {
          for (const item of queueItems) {
            const { error } = await supabase.rpc("pause_campaign", {
              p_campaign_id: item.id,
            });
            if (error) throw error;
          }
        }
      }
      toast.success("Campanha pausada");
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["admin-campaign-queue-status"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao pausar");
    }
  };

  const handleResume = async (msgId: string) => {
    try {
      const msg = messages?.find(m => m.id === msgId);
      if (msg?.title) {
        const { data: queueItems } = await supabase
          .from("campaign_queue")
          .select("id")
          .eq("title", msg.title)
          .eq("status", "paused");

        if (queueItems?.length) {
          for (const item of queueItems) {
            const { error } = await supabase.rpc("resume_campaign", {
              p_campaign_id: item.id,
            });
            if (error) throw error;
          }
        }
      }
      toast.success("Campanha retomada");
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["admin-campaign-queue-status"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao retomar");
    }
  };

  const isLoading = loadingMsgs || loadingMedia;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              Editor de Campanhas
            </CardTitle>
            {!editor && (
              <Button onClick={openCreate} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nova Campanha
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Crie e gerencie campanhas. Ao publicar, a mensagem entra na Fila de Mensagens do Motoboy.
          </p>
        </CardHeader>

        {/* Editor Form */}
        {editor && (
          <CardContent className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs">
                {editor.mode === "create" ? "Nova Campanha" : "Editando"}
              </Badge>
              <Button variant="ghost" size="icon" onClick={() => setEditor(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left: Form */}
              <div className="space-y-3">
                <div>
                  <Label>Título da Campanha</Label>
                  <Input
                    value={editor.title}
                    onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                    placeholder="Ex: Promoção Frete Grátis Dezembro"
                  />
                </div>

                <div>
                  <Label>Corpo da Mensagem</Label>
                  <Textarea
                    value={editor.body}
                    onChange={(e) => setEditor({ ...editor, body: e.target.value })}
                    placeholder="Escreva a mensagem que o motoboy verá e postará no grupo..."
                    rows={5}
                  />
                </div>

                {/* Media Upload - Optional */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <ImagePlus className="h-4 w-4" />
                    Mídia da Campanha (opcional)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Anexe 1 imagem (JPG, PNG, WEBP) ou 1 vídeo (MP4, MOV). Apenas 1 mídia por campanha.
                  </p>

                  {editor.mediaUrl ? (
                    <div className="relative rounded-lg border overflow-hidden bg-muted/30">
                      {editor.mediaType === "video" ? (
                        <video
                          src={editor.mediaUrl}
                          controls
                          className="w-full max-h-40 object-contain"
                        />
                      ) : (
                        <img
                          src={editor.mediaUrl}
                          alt="Mídia"
                          className="w-full max-h-40 object-contain"
                        />
                      )}
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-7 w-7"
                        onClick={handleRemoveMedia}
                        title="Remover mídia"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <div className="absolute bottom-2 left-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {editor.mediaType === "video" ? (
                            <><Video className="h-3 w-3 mr-1" />Vídeo</>
                          ) : (
                            <><Image className="h-3 w-3 mr-1" />Imagem</>
                          )}
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 p-6 cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/50"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">Clique para enviar imagem ou vídeo</p>
                      <p className="text-[10px] text-muted-foreground/60">JPG, PNG, WEBP, MP4, MOV — máx. 50MB</p>
                      {isUploading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={`${ACCEPTED_IMAGE},${ACCEPTED_VIDEO}`}
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={isUploading}
                  />
                </div>

                <div>
                  <Label>Link (opcional)</Label>
                  <Input
                    value={editor.linkUrl}
                    onChange={(e) => setEditor({ ...editor, linkUrl: e.target.value })}
                    placeholder="https://..."
                    type="url"
                  />
                </div>

                <ColorPaletteCard
                  selected={editor.themeColor}
                  onChange={(c) => setEditor({ ...editor, themeColor: c })}
                />

                <div>
                  <Label className="flex items-center gap-1.5">
                    🎯 Perfil de destino
                  </Label>
                  <Select
                    value={editor.targetProfile}
                    onValueChange={(v) => setEditor({ ...editor, targetProfile: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="motoboy">🛵 Motoboy</SelectItem>
                      <SelectItem value="passenger" disabled>🚶 Passageiro (em breve)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">Define quem receberá esta campanha na fila.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Categoria</Label>
                    <Select
                      value={editor.category}
                      onValueChange={(v) => setEditor({ ...editor, category: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="geral">Geral</SelectItem>
                        <SelectItem value="promocao">Promoção</SelectItem>
                        <SelectItem value="institucional">Institucional</SelectItem>
                        <SelectItem value="engajamento">Engajamento</SelectItem>
                        <SelectItem value="recrutamento">Recrutamento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Prioridade</Label>
                    <Select
                      value={String(editor.priority)}
                      onValueChange={(v) => setEditor({ ...editor, priority: Number(v) })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">P1 — Urgente</SelectItem>
                        <SelectItem value="2">P2 — Alta</SelectItem>
                        <SelectItem value="3">P3 — Normal</SelectItem>
                        <SelectItem value="4">P4 — Baixa</SelectItem>
                        <SelectItem value="5">P5 — Mínima</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Right: Preview */}
              <div>
                <Label className="flex items-center gap-1 mb-2">
                  <Eye className="h-4 w-4" /> Preview (como o Motoboy verá)
                </Label>
                <Card className="bg-muted/30 border-dashed">
                  <CardContent className="py-4 space-y-3">
                    {/* Media preview */}
                    {editor.mediaUrl && editor.mediaType ? (
                      <div className="rounded-lg overflow-hidden border">
                        {editor.mediaType === "video" ? (
                          <video
                            src={editor.mediaUrl}
                            controls
                            className="w-full max-h-48 object-cover"
                          />
                        ) : (
                          <img
                            src={editor.mediaUrl}
                            alt="Preview"
                            className="w-full max-h-48 object-cover"
                          />
                        )}
                      </div>
                    ) : null}

                    {/* Text preview */}
                    <div className="bg-background rounded-lg p-3 border">
                      <p className="font-semibold text-sm mb-1">
                        {editor.title || "Título da campanha"}
                      </p>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                        {editor.body || "Corpo da mensagem..."}
                      </p>
                      {editor.linkUrl && (
                        <p className="text-xs text-primary mt-2 flex items-center gap-1">
                          <Link className="h-3 w-3" />
                          {editor.linkUrl}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">{editor.category}</Badge>
                      <Badge variant="outline" className="text-[10px]">P{editor.priority}</Badge>
                      {editor.mediaType && (
                        <Badge variant="outline" className="text-[10px]">
                          {editor.mediaType === "video" ? "📹 Vídeo" : "🖼️ Imagem"}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setEditor(null)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSubmitting}>
                {isSubmitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" /> Salvar & Publicar na Fila</>
                )}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Campaign List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            Campanhas Criadas
            {messages?.length ? (
              <Badge variant="outline" className="ml-auto">{messages.length}</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !messages?.length ? (
            <div className="py-8 text-center">
              <Megaphone className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-medium text-muted-foreground">Nenhuma campanha criada</p>
              <p className="text-xs text-muted-foreground mt-1">
                Clique em "Nova Campanha" para começar
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-2">
                {messages.map((msg) => {
                  const linkedMedia = mediaItems?.find(m => m.title === msg.title);
                  return (
                    <Card key={msg.id} className={`transition-all ${msg.is_active === false ? "opacity-60" : ""}`}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm truncate">{msg.title}</span>
                              <Badge
                                variant="outline"
                                className={msg.is_active !== false
                                  ? "bg-primary/10 text-primary border-primary/30"
                                  : "bg-muted text-muted-foreground"
                                }
                              >
                                {msg.is_active !== false ? "Na Fila" : "Pausada"}
                              </Badge>
                              {msg.category && (
                                <Badge variant="outline" className="text-[10px]">{msg.category}</Badge>
                              )}
                              <Badge variant="outline" className="text-[10px]">P{msg.priority || 3}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{msg.body}</p>
                            {linkedMedia && (
                              <p className="text-xs text-primary mt-1 flex items-center gap-1">
                                {linkedMedia.media_type === "video" ? <Video className="h-3 w-3" /> : <Image className="h-3 w-3" />}
                                {linkedMedia.media_type === "video" ? "Vídeo" : "Imagem"} vinculada
                              </p>
                            )}
                            {msg.total_usage != null && msg.total_usage > 0 && (
                              <p className="text-[10px] text-muted-foreground mt-1">
                                Usada {msg.total_usage}x
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(msg, linkedMedia)}
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {msg.is_active !== false ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-warning hover:text-warning"
                                  onClick={() => handlePause(msg.id)}
                                  title="Pausar campanha"
                                >
                                  <Pause className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => handleDelete(msg.id)}
                                  title="Cancelar definitivamente"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-primary hover:text-primary"
                                onClick={() => handleResume(msg.id)}
                                title="Retomar campanha"
                              >
                                <Play className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
