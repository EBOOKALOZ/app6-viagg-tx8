import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Upload, CheckCircle2, AlertCircle, Loader2, X, Image as ImageIcon, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProductImageUploadProps {
  listingId?: string;
  onUploadComplete?: (mediaId: string, path: string) => void;
  onFilesSelected?: (files: File[]) => void;
  onImageSelect?: (dataUri: string | null) => void;
  maxImages?: number;
}

import heic2any from 'heic2any';

/**
 * Gera preview seguro para qualquer imagem.
 * Ordem de tentativa:
 * 1. Conversão HEIC via heic2any
 * 2. createImageBitmap + Canvas (melhor compatibilidade com formatos nativos)
 * 3. HTMLImageElement + Canvas (fallback clássico)
 * 4. Retorna '' — o UI mostra placeholder bonito ao invés de img quebrada
 */
async function generatePreview(file: File): Promise<string> {
  let processFile: File | Blob = file;

  // Interceptação HEIC/HEIF
  const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';
  if (isHeic) {
     try {
       const convertedBlob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.88 });
       processFile = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
     } catch (e) {
       console.error("Preview HEIC falhou:", e);
     }
  }

  let bitmap: ImageBitmap | null = null;
  // Attempt 1: createImageBitmap (suporta mais formatos no OS)
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(processFile);
    }
  } catch (err) {
    // Se falhar, pode ser um jpeg falso (HEIC de Android/Samsung/Apple via WhatsApp Web)
    console.warn("createImageBitmap falhou. Possível HEIC disfarçado ou corrompido. Acionando heic2any...", err);
    try {
       toast?.info("Formato camuflado detectado. Convertendo..."); // Opcional se toast não importar aqui
       const convertedBlob = await heic2any({ blob: processFile, toType: "image/jpeg", quality: 0.88 });
       processFile = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
       bitmap = await createImageBitmap(processFile);
    } catch (fallbackErr) {
       console.error("Falha dupla na conversão do Preview", fallbackErr);
    }
  }

  if (bitmap) {
      const maxSize = 600;
      let w = bitmap.width;
      let h = bitmap.height;
      if (w > maxSize || h > maxSize) {
        const ratio = Math.min(maxSize / w, maxSize / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, w, h);
        bitmap.close();
        return canvas.toDataURL('image/jpeg', 0.8);
      }
      bitmap.close();
  }

  // Attempt 2: objectURL + HTMLImageElement
  try {
    const url = URL.createObjectURL(processFile);
    const result = await new Promise<string>((resolve) => {
      const el = document.createElement('img');
      el.onload = () => {
        const maxSize = 600;
        let w = el.naturalWidth;
        let h = el.naturalHeight;
        if (w > maxSize || h > maxSize) {
          const ratio = Math.min(maxSize / w, maxSize / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(el, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } else {
          resolve(url); // keep objectURL as last resort
        }
      };
      el.onerror = () => {
        URL.revokeObjectURL(url);
        resolve('');
      };
      el.src = url;
    });
    if (result) return result;
  } catch {
    // ignore
  }

  // Formato não suportado pelo browser (ex: HEIC no Chrome Windows)
  return '';
}


export const ProductImageUpload: React.FC<ProductImageUploadProps> = ({
  listingId,
  onUploadComplete,
  onFilesSelected,
  onImageSelect,
  maxImages = 6
}) => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedImages, setUploadedImages] = useState<{id: string, path: string}[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<{file: File, preview: string}[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generatingPreviews, setGeneratingPreviews] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

   // Carregar imagens existentes se houver listingId
   useEffect(() => {
     if (listingId) {
       const fetchImages = async () => {
         const { data, error } = await supabase
           .from('advertiser_listing_media')
           .select('id, media_url, storage_path')
           .eq('listing_id', listingId);

         if (!error && data) {
           // Filtrar paths suspeitos (ex: "image.png", "test.jpg")
           const validImages = data.filter(img => {
             const path = img.storage_path || img.media_url || '';
             // Ignora nomes simples sem barra (não estão no storage structure)
             if (!path.includes('/') || path.split('/').length < 2) {
               console.warn(`[ProductImageUpload] Ignorando path inválido: ${path}`);
               return false;
             }
             return true;
           });
           setUploadedImages(validImages.map(img => ({ id: img.id, path: img.media_url })));
         }
       };
       fetchImages();
     }
   }, [listingId]);

  const processFiles = async (files: FileList | File[]) => {
    let fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const currentTotal = uploadedImages.length + selectedFiles.length;
    if (maxImages && currentTotal >= maxImages) {
      toast.error(`Você já atingiu o limite máximo de ${maxImages} imagens.`);
      return;
    }
    if (maxImages && currentTotal + fileArray.length > maxImages) {
      const allowed = maxImages - currentTotal;
      toast.warning(`Você só pode enviar mais ${allowed} imagem(ns). As excedentes foram descartadas.`);
      fileArray = fileArray.slice(0, allowed);
    }

    if (listingId) {
      await uploadFiles(fileArray);
    } else {
      // Gera previews via Canvas para corrigir orientação EXIF de fotos de celular
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
          // Notificar preview da primeira imagem como data URI
          if (onImageSelect && updated.length > 0 && updated[0].preview) {
            onImageSelect(updated[0].preview);
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

    // Evita erro no console se arquivo inválido
    Array.from(files).forEach((file, index) => {
      console.log(`[ProductImageUpload] Arquivo SELECIONADO pelo Celular/PC [${index + 1}/${files.length}]:`);
      console.log(`- Nome: ${file.name}`);
      console.log(`- Extensão Aparente: ${file.name.split('.').pop()}`);
      console.log(`- Tipo MIME (fornecido pelo OS): ${file.type || 'DESCONHECIDO_VAI_QUEBRAR'}`);
      console.log(`- Tamanho B: ${file.size} Bytes`);
    });

    await processFiles(files);
    event.target.value = '';
  };

  const uploadFiles = async (fileArray: File[]) => {
    try {
      setUploading(true);
      setError(null);
      if (!user) throw new Error("Usuário não autenticado");
      if (!listingId) throw new Error("ID do anúncio é obrigatório para upload imediato");

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const timestamp = new Date().getTime();
        // Sanitiza nome: remove acentos, caracteres especiais, pontos extras
        const baseName = file.name
          .replace(/\.[^/.]+$/, '')          // remove extensão
          .normalize('NFD')                   // decompõe acentos (ã → a + ~)
          .replace(/[\u0300-\u036f]/g, '')    // remove diacríticos
          .replace(/[^a-zA-Z0-9_-]/g, '_')   // só alfanum, _, -
          .replace(/_+/g, '_')               // colapsa underscores
          .substring(0, 80);                  // limita comprimento
        // Sempre .jpg após conversão via canvas
        const fileName = `${timestamp}-${baseName}.jpg`;
        const filePath = `${user.id}/products/${listingId}/${fileName}`;

        // Converte imagem para JPEG blob via canvas (corrige EXIF de celular)
        let uploadBlob: Blob = file;
        let processFile: File | Blob = file;

        const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';
        if (isHeic) {
           try {
             const convertedBlob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.88 });
             processFile = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
             uploadBlob = processFile;
           } catch(e) { console.error("Falha HEIC em uploadFiles", e); }
        }

        let bitmap: ImageBitmap | null = null;
        try {
          bitmap = await createImageBitmap(processFile);
        } catch (err) {
          console.warn('Canvas nativo principal falhou. Acionando heic2any como blind-fallback...', err);
          try {
             const convertedBlob = await heic2any({ blob: processFile, toType: "image/jpeg", quality: 0.88 });
             processFile = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
             uploadBlob = processFile;
             bitmap = await createImageBitmap(processFile);
          } catch(e) {
             console.error("Blind fallback falhou", e);
          }
        }

        if (bitmap) {
          try {
            const MAX = 1600;
            let w = bitmap.width;
            let h = bitmap.height;
            if (w > MAX || h > MAX) {
              const ratio = Math.min(MAX / w, MAX / h);
              w = Math.round(w * ratio);
              h = Math.round(h * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(bitmap, 0, 0, w, h);
              const blob = await new Promise<Blob>((resolve) =>
                canvas.toBlob((b) => resolve(b || processFile), 'image/jpeg', 0.88)
              );
              uploadBlob = blob;
            }
            bitmap.close();
          } catch(e) {
            console.error("Falha na renderização do canvas após sucesso de bitmap", e);
          }
        }

        const { error: uploadError } = await supabase.storage
          .from('marketing-materials')
          .upload(filePath, uploadBlob, {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('marketing-materials')
          .getPublicUrl(filePath);

        const { data: mediaData, error: mediaError } = await supabase
          .from('advertiser_listing_media')
          .insert({
            listing_id: listingId,
            media_url: publicUrl,
            storage_path: filePath,
            moderation_status: 'approved'  // TEMPORÁRIO: auto-approve para testes
          })
          .select()
          .single();

        if (mediaError) throw mediaError;

        const newImage = { id: mediaData.id, path: publicUrl };
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
    if (onImageSelect) {
      onImageSelect(newFiles.length > 0 ? newFiles[0].preview : null);
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

      {/* Galeria + Câmera buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || generatingPreviews}
          className={cn(
            "flex flex-col items-center justify-center border-2 border-dashed rounded-[30px] p-8 hover:border-emerald-500/50 transition-all cursor-pointer group",
            uploading ? "border-emerald-500 bg-emerald-50/10" : "border-zinc-200 bg-zinc-50/50"
          )}
        >
          <div className="flex flex-col items-center gap-3">
            {uploading || generatingPreviews ? (
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-white shadow-xl flex items-center justify-center text-zinc-400 group-hover:text-emerald-500 transition-colors">
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
          disabled={uploading || generatingPreviews}
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
          <Progress value={progress} className="h-2 bg-emerald-100" />
        </div>
      )}

      {/* Grid de Previews Locais */}
      {selectedFiles.length > 0 && !listingId && (
        <div className="space-y-4">
          <h5 className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
            <ImageIcon className="w-3 h-3" /> Fotos Selecionadas ({selectedFiles.length})
          </h5>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {selectedFiles.map((item, idx) => (
              <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden bg-zinc-100 border-2 border-emerald-100 shadow-md group animate-in zoom-in-50">
                {/* Preview image com fallback no onError */}
                <img
                  src={item.preview}
                  className="absolute inset-0 w-full h-full object-cover"
                  alt=""
                  onError={(e) => {
                    // HEIC ou formato não suportado — esconde img e mostra placeholder
                    (e.target as HTMLImageElement).style.display = 'none';
                    const placeholder = (e.target as HTMLElement).nextElementSibling as HTMLElement;
                    if (placeholder) placeholder.style.display = 'flex';
                  }}
                />
                {/* Placeholder (hidden by default, shown on img error) */}
                <div
                  className="absolute inset-0 flex-col items-center justify-center gap-2 p-3 bg-gradient-to-b from-emerald-50 to-zinc-100"
                  style={{ display: 'none' }}
                >
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
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
                <div className="absolute inset-x-0 bottom-0 bg-emerald-600/90 py-2 px-3 backdrop-blur-sm">
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
            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Imagens na Galeria ({uploadedImages.length})
          </h5>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
           {uploadedImages.map((img) => (
               <div key={img.id} className="relative aspect-square rounded-2xl overflow-hidden bg-white border border-emerald-50 shadow-sm group">
                 <img src={img.path} className="absolute inset-0 w-full h-full object-cover" alt="product" />
                 <div className="absolute inset-x-0 bottom-0 bg-zinc-900/40 p-2 flex justify-between items-end backdrop-blur-[2px]">
                   <CheckCircle2 className="w-4 h-4 text-emerald-400 drop-shadow-md" />
                   <span className="text-[8px] font-black text-white uppercase tracking-widest">Enviada</span>
                 </div>
               </div>
             ))}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 text-red-600 text-[10px] font-black uppercase p-4 bg-red-50 rounded-2xl border border-red-100">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}
    </div>
  );
};
