import { useState, useRef, useEffect } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AvatarUploadProps {
  userId: string;
  currentAvatarUrl: string | null;
  userName: string | null;
  onUploadComplete: (url: string) => void;
}

export function AvatarUpload({ userId, currentAvatarUrl, userName, onUploadComplete }: AvatarUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync preview when parent provides updated avatar URL (e.g. after refetch)
  useEffect(() => {
    setPreviewUrl(currentAvatarUrl);
  }, [currentAvatarUrl]);

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem válida');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 5MB');
      return;
    }

    // Show preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${userId}/${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      onUploadComplete(publicUrl);
      toast.success('Foto atualizada com sucesso!');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Erro ao fazer upload da foto');
      setPreviewUrl(currentAvatarUrl); // Revert preview on error
    } finally {
      setIsUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <Avatar className="h-28 w-28 border-4 border-primary/20">
          <AvatarImage src={previewUrl || undefined} alt={userName || 'Avatar'} />
          <AvatarFallback className="text-2xl bg-primary/10 text-primary">
            {getInitials(userName)}
          </AvatarFallback>
        </Avatar>
        
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="absolute bottom-0 right-0 h-9 w-9 rounded-full shadow-lg"
          onClick={handleClick}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <p className="text-sm text-muted-foreground">
        Clique no ícone para alterar a foto
      </p>
    </div>
  );
}
