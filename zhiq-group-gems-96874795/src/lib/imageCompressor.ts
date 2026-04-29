/**
 * imageCompressor.ts — Universal Image Converter & Compressor Engine
 *
 * Motor unificado para converter e compactar imagens de QUALQUER formato
 * para JPEG/WebP otimizado, pronto para upload.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    FORMATOS SUPORTADOS                         │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  JPEG (.jpg, .jpeg, .jfif, .pjpeg, .pjp)                     │
 * │  PNG (.png, .apng)                                            │
 * │  WebP (.webp)                                                 │
 * │  AVIF (.avif)                                                 │
 * │  GIF (.gif)                                                   │
 * │  BMP (.bmp, .dib)                                             │
 * │  TIFF (.tiff, .tif)                                           │
 * │  SVG (.svg)                                                   │
 * │  ICO (.ico, .cur)                                             │
 * │  HEIC / HEIF (.heic, .heif) — iPhone/iPad photos             │
 * │  RAW disfarçado (Samsung, Android via WhatsApp)               │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Pipeline:
 * 1. Detecção de formato (MIME + extensão + magic bytes)
 * 2. Conversão HEIC/HEIF → JPEG via heic2any
 * 3. createImageBitmap (suporte nativo do browser)
 * 4. Fallback: HTMLImageElement + Canvas
 * 5. Fallback cego: heic2any para arquivos "disfarçados"
 * 6. Resize inteligente mantendo aspect ratio
 * 7. Compressão iterativa (qualidade adaptativa)
 * 8. Output: Blob JPEG/WebP otimizado
 */

// ─── Configurações ────────────────────────────────
const DEFAULT_TARGET_SIZE_BYTES = 200 * 1024; // 200 KB (melhor qualidade que 100KB)
const MAX_DIMENSION_UPLOAD     = 1600;        // px — para upload final
const MAX_DIMENSION_PREVIEW    = 600;         // px — para preview local
const MIN_QUALITY              = 0.25;
const INITIAL_QUALITY          = 0.88;
const QUALITY_STEP             = 0.05;

// ─── Types ────────────────────────────────────────

export interface CompressionOptions {
  /** Tamanho alvo em bytes (default: 200KB) */
  targetSizeBytes?: number;
  /** Dimensão máxima em px (default: 1600) */
  maxDimension?: number;
  /** Qualidade inicial 0-1 (default: 0.88) */
  initialQuality?: number;
  /** Formato de saída preferido (default: auto-detect webp/jpeg) */
  outputFormat?: "image/jpeg" | "image/webp";
  /** Modo preview (menor, mais rápido) */
  previewMode?: boolean;
}

export interface CompressionResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  mimeType: string;
  quality: number;
  reachedTarget: boolean;
  conversionApplied: string[];
}

// ─── Extensões aceitas ────────────────────────────

const VALID_IMAGE_EXTENSIONS = new Set([
  // Standards
  "jpg", "jpeg", "png", "webp", "gif", "bmp", "svg",
  // Apple / Mobile
  "heic", "heif",
  // Advanced
  "avif", "tiff", "tif",
  // Legacy / Alias
  "jfif", "pjpeg", "pjp", "apng",
  // Icons
  "ico", "cur",
  // Bitmap variants
  "dib",
  // RAW (tentativa — não garantido no browser)
  "raw", "cr2", "nef", "arw", "dng", "orf", "rw2",
]);

const HEIC_EXTENSIONS = new Set(["heic", "heif"]);
const HEIC_MIMES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

// ─── Engine Principal ─────────────────────────────

/**
 * Converte e comprime qualquer imagem para JPEG/WebP otimizado.
 * Aceita fotos de celular (HEIC), formatos legados, e imagens corrompidas.
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    targetSizeBytes = DEFAULT_TARGET_SIZE_BYTES,
    maxDimension = MAX_DIMENSION_UPLOAD,
    initialQuality = INITIAL_QUALITY,
    outputFormat,
    previewMode = false,
  } = options;

  const maxDim = previewMode ? MAX_DIMENSION_PREVIEW : maxDimension;
  const originalSize = file.size;
  const conversionApplied: string[] = [];

  // ── Stage 1: Detecção e conversão de formato ──
  let processFile: File | Blob = file;
  const ext = getExtension(file.name);
  const isHeic = HEIC_EXTENSIONS.has(ext) || HEIC_MIMES.has(file.type);

  if (isHeic) {
    processFile = await convertHeic(file);
    conversionApplied.push("HEIC→JPEG");
  }

  // ── Stage 2: Criar bitmap (multi-fallback) ──
  let bitmap: ImageBitmap | null = null;

  // Attempt 1: createImageBitmap nativo
  bitmap = await tryCreateBitmap(processFile);

  // Attempt 2: Se falhou, pode ser HEIC disfarçado (Samsung/Android via WhatsApp)
  if (!bitmap) {
    conversionApplied.push("blind-heic-fallback");
    try {
      processFile = await convertHeic(processFile instanceof File ? processFile : new File([processFile], file.name));
      bitmap = await tryCreateBitmap(processFile);
    } catch {
      // continue to next fallback
    }
  }

  // Attempt 3: HTMLImageElement + objectURL
  if (!bitmap) {
    conversionApplied.push("img-element-fallback");
    const imgEl = await loadImageElement(processFile);
    if (imgEl) {
      // Desenha no canvas direto
      return await compressFromImageElement(imgEl, {
        originalSize,
        targetSizeBytes,
        maxDim,
        initialQuality,
        outputFormat,
        conversionApplied,
        previewMode,
      });
    }
  }

  if (!bitmap) {
    throw new Error(
      `Formato de imagem não suportado: "${file.name}" (${file.type || "tipo desconhecido"}). Tente converter para JPEG ou PNG antes de enviar.`
    );
  }

  // ── Stage 3: Resize mantendo aspect ratio ──
  let w = bitmap.width;
  let h = bitmap.height;
  if (w > maxDim || h > maxDim) {
    const ratio = Math.min(maxDim / w, maxDim / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
    conversionApplied.push(`resize:${bitmap.width}x${bitmap.height}→${w}x${h}`);
  }

  // ── Stage 4: Renderizar no canvas ──
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  // ── Stage 5: Compressão iterativa ──
  const mimeType = outputFormat || (supportsWebP() ? "image/webp" : "image/jpeg");
  const result = await iterativeCompress(canvas, mimeType, initialQuality, targetSizeBytes, w, h);

  conversionApplied.push(`output:${mimeType.split("/")[1]}@q${result.quality.toFixed(2)}`);

  return {
    ...result,
    originalSize,
    compressionRatio: originalSize > 0 ? Math.round((1 - result.compressedSize / originalSize) * 100) : 0,
    conversionApplied,
  };
}

/**
 * Gera preview rápido para qualquer imagem.
 * Mais rápido e menor que compressImage — ideal para UI.
 */
export async function generatePreview(file: File): Promise<string> {
  try {
    const result = await compressImage(file, {
      previewMode: true,
      targetSizeBytes: 80 * 1024, // 80KB para previews
      maxDimension: MAX_DIMENSION_PREVIEW,
      initialQuality: 0.75,
    });
    return result.dataUrl;
  } catch (err) {
    console.warn("[imageCompressor] Preview generation failed:", err);
    // Último recurso: objectURL direto (pode não funcionar para HEIC no PC)
    try {
      return URL.createObjectURL(file);
    } catch {
      return "";
    }
  }
}

/**
 * Processa arquivo para upload — converte + comprime.
 * Retorna Blob JPEG/WebP otimizado pronto para storage.
 */
export async function processForUpload(
  file: File,
  options: CompressionOptions = {}
): Promise<{ blob: Blob; mimeType: string; extension: string }> {
  const result = await compressImage(file, {
    targetSizeBytes: 300 * 1024, // 300KB para uploads (boa qualidade)
    maxDimension: MAX_DIMENSION_UPLOAD,
    initialQuality: 0.90,
    ...options,
  });

  const extension = result.mimeType === "image/webp" ? "webp" : "jpg";

  console.log(
    `[imageCompressor] Processado: ${file.name} ` +
    `(${formatFileSize(result.originalSize)} → ${formatFileSize(result.compressedSize)}, ` +
    `-${result.compressionRatio}%) ` +
    `[${result.conversionApplied.join(" → ")}]`
  );

  return { blob: result.blob, mimeType: result.mimeType, extension };
}

// ─── Helpers Internos ─────────────────────────────

async function convertHeic(file: File | Blob): Promise<Blob> {
  try {
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    const result = Array.isArray(converted) ? converted[0] : converted;
    console.log(`[imageCompressor] HEIC→JPEG: ${file.size} → ${result.size} bytes`);
    return result;
  } catch (err) {
    console.error("[imageCompressor] HEIC conversion failed:", err);
    throw new Error("Não foi possível converter o arquivo HEIC. Verifique se o arquivo não está corrompido.");
  }
}

async function tryCreateBitmap(source: File | Blob): Promise<ImageBitmap | null> {
  try {
    if (typeof createImageBitmap !== "function") return null;
    return await createImageBitmap(source);
  } catch {
    return null;
  }
}

function loadImageElement(source: File | Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve(null);
    }, 10000);

    img.onload = () => {
      clearTimeout(timer);
      if (img.width === 0 || img.height === 0) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      // Não revocamos aqui — o caller precisa do img
      resolve(img);
    };

    img.onerror = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}

async function compressFromImageElement(
  img: HTMLImageElement,
  opts: {
    originalSize: number;
    targetSizeBytes: number;
    maxDim: number;
    initialQuality: number;
    outputFormat?: string;
    conversionApplied: string[];
    previewMode: boolean;
  }
): Promise<CompressionResult> {
  let w = img.naturalWidth;
  let h = img.naturalHeight;

  if (w > opts.maxDim || h > opts.maxDim) {
    const ratio = Math.min(opts.maxDim / w, opts.maxDim / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
    opts.conversionApplied.push(`resize:${img.naturalWidth}x${img.naturalHeight}→${w}x${h}`);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  const mimeType = (opts.outputFormat as string) || (supportsWebP() ? "image/webp" : "image/jpeg");
  const result = await iterativeCompress(canvas, mimeType, opts.initialQuality, opts.targetSizeBytes, w, h);

  opts.conversionApplied.push(`output:${mimeType.split("/")[1]}@q${result.quality.toFixed(2)}`);

  return {
    ...result,
    originalSize: opts.originalSize,
    compressionRatio: opts.originalSize > 0 ? Math.round((1 - result.compressedSize / opts.originalSize) * 100) : 0,
    conversionApplied: opts.conversionApplied,
  };
}

async function iterativeCompress(
  canvas: HTMLCanvasElement,
  mimeType: string,
  startQuality: number,
  targetSize: number,
  w: number,
  h: number,
): Promise<Omit<CompressionResult, "originalSize" | "compressionRatio" | "conversionApplied">> {
  let quality = startQuality;
  let blob: Blob | null = null;
  let reachedTarget = false;

  // Iteração: reduz qualidade até atingir alvo
  while (quality >= MIN_QUALITY) {
    blob = await canvasToBlob(canvas, mimeType, quality);
    if (blob.size <= targetSize) {
      reachedTarget = true;
      break;
    }
    quality -= QUALITY_STEP;
  }

  // Se ainda não atingiu, reduz dimensões
  if (blob && !reachedTarget && blob.size > targetSize) {
    const shrinkRatio = Math.sqrt(targetSize / blob.size);
    const sw = Math.max(Math.round(w * shrinkRatio), 100);
    const sh = Math.max(Math.round(h * shrinkRatio), 100);
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // Precisamos redesenhar — mas já perdemos a source
    // Usar o blob atual como source
    const tempBitmap = await createImageBitmap(blob);
    ctx.drawImage(tempBitmap, 0, 0, sw, sh);
    tempBitmap.close();
    blob = await canvasToBlob(canvas, mimeType, MIN_QUALITY);
    w = sw;
    h = sh;
    reachedTarget = blob.size <= targetSize;
  }

  if (!blob) {
    throw new Error("Falha na compressão da imagem.");
  }

  const dataUrl = await blobToDataUrl(blob);

  return {
    blob,
    dataUrl,
    width: w,
    height: h,
    compressedSize: blob.size,
    mimeType,
    quality: Math.max(quality, MIN_QUALITY),
    reachedTarget,
  };
}

// ─── Utilitários ──────────────────────────────────

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob falhou"));
      },
      type,
      quality
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function supportsWebP(): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

function getExtension(filename: string): string {
  return (filename.split(".").pop() || "").toLowerCase();
}

// ─── Validação ────────────────────────────────────

/** Valida se o arquivo é imagem aceita */
export function isValidImageFile(file: File): { valid: boolean; reason?: string } {
  if (!file || file.size === 0) {
    return { valid: false, reason: "Arquivo vazio" };
  }

  // Accept any image/* MIME
  if (file.type && file.type.startsWith("image/")) {
    return { valid: true };
  }

  // Fallback: extensão
  const ext = getExtension(file.name);
  if (VALID_IMAGE_EXTENSIONS.has(ext)) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: `Formato não suportado: "${file.type || ext || "desconhecido"}". Aceitos: JPEG, PNG, WebP, HEIC, BMP, TIFF, AVIF, GIF, SVG e outros.`,
  };
}

/** Formata bytes em KB/MB legível */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Sanitiza nome de arquivo para path seguro no storage.
 * Remove acentos, caracteres especiais, limita comprimento.
 */
export function sanitizeFileName(originalName: string): string {
  const baseName = originalName
    .replace(/\.[^/.]+$/, "")           // remove extensão
    .normalize("NFD")                    // decompõe acentos
    .replace(/[\u0300-\u036f]/g, "")    // remove diacríticos
    .replace(/[^a-zA-Z0-9_-]/g, "_")   // só alfanum, _, -
    .replace(/_+/g, "_")               // colapsa underscores
    .substring(0, 80);                   // limita comprimento
  return `${Date.now()}-${baseName}`;
}
