import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Upload, CheckCircle2, AlertCircle, Loader2, X, Image as ImageIcon, Trash2, RefreshCw, Store as StoreIcon, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';

interface ProductImageUploadProps {
  listingId?: string;
  onUploadComplete?: (mediaId: string, path: string) => void;
  onFilesSelected?: (files: File[]) => void;
  onImageSelect?: (dataUri: string | null) => void;
  onProductPick?: (product: { id: string; title: string; image: string | null; price?: number | null }) => void;
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

/**
 * Garante que advertiser_listings.cover_image_url sempre aponte para uma mídia
 * que realmente existe (URL pública canônica). Se a capa atual não corresponde a
 * nenhuma mídia (ex: foi excluída, ou era um arquivo quebrado), promove a primeira
 * mídia válida como nova capa. Evita capas órfãs e URLs assinadas (que expiram).
 */
async function syncListingCover(listingId: string): Promise<void> {
  const toPublicUrl = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    return supabase.storage.from('marketing-materials').getPublicUrl(raw).data.publicUrl;
  };

  const { data: media } = await supabase
    .from('advertiser_listing_media')
    .select('media_url, storage_path, created_at')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: true });

  const validUrls = (media || [])
    .map((m: any) => toPublicUrl(m.media_url || m.storage_path))
    .filter(Boolean) as string[];

  const { data: listing } = await supabase
    .from('advertiser_listings' as any)
    .select('cover_image_url')
    .eq('id', listingId)
    .maybeSingle();
  const currentCover = (listing as any)?.cover_image_url ?? null;

  // Só atualiza se a capa atual não corresponde a nenhuma mídia existente.
  if (!currentCover || !validUrls.includes(currentCover)) {
    await supabase
      .from('advertiser_listings' as any)
      .update({ cover_image_url: validUrls[0] ?? null })
      .eq('id', listingId);
  }
}

export const ProductImageUpload: React.FC<ProductImageUploadProps> = ({
  listingId,
  onUploadComplete,
  onFilesSelected,
  onImageSelect,
  onProductPick,
  maxImages = 6
}) => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedImages, setUploadedImages] = useState<{id: string, path: string, storage_path: string | null}[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<{file: File, preview: string}[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generatingPreviews, setGeneratingPreviews] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [storePickerOpen, setStorePickerOpen] = useState(false);

  // Loja + produtos do usuário (pra picker)
  const { data: storeData } = useQuery({
    queryKey: ['product-upload-store-picker', user?.id],
    enabled: !!user?.id && storePickerOpen,
    queryFn: async () => {
      const resolveStorage = async (raw: string | null): Promise<string | null> => {
        if (!raw) return null;
        if (/^https?:\/\//i.test(raw)) return raw;
        try {
          const { data: signed } = await supabase.storage
            .from('marketing-materials').createSignedUrl(raw, 60 * 60);
          if (signed?.signedUrl) return signed.signedUrl;
        } catch { /* ignore */ }
        return supabase.storage.from('marketing-materials').getPublicUrl(raw).data.publicUrl;
      };
      const { data: store } = await (supabase.from('merchant_stores' as any)
        .select('id, nome_loja, logo_url').eq('user_id', user!.id).maybeSingle()) as any;
      const storeId = (store as any)?.id;

      // Resolve advertiser_account_id do usuário
      const { data: adv } = await (supabase.from('advertiser_accounts' as any)
        .select('id').eq('user_id', user!.id).maybeSingle()) as any;
      const advAccountId = (adv as any)?.id;

      // Busca em advertiser_listings (advertiser_account_id) + join nas mídias
      const advReq = advAccountId
        ? (supabase.from('advertiser_listings' as any)
            .select('id, title, cover_image_url, price, advertiser_listing_media(media_url, storage_path)')
            .eq('advertiser_account_id', advAccountId)
            .order('created_at', { ascending: false })
            .limit(60)) as any
        : Promise.resolve({ data: [] });

      // Busca em merchant_marketing_products (merchant_store_id)
      const mktReq = storeId
        ? (supabase.from('merchant_marketing_products' as any)
            .select('id, title, image_url, price')
            .eq('merchant_store_id', storeId)
            .order('created_at', { ascending: false })
            .limit(60)) as any
        : Promise.resolve({ data: [] });

      // Busca em merchant_products (user_id, com colunas pt-BR)
      const mpReq = (supabase.from('merchant_products' as any)
        .select('id, nome, imagem_url, preco')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(60)) as any;

      // Busca em products (store_id, com colunas mistas — usa ambos os nomes)
      const prodsReq = storeId
        ? (supabase.from('products' as any)
            .select('id, nome, preco, imagem_url, name, price, image_url')
            .eq('store_id', storeId)
            .order('created_at', { ascending: false })
            .limit(60)) as any
        : Promise.resolve({ data: [] });

      const [{ data: advProds }, { data: mktProds }, { data: mpProds }, { data: prodsData }] = await Promise.all([advReq, mktReq, mpReq, prodsReq]);

      const all = [
        ...((advProds || []) as any[]).map(p => {
          const firstMedia = (p.advertiser_listing_media || [])[0];
          return {
            id: p.id,
            title: p.title,
            price: p.price,
            raw: p.cover_image_url || firstMedia?.media_url || firstMedia?.storage_path || null,
          };
        }),
        ...((mktProds || []) as any[]).map(p => ({
          id: p.id, title: p.title, price: p.price, raw: p.image_url,
        })),
        ...((mpProds || []) as any[]).map(p => ({
          id: p.id, title: p.nome, price: p.preco, raw: p.imagem_url,
        })),
        ...((prodsData || []) as any[]).map(p => ({
          id: p.id,
          title: p.nome || p.name || 'Produto',
          price: p.preco ?? p.price,
          raw: p.imagem_url || p.image_url,
        })),
      ];

      const enriched = await Promise.all(all.map(async (p) => ({
        ...p,
        image: await resolveStorage(p.raw),
      })));

      // Dedupe por id
      const seen = new Set<string>();
      const products = enriched.filter(p => seen.has(p.id) ? false : (seen.add(p.id), true));

      // Resolve logo da loja
      const rawLogo = (store as any)?.logo_url as string | null;
      const storeLogo = rawLogo ? await resolveStorage(rawLogo) : null;

      return {
        storeName: (store as any)?.nome_loja || 'Minha Loja',
        storeLogo,
        products,
      };
    },
  });

  // Query separada pra resolver o nome+logo da loja sempre (mesmo sem abrir o modal)
  const { data: storeInfo } = useQuery({
    queryKey: ['product-upload-store-info', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase.from('merchant_stores' as any)
        .select('nome_loja, logo_url').eq('user_id', user!.id).maybeSingle()) as any;
      const raw = (data as any)?.logo_url as string | null;
      let logo: string | null = null;
      if (raw) {
        if (/^https?:\/\//i.test(raw)) logo = raw;
        else {
          try {
            const { data: signed } = await supabase.storage
              .from('marketing-materials').createSignedUrl(raw, 60 * 60);
            logo = signed?.signedUrl || supabase.storage.from('marketing-materials').getPublicUrl(raw).data.publicUrl;
          } catch { /* ignore */ }
        }
      }
      return {
        name: (data as any)?.nome_loja || 'Minha Loja',
        logo,
      };
    },
  });
  const storeName = storeInfo?.name || 'Minha Loja';
  const storeLogo = storeInfo?.logo || null;

  const handlePickProduct = (product: { id: string; title: string; image: string | null; price?: number | null }) => {
    if (!product.image) {
      toast.error('Esse produto não tem imagem cadastrada.');
      return;
    }
    if (onImageSelect) onImageSelect(product.image);
    if (onProductPick) onProductPick(product);
    toast.success(`"${product.title}" selecionado.`);
    setStorePickerOpen(false);
  };

   // Carregar imagens existentes se houver listingId
   useEffect(() => {
     if (!listingId) return;

     // Extrai o path do storage a partir de uma URL pública (se aplicável)
     const extractStoragePath = (url: string): string | null => {
       const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/marketing-materials\/([^?]+)/);
       return m?.[1] ?? null;
     };

     const resolveUrl = async (raw: string | null | undefined): Promise<string | null> => {
       if (!raw) return null;
       const path = /^https?:\/\//i.test(raw) ? (extractStoragePath(raw) || null) : raw;
       // Tenta signed URL primeiro (funciona mesmo se o bucket não for público para esse path)
       if (path) {
         try {
           const { data: signed } = await supabase.storage
             .from('marketing-materials')
             .createSignedUrl(path, 60 * 60);
           if (signed?.signedUrl) return signed.signedUrl;
         } catch { /* fall back */ }
       }
       // Fallback: URL pública direta
       if (/^https?:\/\//i.test(raw)) return raw;
       try {
         return supabase.storage.from('marketing-materials').getPublicUrl(raw).data.publicUrl;
       } catch {
         return null;
       }
     };

     const fetchImages = async () => {
       console.log(`[ProductImageUpload] === Buscando imagens para listing ${listingId} ===`);
       const { data, error } = await supabase
         .from('advertiser_listing_media')
         .select('id, media_url, storage_path')
         .eq('listing_id', listingId);

       console.log(`[ProductImageUpload] advertiser_listing_media retornou ${data?.length ?? 0} registros`, { data, error });

       const collected: { id: string; path: string; storage_path: string | null }[] = [];

       if (!error && data) {
         for (const img of data) {
           const candidate = img.media_url || img.storage_path || '';
           console.log(`[ProductImageUpload] Avaliando registro ${img.id}: media_url="${img.media_url}", storage_path="${img.storage_path}"`);
           if (!candidate) { console.warn(`[ProductImageUpload] Pulando: ambos campos vazios`); continue; }
           const isUrl = /^https?:\/\//i.test(candidate);
           if (!isUrl && (!candidate.includes('/') || candidate.split('/').length < 2)) {
             console.warn(`[ProductImageUpload] Ignorando path inválido: ${candidate}`);
             continue;
           }
           const resolved = (await resolveUrl(candidate)) || (await resolveUrl(img.storage_path));
           if (!resolved) { console.warn(`[ProductImageUpload] Não foi possível resolver URL`); continue; }
           console.log(`[ProductImageUpload] ✓ Resolvido: ${resolved}`);
           collected.push({ id: img.id, path: resolved, storage_path: img.storage_path ?? null });
         }
       }

       // Fallback: nenhuma mídia → tenta cover_image_url da listing
       if (collected.length === 0) {
         console.log(`[ProductImageUpload] Nenhuma mídia encontrada. Tentando cover_image_url...`);
         const { data: listing } = await supabase
           .from('advertiser_listings' as any)
           .select('cover_image_url')
           .eq('id', listingId)
           .maybeSingle();
         const cover = (listing as any)?.cover_image_url;
         console.log(`[ProductImageUpload] cover_image_url da listing: "${cover}"`);
         const resolvedCover = await resolveUrl(cover);
         if (resolvedCover) {
           console.log(`[ProductImageUpload] ✓ Capa resolvida: ${resolvedCover}`);
           collected.push({ id: `cover-${listingId}`, path: resolvedCover, storage_path: null });
         }
       }

       console.log(`[ProductImageUpload] === FINAL: ${collected.length} imagem(ns) ===`, collected);
       setUploadedImages(collected);
     };
     fetchImages();
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

        const newImage = { id: mediaData.id, path: publicUrl, storage_path: filePath };
        // Garante que a capa aponte para uma mídia válida (corrige capas quebradas/órfãs)
        await syncListingCover(listingId);
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

  const deleteUploadedImage = async (img: {id: string, path: string, storage_path: string | null}) => {
    if (!window.confirm('Excluir esta foto definitivamente?')) return;
    setDeletingId(img.id);
    try {
      if (img.storage_path) {
        const { error: storageErr } = await supabase.storage
          .from('marketing-materials')
          .remove([img.storage_path]);
        if (storageErr) console.warn('Falha ao remover do storage:', storageErr);
      }

      // Caso especial: id sintético "cover-<listingId>" vindo do fallback de cover_image_url
      if (img.id.startsWith('cover-') && listingId) {
        await supabase
          .from('advertiser_listings' as any)
          .update({ cover_image_url: null })
          .eq('id', listingId);
        setUploadedImages(prev => prev.filter(u => u.id !== img.id));
        toast.success('Capa removida.');
        return;
      }

      const { error: dbErr } = await supabase
        .from('advertiser_listing_media')
        .delete()
        .eq('id', img.id);
      if (dbErr) throw dbErr;

      // Recalcula a capa de forma robusta: se a excluída era a capa, promove a próxima mídia válida.
      if (listingId) {
        await syncListingCover(listingId);
      }

      setUploadedImages(prev => prev.filter(u => u.id !== img.id));
      toast.success('Foto excluída.');
    } catch (err: any) {
      console.error('delete error:', err);
      toast.error(`Erro ao excluir: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleReplaceClick = (imgId: string) => {
    setReplacingId(imgId);
    replaceInputRef.current?.click();
  };

  const handleReplaceChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const targetId = replacingId;
    event.target.value = '';
    setReplacingId(null);
    if (!file || !targetId) return;
    const target = uploadedImages.find(u => u.id === targetId);
    if (!target) return;
    await deleteUploadedImage(target);
    await uploadFiles([file]);
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
              <p className="text-sm font-black text-white uppercase tracking-tight">
                {generatingPreviews ? 'Processando...' : uploading ? 'Enviando...' : 'Galeria'}
              </p>
              <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest mt-1">
                Selecionar fotos do aparelho
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStorePickerOpen(true)}
          disabled={uploading || generatingPreviews}
          className="flex flex-col items-center justify-center border-2 border-dashed rounded-[30px] p-8 hover:border-blue-500/50 transition-all cursor-pointer group border-zinc-200 bg-zinc-50/50"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-white shadow-xl flex items-center justify-center text-zinc-400 group-hover:text-blue-500 transition-colors overflow-hidden">
              {storeLogo ? (
                <img
                  src={storeLogo}
                  alt={storeName}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <StoreIcon className="w-7 h-7" />
              )}
            </div>
            <div className="text-center">
              <p className="text-sm font-black text-white uppercase tracking-tight line-clamp-1">{storeName}</p>
              <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest mt-1">
                Buscar produtos de sua loja
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Modal: produtos cadastrados da loja */}
      <Dialog open={storePickerOpen} onOpenChange={setStorePickerOpen}>
        <DialogContent className="max-w-md max-h-[75vh] overflow-hidden flex flex-col p-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-white">
              <div className="w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center overflow-hidden shrink-0">
                {(storeData?.storeLogo || storeLogo) ? (
                  <img
                    src={storeData?.storeLogo || storeLogo!}
                    alt={storeData?.storeName || storeName}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <StoreIcon className="w-5 h-5 text-blue-500" />
                )}
              </div>
              <span className="truncate text-white">{storeData?.storeName || storeName}</span>
              <span className="text-xs font-bold text-zinc-800 bg-white px-2 py-0.5 rounded-full ml-2 shrink-0">
                {storeData?.products?.length ?? 0} produtos
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto pr-2 -mr-2">
            {!storeData ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            ) : storeData.products.length === 0 ? (
              <div className="py-16 text-center text-zinc-500">
                <Package className="w-12 h-12 mx-auto mb-3 text-zinc-300" />
                <p className="text-sm font-bold">Nenhum produto cadastrado ainda.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-1">
                {storeData.products.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePickProduct({ id: p.id, title: p.title, image: p.image, price: p.price })}
                    className="group border-2 border-zinc-200 hover:border-blue-500 rounded-xl overflow-hidden bg-white transition-all text-left"
                  >
                    <div className="aspect-square bg-zinc-50 flex items-center justify-center overflow-hidden">
                      {p.image ? (
                        <img src={p.image} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <Package className="w-10 h-10 text-zinc-300" />
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-[11px] font-bold text-zinc-800 line-clamp-2 leading-tight">{p.title}</p>
                      {p.price && <p className="text-[10px] text-zinc-500 mt-0.5">R$ {p.price}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Input oculto para substituir foto */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*,.heic,.heif,.avif,.bmp,.tiff,.tif,.webp,.jfif,.dib"
        onChange={handleReplaceChange}
        className="hidden"
      />

      {/* Grid de Imagens Já Uploadadas */}
      {uploadedImages.length > 0 && (
        <div className="space-y-4">
          <h5 className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Imagens na Galeria ({uploadedImages.length})
          </h5>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
           {uploadedImages.map((img) => {
             const isBusy = deletingId === img.id || replacingId === img.id;
             return (
               <div key={img.id} className="relative aspect-square rounded-2xl overflow-hidden bg-white border border-emerald-50 shadow-sm group">
                 <img
                   src={img.path}
                   className="absolute inset-0 w-full h-full object-cover"
                   alt="product"
                   onError={(e) => {
                     console.warn(`[ProductImageUpload] Arquivo no storage não encontrado, escondendo preview:`, img.path);
                     const wrapper = (e.currentTarget.parentElement as HTMLElement);
                     if (wrapper) {
                       wrapper.classList.add('opacity-40');
                       const overlay = document.createElement('div');
                       overlay.className = 'absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center bg-red-50 text-red-600 text-[10px] font-bold text-center p-2';
                       overlay.textContent = 'Arquivo perdido — exclua e suba outra';
                       wrapper.appendChild(overlay);
                     }
                     e.currentTarget.style.display = 'none';
                   }}
                 />

                 {/* Botões de ação */}
                 <div className="absolute top-2 right-2 z-20 flex gap-1.5">
                   <button
                     type="button"
                     onClick={() => handleReplaceClick(img.id)}
                     disabled={isBusy || uploading}
                     title="Trocar foto"
                     className="p-1.5 bg-white/95 backdrop-blur-md rounded-xl text-zinc-600 hover:text-blue-500 shadow-lg transition-all disabled:opacity-40"
                   >
                     <RefreshCw className={cn("w-4 h-4", replacingId === img.id && "animate-spin")} />
                   </button>
                   <button
                     type="button"
                     onClick={() => deleteUploadedImage(img)}
                     disabled={isBusy || uploading}
                     title="Excluir foto"
                     className="p-1.5 bg-white/95 backdrop-blur-md rounded-xl text-zinc-600 hover:text-red-500 shadow-lg transition-all disabled:opacity-40"
                   >
                     {deletingId === img.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                   </button>
                 </div>

                 <div className="absolute inset-x-0 bottom-0 bg-zinc-900/40 p-2 flex justify-between items-end backdrop-blur-[2px]">
                   <CheckCircle2 className="w-4 h-4 text-emerald-400 drop-shadow-md" />
                   <span className="text-[8px] font-black text-white uppercase tracking-widest">Enviada</span>
                 </div>
               </div>
             );
           })}
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
