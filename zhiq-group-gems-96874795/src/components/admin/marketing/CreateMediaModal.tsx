import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regions: string[];
}

export function CreateMediaModal({ open, onOpenChange, regions }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [mediaType, setMediaType] = useState("image");
  const [regionId, setRegionId] = useState("");
  const [cityId, setCityId] = useState("");
  const [templateText, setTemplateText] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  const needsFile = mediaType === "image" || mediaType === "video";
  const canSave = title.trim() && regionId && (!needsFile || file) && !uploading;

  const resetForm = () => {
    setTitle("");
    setMediaType("image");
    setRegionId("");
    setCityId("");
    setTemplateText("");
    setIsActive(true);
    setFile(null);
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Título é obrigatório"); return; }
    if (!regionId) { toast.error("Região é obrigatória"); return; }
    if (needsFile && !file) { toast.error("Arquivo é obrigatório para imagem/vídeo"); return; }

    setSaving(true);
    try {
      // Step 0: Validate active session before any upload
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) {
        toast.error("Sessão expirada. Faça login novamente para enviar mídia.");
        return;
      }

      // Step 1: Upload file to Storage FIRST
      let mediaUrl = "";

      if (file) {
        setUploading(true);
        setUploadProgress("Enviando arquivo...");
        try {
          const ext = file.name.split(".").pop() || "bin";
          const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("marketing-media-motoboy")
            .upload(path, file, { contentType: file.type, upsert: false });
          if (uploadError) throw new Error(`Falha no upload: ${uploadError.message}`);

          setUploadProgress("Obtendo URL...");
          // Step 2: Get public URL only after successful upload
          const { data: urlData } = supabase.storage
            .from("marketing-media-motoboy")
            .getPublicUrl(path);
          mediaUrl = urlData.publicUrl;
        } finally {
          setUploading(false);
          setUploadProgress("");
        }
      }

      // For text type without file, use a placeholder
      if (!mediaUrl && mediaType === "text") {
        mediaUrl = "text-only";
      }

      // Guard: never insert without a valid URL
      if (!mediaUrl) {
        throw new Error("Upload falhou: URL da mídia não disponível");
      }

      // Step 3: Insert into media_library ONLY after URL is confirmed
      const { error } = await supabase
        .from("media_library")
        .insert({
          title: title.trim(),
          media_type: mediaType as "image" | "video",
          media_url: mediaUrl,
          status: "ativo",
          campaign_type: "institucional",
          scope: "global",
          description: templateText || null,
          created_by: user?.id,
          tags: regionId ? [regionId] : [],
        });

      if (error) throw error;

      toast.success("Mídia criada com sucesso");
      window.dispatchEvent(new Event("operator-live-update"));
      resetForm();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(`Erro ao salvar imagem: ${err instanceof Error ? err.message : "Desconhecido"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Mídia de Marketing</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="media-title">Título *</Label>
            <Input
              id="media-title"
              placeholder="Ex: Banner Blumenau Promoção"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select value={mediaType} onValueChange={setMediaType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="image">Imagem</SelectItem>
                <SelectItem value="video">Vídeo</SelectItem>
                <SelectItem value="text">Texto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Region */}
          <div className="space-y-1.5">
            <Label>Região *</Label>
            <Select value={regionId} onValueChange={setRegionId}>
              <SelectTrigger><SelectValue placeholder="Selecione a região" /></SelectTrigger>
              <SelectContent>
                {regions.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* City */}
          <div className="space-y-1.5">
            <Label>Cidade (opcional)</Label>
            <Input
              placeholder="Ex: Blumenau"
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
              maxLength={100}
            />
          </div>

          {/* Template text */}
          <div className="space-y-1.5">
            <Label>Template de texto</Label>
            <Textarea
              placeholder="Texto que acompanha a mídia..."
              value={templateText}
              onChange={(e) => setTemplateText(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>

          {/* File upload */}
          {needsFile && (
            <div className="space-y-1.5">
              <Label>Arquivo *</Label>
              <input
                key={mediaType}
                ref={fileRef}
                type="file"
                accept={mediaType === "image" ? "image/*" : "video/*"}
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file ? (
                <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <span className="truncate flex-1">{file.name}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFile(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Selecionar {mediaType === "image" ? "imagem" : "vídeo"}
                </Button>
              )}
            </div>
          )}

          {/* Active switch */}
          <div className="flex items-center justify-between">
            <Label>Ativa</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <Button
              variant="outline"
              className="w-full sm:flex-1"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              className="w-full sm:flex-1"
              onClick={handleSave}
              disabled={saving || !canSave}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {uploadProgress || "Salvando..."}
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
