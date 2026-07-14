import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Upload, CheckCircle2, Loader2,
  RefreshCw, Image as ImageIcon, Trash2, ShieldCheck,
  CloudOff, Info, Camera
} from 'lucide-react';
import { getListingImageUrl, getMediaFallbackUrl } from '@/lib/real-estate/mediaUtils';
import { cn } from '@/lib/utils';
import { moderatedUpload } from '@/lib/moderation/moderatedUpload';

// ─── Managed Image Component ─────────────────────────────
// Handles the <img> lifecycle, fallback, and individual logs
interface ManagedImageProps {
  id: string;
  path: string;
  initialUrl: string;
  onDelete: (id: string, path: string) => Promise<void>;
  addLog: (tag: string, msg: string) => void;
}

const ManagedImage: React.FC<ManagedImageProps> = ({ id, path, initialUrl, onDelete, addLog }) => {
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [bucket, setBucket] = useState<'public' | 'original' | 'error'>('public');
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Sync currentUrl if initialUrl changes (e.g. on global refresh)
  useEffect(() => {
    setCurrentUrl(initialUrl);
    setBucket('public');
    setHasLoaded(false);
  }, [initialUrl]);

  const handleError = () => {
    if (bucket === 'public') {
      const fallback = getMediaFallbackUrl(currentUrl);
      if (fallback) {
        setBucket('original');
        setCurrentUrl(fallback);
        addLog("FALLBACK", `Imagem ${id.slice(0,5)} indisponível no Public. Tentando Original...`);
      } else {
        setBucket('error');
      }
    } else {
      setBucket('error');
      addLog("ERRO CRÍTICO", `Imagem ${id.slice(0,5)} falhou em ambos os buckets.`);
    }
  };

  const handleLoad = () => {
    setHasLoaded(true);
    if (bucket === 'public') {
      addLog("SYNC", `Mídia ${id.slice(0,5)} carregada do bucket PUBLIC.`);
    } else if (bucket === 'original') {
      addLog("SYNC", `Mídia ${id.slice(0,5)} carregada do bucket ORIGINAL (Fallback).`);
      // Lazy Sync: Tenta copiar para o bucket público em background
      attemptLazySync();
    }
  };

  const attemptLazySync = async () => {
    try {
      addLog("LAZY-SYNC", `Iniciando checagem de moderação para Public: ${id.slice(0,5)}...`);
      // Checar se a mídia foi aprovada antes de disponibilizar publicamente
      const { data: mediaRec } = await supabase
        .from('real_estate_media')
        .select('moderation_status')
        .eq('id', id)
        .maybeSingle();

      const status = mediaRec?.moderation_status;
      if (status !== 'approved' && status !== 'approved_clean' && status !== 'approved_masked' && status !== 'manual_approved') {
        addLog("LAZY-SYNC", `[BLOQUEADO] Mídia ${id.slice(0,5)} em análise (${status || 'pendente'}).`);
        return;
      }

      // 1. Baixa o arquivo do original
      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from('real-estate-original')
        .download(path);
      
      if (downloadError) throw downloadError;

      // 2. Sobe para o public
      const { error: uploadError } = await supabase.storage
        .from('real-estate-public')
        .upload(path, fileBlob, { upsert: true });

      if (uploadError) throw uploadError;

      addLog("LAZY-SYNC", `[SUCESSO] Mídia ${id.slice(0,5)} agora disponível no bucket Público.`);
    } catch (err: any) {
      addLog("LAZY-SYNC", `[FALHA] ${err.message}`);
      console.warn("Lazy Sync falhou:", err);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete(id, path);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={cn(
      "aspect-square rounded-[30px] overflow-hidden bg-zinc-100 border-4 relative group shadow-lg transition-all duration-300",
      bucket === 'public' ? "border-zinc-100" : bucket === 'original' ? "border-amber-100" : "border-red-100"
    )}>
      {bucket === 'error' ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-red-50">
          <CloudOff className="w-8 h-8 text-red-400 mb-2" />
          <p className="text-[10px] font-black text-red-500 uppercase leading-tight">Falha no Carregamento</p>
        </div>
      ) : (
        <img 
          src={currentUrl} 
          className={cn(
            "w-full h-full object-cover transition-opacity duration-500",
            hasLoaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {/* Overlay status indication */}
      {!hasLoaded && bucket !== 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-100">
           <Loader2 className="w-6 h-6 text-zinc-300 animate-spin" />
        </div>
      )}

      {/* Badge indicate bucket */}
      {hasLoaded && (
        <div className={cn(
          "absolute top-3 left-3 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest",
          bucket === 'public' ? "bg-green-500 text-white" : "bg-amber-500 text-white"
        )}>
          {bucket === 'public' ? <span className="flex items-center gap-1"><ShieldCheck className="w-2 h-2"/> Public</span> : 'Original'}
        </div>
      )}

      {/* Delete and Actions Overlay */}
      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-3">
         <Button 
           variant="destructive" 
           size="icon" 
           className="w-12 h-12 rounded-2xl shadow-xl hover:scale-110 transition-transform"
           onClick={handleDelete}
           disabled={isDeleting}
         >
           {isDeleting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Trash2 className="w-6 h-6" />}
         </Button>
         <p className="text-[10px] text-white/70 font-bold uppercase tracking-tighter">Excluir Foto</p>
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────
interface PropertyImageUploadProps {
  listingId?: string | null;
  onUploadComplete?: (mediaId: string, path: string) => void;
  onFilesSelected?: (files: File[]) => void;
  propertyType?: string;
}

// Status de cada imagem em processamento pela sentinela
type ScanState = { id: string; path: string; previewUrl?: string; scanning?: boolean; rejected?: boolean; rejectionMessage?: string; file?: File; };

export const PropertyImageUpload: React.FC<PropertyImageUploadProps> = ({
  listingId,
  onUploadComplete,
  onFilesSelected,
  propertyType
}) => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedImages, setUploadedImages] = useState<ScanState[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState<number>(Date.now());
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const [scanStatus, setScanStatus] = useState<string>('');
  const MAX_PHOTOS = 6;

  const addLog = (tag: string, msg: string) => {
    console.log(`[UPLOAD AUDIT][${tag}] ${msg}`);
    setLogs(prev => [`${new Date().toLocaleTimeString()} [${tag}] ${msg}`, ...prev.slice(0, 10)]);
  };

  const handleCardClick = () => {
    if (uploading || uploadedImages.length >= MAX_PHOTOS) return;
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleCameraClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (uploading || uploadedImages.length >= MAX_PHOTOS) return;
    if (cameraInputRef.current) cameraInputRef.current.click();
  };

  const fetchExistingImages = async (isManual = false) => {
    if (!listingId) return;
    try {
      if (isManual) {
        addLog("REFRESH", "Forçando recarga total...");
        setRefreshKey(Date.now());
      }
      
      const { data, error } = await supabase
        .from('real_estate_media' as any)
        .select('id, original_storage_path, moderation_status, public_masked_storage_path, moderation_reason')
        .eq('listing_id', listingId)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      if (data) {
        const timestamp = isManual ? Date.now() : refreshKey;
        const formatted: ScanState[] = (data as any[]).map(item => {
          const isRejected = item.moderation_status?.startsWith('rejected');
          const isApproved = item.moderation_status === 'approved_clean' || item.moderation_status === 'approved_masked' || item.moderation_status === 'approved';
          // A moderação aprova copiando o MESMO path pra public_masked_storage_path
          // (não gera um arquivo novo no bucket público) — só confia que existe um
          // arquivo de verdade lá se o caminho for DIFERENTE do original.
          const reallyHasMaskedFile = !!item.public_masked_storage_path && item.public_masked_storage_path !== item.original_storage_path;
          const publicUrl = isApproved
            ? getListingImageUrl(
                reallyHasMaskedFile ? item.public_masked_storage_path : item.original_storage_path,
                reallyHasMaskedFile ? 'public' : 'original',
                timestamp
              )
            : undefined;
          return {
            id:               item.id,
            path:             item.original_storage_path,
            previewUrl:       publicUrl || undefined,
            rejected:         isRejected,
            rejectionMessage: isRejected ? (item.moderation_reason ?? 'Imagem rejeitada pela moderação.') : undefined,
          };
        });
        setUploadedImages(formatted);
      }
    } catch (err: any) {
      addLog("ERRO", err.message);
    }
  };

  useEffect(() => {
    fetchExistingImages();
  }, [listingId]);

  const handleFileUpload = async (event: any, droppedFiles?: FileList) => {
    const rawFiles = droppedFiles || (event.target as HTMLInputElement).files;
    if (!rawFiles || rawFiles.length === 0) return;
    // Snapshot files before resetting the input so we don't lose them
    let files = Array.from(rawFiles);
    // Reset value so selecting the same file again re-triggers onChange
    if (event?.target && !droppedFiles) {
      try { (event.target as HTMLInputElement).value = ''; } catch {}
    }

    const remaining = MAX_PHOTOS - uploadedImages.length;
    if (remaining <= 0) {
      toast.error(`Limite de ${MAX_PHOTOS} fotos por anúncio atingido.`);
      return;
    }
    if (files.length > remaining) {
      toast.warning(`Só dá pra adicionar mais ${remaining} foto(s) (limite de ${MAX_PHOTOS}).`);
      files = files.slice(0, remaining);
    }

    if (!listingId) {
      // Modo Deferred
      const newFiles = Array.from(files).map(file => ({
        id: `pending-${Date.now()}-${Math.random()}`,
        path: '',
        previewUrl: URL.createObjectURL(file),
        file
      }));
      const updated = [...uploadedImages, ...newFiles];
      setUploadedImages(updated);
      if (onFilesSelected) {
        onFilesSelected(updated.filter(img => img.file).map(img => img.file!));
      }
      return;
    }

    // Modo Direto (com ID)
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }

    try {
      setUploading(true);
      const { processForUpload, formatFileSize } = await import('@/lib/imageCompressor');

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const sanitizedName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9.]/g, '_');
        const fileName = `${Date.now()}-${sanitizedName.replace(/\.[^/.]+$/, '')}.jpg`;
        const filePath = `${user.id}/${listingId}/${fileName}`;
        const tempId   = `scanning-${Date.now()}`;

        setScanStatus(`🔄 Convertendo e comprimindo ${i + 1} de ${files.length}...`);
        setUploadedImages(prev => [{ id: tempId, path: '', scanning: true }, ...prev]);

        // ── Conversão + Compressão Universal ──
        let uploadBlob: Blob;
        try {
          const processed = await processForUpload(file, {
            maxDimension: 1600,
            targetSizeBytes: 200 * 1024,
          });
          uploadBlob = processed.blob;
          addLog("COMPRESS", `${file.name}: ${formatFileSize(file.size)} → ${formatFileSize(uploadBlob.size)}`);
        } catch (convErr: any) {
          addLog("CONVERT-ERR", `${file.name}: ${convErr.message}`);
          toast.error(`Falha ao converter "${file.name}": ${convErr.message}`);
          setUploadedImages(prev => prev.filter(img => img.id !== tempId));
          continue;
        }

        // Envio obrigatório pela RIDV (nenhuma imagem vai para o bucket sem aprovação)
        addLog("RIDV", `Analisando imagem com IA: ${file.name}`);
        const modRes = await moderatedUpload(uploadBlob, {
          fileName: file.name,
          mime: 'image/jpeg',
          listingId,
          category: 'real_estate',
          targetBucket: 'real-estate-public',
        });

        if (modRes.status === 'blocked') {
          addLog("RIDV-BLOCKED", `${file.name}: ${modRes.reason}`);
          toast.error(`Imagem recusada pela IA: ${modRes.reason}`);
          setUploadedImages(prev => prev.filter(img => img.id !== tempId));
          continue;
        }

        const finalPath = modRes.storagePath || filePath;
        const finalStatus = modRes.status === 'approved' ? 'approved' : 'pending_ai_analysis';

        const { data: mediaData, error: dbErr } = await supabase
          .from('real_estate_media' as any)
          .insert({
            listing_id: listingId,
            owner_user_id: user.id,
            original_storage_path: finalPath,
            public_masked_storage_path: modRes.status === 'approved' ? finalPath : null,
            moderation_status: finalStatus,
          } as any)
          .select().single();
        if (dbErr) throw dbErr;

        const mediaId = (mediaData as any).id;
        setUploadedImages(prev => prev.filter(img => img.id !== tempId));

        if (modRes.status === 'approved') {
          const publicUrl = modRes.publicUrl || getListingImageUrl(finalPath, 'public', Date.now());
          setUploadedImages(prev => [{ id: mediaId, path: finalPath, previewUrl: publicUrl }, ...prev]);
          if (onUploadComplete) onUploadComplete(mediaId, finalPath);
          toast.success("Imagem aprovada pela IA RIDV.");
        } else {
          toast.info("Imagem retida na quarentena para revisão manual (RIDV).");
        }
        setProgress(Math.round(((i + 1) / files.length) * 100));
      }
    } catch (err: any) {
      toast.error(`Erro no upload: ${err.message}`);
    } finally {
      setUploading(false);
      setProgress(0);
      setScanStatus('');
    }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (uploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleFileUpload(e, e.dataTransfer.files);
  };

  const handleDeleteImage = async (mediaId: string, path: string) => {
    if (mediaId.startsWith('pending-')) {
       const newList = uploadedImages.filter(img => img.id !== mediaId);
       setUploadedImages(newList);
       if (onFilesSelected) onFilesSelected(newList.filter(img => img.file).map(img => img.file!));
       return;
    }

    const promise = async () => {
      await supabase.storage.from('real-estate-original').remove([path]);
      await supabase.storage.from('real-estate-public').remove([path]);
      await supabase.from('real_estate_media' as any).delete().eq('id', mediaId);
      setUploadedImages(prev => prev.filter(img => img.id !== mediaId));
    };

    toast.promise(promise(), {
      loading: 'Removendo mídia...',
      success: 'Foto excluída.',
      error: 'Falha ao excluir.'
    });
  };

  return (
    <div className="space-y-6 p-8 border-4 border-zinc-100 rounded-[40px] bg-white shadow-2xl">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-2xl font-black text-zinc-900 tracking-tighter flex items-center gap-2">
            <ImageIcon className="w-8 h-8 text-blue-600" />
            GALERIA DO IMÓVEL
          </h3>
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest pl-10">
            <ShieldCheck className="w-3 h-3 text-green-500 inline mr-1" /> Imagens auditadas por IA
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => fetchExistingImages(true)} className="rounded-2xl border h-10 px-4">
          <RefreshCw className="w-4 h-4 mr-2"/> Recarregar
        </Button>
      </div>

      <div 
        className={cn(
          "relative border-4 border-dashed rounded-[35px] p-12 transition-all cursor-pointer bg-zinc-50/50",
          isDragging ? "border-blue-500 bg-blue-50/50" : "border-zinc-100 hover:border-blue-500/50",
          uploading && "opacity-50"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleCardClick}
      >
        <input type="file" multiple accept="image/*,.heic,.heif,.avif,.bmp,.tiff,.tif,.webp,.jfif,.dib" ref={fileInputRef} onChange={handleFileUpload} disabled={uploading} className="hidden" />
        <input type="file" multiple accept="image/*,.heic,.heif,.avif,.bmp,.tiff,.tif,.webp,.jfif,.dib" capture="environment" ref={cameraInputRef} onChange={handleFileUpload} disabled={uploading} className="hidden" />
        {uploading ? (
          <div className="flex flex-col items-center gap-4 text-blue-600">
             <Loader2 className="w-16 h-16 animate-spin" />
             <p className="text-xl font-black uppercase text-center">{scanStatus || 'Enviando...'}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-zinc-400">
             <Upload className="w-12 h-12" />
             <h4 className="text-xl font-black text-zinc-900 uppercase">Selecione ou Arraste Fotos</h4>
             <p className="text-[10px] font-bold uppercase tracking-widest">PNG, JPG ou HEIC · até {MAX_PHOTOS} fotos ({uploadedImages.length}/{MAX_PHOTOS})</p>
             <Button
               type="button"
               variant="outline"
               size="sm"
               onClick={handleCameraClick}
               disabled={uploading}
               className="rounded-2xl border-2 mt-2"
             >
               <Camera className="w-4 h-4 mr-2" /> Tirar Foto Agora
             </Button>
          </div>
        )}
      </div>

      {(uploadedImages.length > 0 || propertyType === 'fazenda') && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-6 mt-6">
          {uploadedImages.map((img) => (
            <div key={img.id} className="relative aspect-square rounded-[30px] overflow-hidden bg-white border border-zinc-100 shadow-md group">
               {img.scanning ? (
                 <div className="w-full h-full flex flex-col items-center justify-center bg-blue-50 text-blue-500">
                    <Loader2 className="w-6 h-6 animate-spin" />
                 </div>
               ) : img.rejected ? (
                 <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 p-4 text-center">
                    <span className="text-xl mb-1">🚫</span>
                    <p className="text-[8px] font-black text-red-500 uppercase">{img.rejectionMessage}</p>
                 </div>
               ) : (
                 <>
                   <img src={img.previewUrl} className="w-full h-full object-cover" />
                   <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button variant="destructive" size="icon" onClick={() => handleDeleteImage(img.id, img.path)}>
                        <Trash2 className="w-5 h-5" />
                      </Button>
                   </div>
                 </>
               )}
            </div>
          ))}

          {propertyType === 'fazenda' && Array.from({ length: 5 }).map((_, idx) => (
            <button
              type="button"
              key={`fazenda-slot-${idx}`}
              onClick={handleCardClick}
              disabled={uploading}
              className="relative aspect-square rounded-[30px] overflow-hidden bg-amber-50/60 border-2 border-dashed border-amber-300 hover:border-amber-500 hover:bg-amber-100/60 transition-all flex flex-col items-center justify-center gap-2 text-amber-600 active:scale-95"
            >
              <Upload className="w-8 h-8" />
              <span className="text-[10px] font-black uppercase tracking-widest text-center px-2">
                Foto extra<br />fazenda
              </span>
              <span className="absolute top-2 right-2 bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
                +{idx + 1}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

