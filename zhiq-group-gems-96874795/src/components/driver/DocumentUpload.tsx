import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, Loader2, CheckCircle, Image } from 'lucide-react';

interface DocumentUploadProps {
  userId: string;
  documentType: 'selfie' | 'cnh';
  currentUrl: string | null;
  onUploadComplete: (url: string) => void;
  label: string;
  accept?: string;
}

export default function DocumentUpload({
  userId,
  documentType,
  currentUrl,
  onUploadComplete,
  label,
  accept = 'image/*',
}: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 5MB');
      return;
    }

    setUploading(true);

    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => setPreviewUrl(e.target?.result as string);
      reader.readAsDataURL(file);

      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${documentType}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('driver-documents')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get signed URL for private bucket
      const { data: urlData, error: urlError } = await supabase.storage
        .from('driver-documents')
        .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 year

      if (urlError) throw urlError;

      onUploadComplete(urlData.signedUrl);
      toast.success('Documento enviado com sucesso!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao enviar documento');
      setPreviewUrl(currentUrl);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {previewUrl && (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle className="mr-1 h-3 w-3" />
            Enviado
          </Badge>
        )}
      </div>

      <div 
        className="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 p-6 transition-colors hover:border-primary/50"
        onClick={() => fileInputRef.current?.click()}
      >
        {previewUrl ? (
          <div className="relative h-32 w-full">
            <img
              src={previewUrl}
              alt={label}
              className="mx-auto h-full w-auto rounded-lg object-contain"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Image className="h-10 w-10" />
            <span className="text-sm">Clique para enviar</span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileSelect}
          className="hidden"
          disabled={uploading}
        />

        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/80">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enviando...
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" />
            {previewUrl ? 'Trocar imagem' : 'Enviar imagem'}
          </>
        )}
      </Button>
    </div>
  );
}
