/**
 * AuctionImageUploader — Premium image upload component
 *
 * Reutilizável para Leilão e Arremate.
 * Integra com useCompressedImageUpload hook.
 *
 * Features:
 * - Drag & drop + click to select
 * - Instant preview
 * - Compression status (original → compressed)
 * - Upload progress visual
 * - Replace / remove
 * - Premium glassmorphism design
 */
import { useRef, useCallback, type DragEvent } from "react";
import {
  useCompressedImageUpload,
  type UploadStatus,
} from "@/hooks/useCompressedImageUpload";
import { formatFileSize } from "@/lib/imageCompressor";
import {
  ImagePlus, X, Loader2, CheckCircle, AlertTriangle,
  RefreshCw, Trash2, Zap, ArrowDown, FileImage
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Props ──────────────────────────────

interface AuctionImageUploaderProps {
  /** URL of existing image (edit mode) */
  existingUrl?: string | null;
  /** Called with preview data-url after compression is ready */
  onImageReady?: (previewUrl: string) => void;
  /** Called when image is cleared */
  onImageClear?: () => void;
  /** Stores the hook instance for external upload call */
  hookRef?: React.MutableRefObject<ReturnType<typeof useCompressedImageUpload> | null>;
}

// ─── Status indicators ──────────────────

function StatusBadge({ status, error }: { status: UploadStatus; error: string | null }) {
  const map: Record<UploadStatus, { icon: typeof Loader2; label: string; color: string }> = {
    idle: { icon: ImagePlus, label: "Selecionar", color: "text-gray-400" },
    selected: { icon: FileImage, label: "Selecionada", color: "text-blue-500" },
    compressing: { icon: Loader2, label: "Comprimindo...", color: "text-amber-500" },
    ready: { icon: CheckCircle, label: "Pronta", color: "text-emerald-500" },
    uploading: { icon: Loader2, label: "Enviando...", color: "text-blue-500" },
    uploaded: { icon: CheckCircle, label: "Enviada ✓", color: "text-emerald-500" },
    error: { icon: AlertTriangle, label: "Erro", color: "text-red-500" },
  };
  const s = map[status];
  const Icon = s.icon;
  const animate = status === "compressing" || status === "uploading";

  return (
    <div className={`flex items-center gap-1.5 ${s.color}`}>
      <Icon className={`h-3.5 w-3.5 ${animate ? "animate-spin" : ""}`} />
      <span className="text-xs font-semibold">{error && status === "error" ? error : s.label}</span>
    </div>
  );
}

// ─── Component ──────────────────────────

export function AuctionImageUploader({
  existingUrl,
  onImageReady,
  onImageClear,
  hookRef,
}: AuctionImageUploaderProps) {
  const hook = useCompressedImageUpload("marketing-materials");
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Expose hook to parent
  if (hookRef) hookRef.current = hook;

  const { status, previewUrl, originalFileName, originalSize, compressedSize, error } = hook;

  const currentPreview = previewUrl || existingUrl;
  const hasImage = !!currentPreview;

  // Handle file from input or drop
  const handleFile = useCallback(
    (file: File) => {
      hook.selectFile(file);
    },
    [hook]
  );

  // After compression is ready, notify parent
  if (status === "ready" && previewUrl && onImageReady) {
    // Use microtask to avoid calling during render
    Promise.resolve().then(() => onImageReady(previewUrl));
  }

  // Drag handlers
  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClear = () => {
    hook.clear();
    onImageClear?.();
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
      />

      {!hasImage ? (
        /* ─── Drop Zone ── */
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="w-full group relative overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 hover:border-orange-400 transition-all duration-300 bg-gradient-to-br from-gray-50/80 to-white"
        >
          <div className="flex flex-col items-center justify-center gap-3 py-10 px-4">
            {/* Animated icon */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-orange-500/10 scale-150 group-hover:scale-[2] transition-transform duration-500" />
              <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center group-hover:from-orange-200 group-hover:to-amber-200 transition-colors">
                <ImagePlus className="h-6 w-6 text-orange-500" />
              </div>
            </div>

            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-gray-700 group-hover:text-orange-600 transition-colors">
                Arraste ou clique para selecionar
              </p>
              <p className="text-[11px] text-gray-400">
                JPEG, PNG, WebP, GIF • Compressão automática para ≤ 100 KB
              </p>
            </div>
          </div>

          {/* Bottom glow on hover */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-400/0 via-orange-400/50 to-orange-400/0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      ) : (
        /* ─── Preview Card ── */
        <div className="relative rounded-2xl overflow-hidden border border-gray-100 shadow-lg bg-white">
          {/* Image */}
          <div className="relative aspect-[16/9] bg-gray-50">
            <img
              src={currentPreview!}
              alt="Preview"
              className="w-full h-full object-contain"
            />

            {/* Overlay controls */}
            <div className="absolute top-2 right-2 flex gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-8 w-8 bg-white/90 backdrop-blur-sm hover:bg-white shadow-md"
                onClick={() => inputRef.current?.click()}
                title="Trocar imagem"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-8 w-8 bg-white/90 backdrop-blur-sm hover:bg-red-50 shadow-md text-red-500"
                onClick={handleClear}
                title="Remover imagem"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Processing overlay */}
            {(status === "compressing" || status === "uploading") && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <Loader2 className="h-8 w-8 text-white animate-spin mx-auto" />
                  <p className="text-sm font-semibold text-white">
                    {status === "compressing" ? "Comprimindo..." : "Enviando..."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Info bar */}
          <div className="px-3 py-2.5 flex items-center justify-between bg-gray-50/80 border-t border-gray-100">
            <div className="flex-1 min-w-0">
              {originalFileName && (
                <p className="text-[11px] font-medium text-gray-600 truncate">{originalFileName}</p>
              )}
              {/* Compression stats */}
              {originalSize > 0 && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-gray-400">{formatFileSize(originalSize)}</span>
                  {compressedSize > 0 && (
                    <>
                      <ArrowDown className="h-3 w-3 text-emerald-500" />
                      <span className="text-[10px] font-bold text-emerald-600">
                        {formatFileSize(compressedSize)}
                      </span>
                      <span className="text-[10px] text-emerald-500 font-semibold">
                        ({Math.round((1 - compressedSize / originalSize) * 100)}% menor)
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            <StatusBadge status={status} error={error} />
          </div>
        </div>
      )}

      {/* Error message */}
      {status === "error" && error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100">
          <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Size warning (compressed but above target) */}
      {status === "ready" && compressedSize > 100 * 1024 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100">
          <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-600">
            Comprimido para {formatFileSize(compressedSize)} (acima do alvo de 100 KB, mas otimizado ao máximo)
          </p>
        </div>
      )}
    </div>
  );
}
