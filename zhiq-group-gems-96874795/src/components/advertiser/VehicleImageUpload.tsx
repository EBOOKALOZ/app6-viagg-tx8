import React, { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Upload, CheckCircle2, AlertCircle, Loader2, X, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generatePreview, processForUpload, sanitizeFileName, formatFileSize } from '@/lib/imageCompressor';
import { moderatedUpload } from '@/lib/moderation/moderatedUpload';

interface VehicleImageUploadProps {
  listingId?: string;
  onUploadComplete?: (mediaId: string, path: string) => void;
  onFilesSelected?: (files: File[]) => void;
}


export const VehicleImageUpload: React.FC<VehicleImageUploadProps> = ({ 
  listingId, 
  onUploadComplete,
  onFilesSelected
}) => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<{file: File, preview: string}[]>([]);
  const [uploadedImages, setUploadedImages] = useState<{id: string, path: string}[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generatingPreviews, setGeneratingPreviews] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const MAX_PHOTOS = 6;

  const processFiles = async (files: FileList | File[]) => {
    let fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const currentCount = listingId ? uploadedImages.length : selectedFiles.length;
    const remaining = MAX_PHOTOS - currentCount;
    if (remaining <= 0) {
      toast.error(`Limite de ${MAX_PHOTOS} fotos por anúncio atingido.`);
      return;
    }
    if (fileArray.length > remaining) {
      toast.warning(`Só dá pra adicionar mais ${remaining} foto(s) (limite de ${MAX_PHOTOS}).`);
      fileArray = fileArray.slice(0, remaining);
    }

    if (listingId) {
      await uploadFiles(fileArray);
    } else {
      // Gera previews via Canvas para corrigir orientação EXIF
      setGeneratingPreviews(true);
      try {
        const newFiles: {file: File, preview: string}[] = [];
        for (const file of fileArray) {
          const preview = await generatePreview(file);
          newFiles.push({ file, preview: preview || URL.createObjectURL(file) });
        }
        setSelectedFiles(prev => {
          const updated = [...prev, ...newFiles];
          if (onFilesSelected) {
            onFilesSelected(updated.map(f => f.file));
          }
          return updated;
        });
      } finally {
        setGeneratingPreviews(false);
      }
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await processFiles(files);
    event.target.value = '';
  };

  const uploadFiles = async (fileArray: File[]) => {
    try {
      setUploading(true);
      setError(null);
      if (!user) throw new Error("Usuário não autenticado");
      if (!listingId) throw new Error("ID do veículo é obrigatório para upload imediato");

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const processed = await processForUpload(file, { maxDimension: 1600, targetSizeBytes: 200 * 1024 });
        const fileName = `${sanitizeFileName(file.name)}.${processed.extension}`;
        const filePath = `${user.id}/vehicles/${listingId}/original/${fileName}`;
        const blob = processed.blob;
        console.log(`[VehicleUpload] ${file.name}: ${formatFileSize(file.size)} → ${formatFileSize(blob.size)}`);

        const modRes = await moderatedUpload(blob, {
          fileName,
          mime: 'image/jpeg',
          listingId,
          category: 'vehicles',
          targetBucket: 'vehicles-public',
        });

        if (modRes.status === 'blocked') {
          toast.error(`Imagem recusada pelo Viagg-TX8™: ${modRes.reason}`);
          continue;
        }

        const finalPath = modRes.storagePath || filePath;
        const finalStatus = modRes.status === 'approved' ? 'approved' : 'pending_ai_analysis';

        const { data: mediaData, error: mediaError } = await supabase
          .from('vehicle_media' as any)
          .insert({
            listing_id: listingId,
            owner_user_id: user.id,
            original_storage_path: finalPath,
            public_masked_storage_path: modRes.status === 'approved' ? finalPath : null,
            media_type: 'image',
            moderation_status: finalStatus
          } as any)
          .select()
          .single();

        if (mediaError) throw mediaError;

        const previewUrl = modRes.publicUrl || supabase.storage.from('vehicles-public').getPublicUrl(finalPath).data.publicUrl;
        const newImage = { id: (mediaData as any).id, path: previewUrl };
        setUploadedImages(prev => [...prev, newImage]);
        if (onUploadComplete) onUploadComplete(newImage.id, newImage.path);

        setProgress(Math.round(((i + 1) / fileArray.length) * 100));
      }

      toast.success(`${fileArray.length} imagem(ns) enviada(s)!`);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message);
      toast.error(`Erro no upload: ${err.message}`);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const removeSelectedFile = (index: number) => {
    const newFiles = [...selectedFiles];
    newFiles.splice(index, 1);
    setSelectedFiles(newFiles);
    if (onFilesSelected) {
      onFilesSelected(newFiles.map(f => f.file));
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.heic,.heif,.avif,.bmp,.tiff,.tif,.webp,.jfif,.dib"
        onChange={handleFileChange}
        disabled={uploading}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,.heic,.heif,.avif,.bmp,.tiff,.tif,.webp,.jfif,.dib"
        capture="environment"
        onChange={handleFileChange}
        disabled={uploading}
        className="hidden"
      />

      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest text-center">
        Até {MAX_PHOTOS} fotos ({(listingId ? uploadedImages.length : selectedFiles.length)}/{MAX_PHOTOS})
      </p>

      {/* Galeria + Câmera buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || generatingPreviews || (listingId ? uploadedImages.length : selectedFiles.length) >= MAX_PHOTOS}
          className={cn(
            "flex flex-col items-center justify-center border-2 border-dashed rounded-[30px] p-8 hover:border-blue-500/50 transition-all cursor-pointer group",
            uploading ? "border-blue-500 bg-blue-50/10" : "border-zinc-200 bg-zinc-50/50"
          )}
        >
          <div className="flex flex-col items-center gap-3">
            {uploading || generatingPreviews ? (
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-white shadow-xl flex items-center justify-center text-zinc-400 group-hover:text-blue-500 transition-colors">
                <Upload className="w-7 h-7" />
              </div>
            )}
            <div className="text-center">
              <p className="text-sm font-black text-zinc-900 uppercase tracking-tight">
                {generatingPreviews ? 'Processando...' : uploading ? 'Enviando...' : 'Galeria'}
              </p>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
                Selecionar fotos do aparelho
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading || generatingPreviews || (listingId ? uploadedImages.length : selectedFiles.length) >= MAX_PHOTOS}
          className="flex flex-col items-center justify-center border-2 border-dashed rounded-[30px] p-8 hover:border-blue-500/50 transition-all cursor-pointer group border-zinc-200 bg-zinc-50/50"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-white shadow-xl flex items-center justify-center text-zinc-400 group-hover:text-blue-500 transition-colors">
              <Camera className="w-7 h-7" />
            </div>
            <div className="text-center">
              <p className="text-sm font-black text-zinc-900 uppercase tracking-tight">Câmera</p>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
                Tirar foto agora
              </p>
            </div>
          </div>
        </button>
      </div>

      {uploading && (
        <div className="space-y-3 px-2">
          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-400">
            <span>Progresso do Upload</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2 bg-blue-100" />
        </div>
      )}

      {/* Grid de Previews Locais */}
      {selectedFiles.length > 0 && !listingId && (
        <div className="space-y-4">
          <h5 className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
            <CheckCircle2 className="w-3 h-3 text-blue-500" /> Fotos Selecionadas ({selectedFiles.length})
          </h5>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {selectedFiles.map((item, idx) => (
              <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden bg-zinc-100 border-2 border-blue-100 shadow-md group animate-in zoom-in-50">
                <img
                  src={item.preview}
                  className="absolute inset-0 w-full h-full object-cover"
                  alt=""
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const placeholder = (e.target as HTMLElement).nextElementSibling as HTMLElement;
                    if (placeholder) placeholder.style.display = 'flex';
                  }}
                />
                {/* Placeholder (hidden by default, shown on img error) */}
                <div
                  className="absolute inset-0 flex-col items-center justify-center gap-2 p-3 bg-gradient-to-b from-blue-50 to-zinc-100"
                  style={{ display: 'none' }}
                >
                  <CheckCircle2 className="w-8 h-8 text-blue-500" />
                  <p className="text-[9px] font-bold text-zinc-500 text-center truncate max-w-full px-2">{item.file.name}</p>
                  <p className="text-[8px] text-zinc-400">Foto carregada</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeSelectedFile(idx)}
                  className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur-md rounded-xl text-zinc-400 hover:text-red-500 shadow-lg transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="absolute inset-x-0 bottom-0 bg-blue-600/90 py-2 px-3 backdrop-blur-sm">
                  <p className="text-[8px] font-black text-white uppercase tracking-widest text-center">Pronta para envio</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid de Imagens Já Uploadadas */}
      {uploadedImages.length > 0 && (
        <div className="space-y-4">
          <h5 className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
            <CheckCircle2 className="w-3 h-3 text-blue-500" /> Imagens Enviadas ({uploadedImages.length})
          </h5>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {uploadedImages.map((img) => (
              <div key={img.id} className="relative aspect-square rounded-2xl overflow-hidden bg-white border border-blue-50 shadow-sm group">
                <img src={img.path} className="absolute inset-0 w-full h-full object-cover" alt="vehicle" />
                <div className="absolute inset-x-0 bottom-0 bg-zinc-900/40 p-2 flex justify-between items-end backdrop-blur-[2px]">
                  <CheckCircle2 className="w-4 h-4 text-blue-400 drop-shadow-md" />
                  <span className="text-[8px] font-black text-white uppercase tracking-widest">Enviada</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 text-red-600 text-[10px] font-black uppercase tracking-widest p-4 bg-red-50 rounded-2xl border border-red-100">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}
    </div>
  );
};
