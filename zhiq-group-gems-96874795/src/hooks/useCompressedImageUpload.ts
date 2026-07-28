/**
 * useCompressedImageUpload — Auction Image Intake Orchestrator
 *
 * AGENTIC 1 — Auction Image Intake Orchestrator
 * AGENTIC 3 — Auction Storage Upload Coordinator
 * AGENTIC 4 — Listing Image Metadata Persister
 *
 * Fluxo completo:
 * 1. Recebe arquivo → valida
 * 2. Gera preview instantâneo
 * 3. Comprime para ≤100KB
 * 4. Upload para Supabase Storage
 * 5. Retorna URL pública + metadados
 * 6. Persiste metadados no banco
 *
 * Reutilizável para Leilão e Arremate.
 */
import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { compressImage, isValidImageFile, formatFileSize, type CompressionResult } from "@/lib/imageCompressor";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ──────────────────────────────

export type UploadStatus = "idle" | "selected" | "compressing" | "ready" | "uploading" | "uploaded" | "error";

export interface ImageUploadState {
  status: UploadStatus;
  previewUrl: string | null;
  originalFileName: string | null;
  originalSize: number;
  compressedSize: number;
  mimeType: string | null;
  publicUrl: string | null;
  storagePath: string | null;
  error: string | null;
  compressionResult: CompressionResult | null;
}

export interface ImageMetadata {
  publicUrl: string;
  storagePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

const INITIAL_STATE: ImageUploadState = {
  status: "idle",
  previewUrl: null,
  originalFileName: null,
  originalSize: 0,
  compressedSize: 0,
  mimeType: null,
  publicUrl: null,
  storagePath: null,
  error: null,
  compressionResult: null,
};

// ─── Hook ───────────────────────────────

export function useCompressedImageUpload(bucketName = "marketing-materials") {
  const { user } = useAuth();
  const [state, setState] = useState<ImageUploadState>(INITIAL_STATE);
  const fileRef = useRef<Blob | null>(null);

  // SKILL 1 — Validate Image File
  // SKILL 3 — Generate Local Preview
  // SKILL 2 — Compress Image To Target Size
  const selectFile = useCallback(async (file: File) => {
    // Validate
    const validation = isValidImageFile(file);
    if (!validation.valid) {
      setState({ ...INITIAL_STATE, status: "error", error: validation.reason || "Arquivo inválido" });
      return;
    }

    // Instant preview
    const instantPreview = URL.createObjectURL(file);
    setState({
      ...INITIAL_STATE,
      status: "selected",
      previewUrl: instantPreview,
      originalFileName: file.name,
      originalSize: file.size,
      mimeType: file.type,
    });

    // Compress (includes HEIC conversion if needed)
    const isHeic = file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif")
      || file.type === "image/heic" || file.type === "image/heif";
    setState((s) => ({ ...s, status: "compressing", error: isHeic ? "Convertendo HEIC para JPEG..." : null }));
    try {
      const result = await compressImage(file);
      fileRef.current = result.blob;

      setState((s) => ({
        ...s,
        status: "ready",
        previewUrl: result.dataUrl,
        compressedSize: result.compressedSize,
        mimeType: result.mimeType,
        compressionResult: result,
        error: result.reachedTarget
          ? null
          : `Comprimido para ${formatFileSize(result.compressedSize)} (alvo: 100 KB)`,
      }));
    } catch (err: unknown) {
      console.error("[useCompressedImageUpload] Compression failed:", err);
      setState((s) => ({ ...s, status: "error", error: err.message || "Erro ao comprimir imagem" }));
    }
  }, []);

  // SKILL 4 — Upload Image To Storage
  const upload = useCallback(
    async (pathPrefix: string): Promise<ImageMetadata | null> => {
      if (!fileRef.current || !user?.id) {
        setState((s) => ({ ...s, status: "error", error: "Sem imagem ou usuário" }));
        return null;
      }

      setState((s) => ({ ...s, status: "uploading" }));

      try {
        const ext = state.mimeType === "image/webp" ? "webp" : "jpg";
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const storagePath = `${pathPrefix}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(storagePath, fileRef.current, {
            contentType: state.mimeType || "image/jpeg",
            upsert: true,
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
        const publicUrl = urlData.publicUrl;

        const metadata: ImageMetadata = {
          publicUrl,
          storagePath,
          originalName: state.originalFileName || "unknown",
          mimeType: state.mimeType || "image/jpeg",
          sizeBytes: state.compressedSize,
        };

        setState((s) => ({
          ...s,
          status: "uploaded",
          publicUrl,
          storagePath,
          error: null,
        }));

        return metadata;
      } catch (err: unknown) {
        console.error("[useCompressedImageUpload] Upload failed:", err);
        setState((s) => ({ ...s, status: "error", error: err.message || "Erro no upload" }));
        return null;
      }
    },
    [user?.id, state.mimeType, state.originalFileName, state.compressedSize, bucketName]
  );

  // SKILL 7 — Remove Listing Image
  const clear = useCallback(() => {
    if (state.previewUrl && state.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(state.previewUrl);
    }
    fileRef.current = null;
    setState(INITIAL_STATE);
  }, [state.previewUrl]);

  // SKILL 6 — Replace Existing Listing Image
  const removeFromStorage = useCallback(
    async (storagePath: string) => {
      try {
        await supabase.storage.from(bucketName).remove([storagePath]);
      } catch (err) {
        console.warn("[useCompressedImageUpload] Remove failed:", err);
      }
    },
    [bucketName]
  );

  return {
    ...state,
    selectFile,
    upload,
    clear,
    removeFromStorage,
    formatFileSize,
  };
}
