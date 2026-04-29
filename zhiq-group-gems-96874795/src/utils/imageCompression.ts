/**
 * Utility for frontend image compression and resizing using Canvas.
 * Designed for the Real Estate module to respect Supabase Storage limits.
 */

export interface CompressImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxSizeMB?: number;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
  applyMask?: boolean;
}

const DEFAULT_OPTIONS: Required<CompressImageOptions> = {
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.78,
  maxSizeMB: 1.5,
  mimeType: 'image/jpeg',
  applyMask: false,
};

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

/**
 * Validates if the file type is supported.
 */
export const isSupportedType = (file: File): boolean => {
  return ALLOWED_TYPES.includes(file.type.toLowerCase());
};

/**
 * Compresses a single image file.
 */
export async function compressImageFile(
  file: File,
  options: CompressImageOptions = {}
): Promise<File> {
  const settings = { ...DEFAULT_OPTIONS, ...options };

  // 1. Validation
  if (!isSupportedType(file)) {
    throw new Error(`Formato "${file.type}" não suportado. Use JPG, PNG ou WebP.`);
  }

  // 2. Check if compression is even needed (size only check)
  // Note: Even if size is small, we might want to resize if dimensions are huge.
  if (file.size <= settings.maxSizeMB * 1024 * 1024 && !options.maxWidth && !options.maxHeight) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        // Calculate new dimensions
        let width = img.width;
        let height = img.height;

        if (width > settings.maxWidth || height > settings.maxHeight) {
          if (width > height) {
            height = Math.round((height * settings.maxWidth) / width);
            width = settings.maxWidth;
          } else {
            width = Math.round((width * settings.maxHeight) / height);
            height = settings.maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Não foi possível criar o contexto do Canvas.'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // 3. APPLY VISUAL MASK (Tarja) if requested or detected
        if (settings.applyMask) {
          const maskHeight = Math.round(height * 0.12); // 12% of height
          const maskY = Math.round(height * 0.7); // Place at lower third
          
          // Outer Band (Tarja)
          ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
          ctx.fillRect(0, maskY, width, maskHeight);
          
          // Inner Stroke for "Premium" look
          ctx.strokeStyle = 'rgba(255, 106, 0, 0.5)';
          ctx.lineWidth = 2;
          ctx.strokeRect(0, maskY, width, maskHeight);

          // Text overlay
          const fontSize = Math.max(12, Math.round(maskHeight * 0.4));
          ctx.font = `black ${fontSize}px Inter, sans-serif`;
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🛡️ VIAGG PROTECTED', width / 2, maskY + (maskHeight / 2));
          
          // Add a subtle subtle texture/noise to the mask if possible? 
          // For now keep it clean but strong.
        }

        // 4. Progressive quality reduction logic
        const attemptCompression = (currentQuality: number) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Erro ao gerar Blob da imagem.'));
                return;
              }

              // If still too big and quality is above bottom limit, reduce quality and try again
              if (blob.size > settings.maxSizeMB * 1024 * 1024 && currentQuality > 0.1) {
                attemptCompression(currentQuality - 0.1);
              } else {
                // Return final file
                const newFileName = file.name.replace(/\.[^/.]+$/, "") + (settings.mimeType === 'image/jpeg' ? '.jpg' : settings.mimeType === 'image/webp' ? '.webp' : '.png');
                const compressedFile = new File([blob], newFileName, {
                  type: settings.mimeType,
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              }
            },
            settings.mimeType,
            currentQuality
          );
        };

        attemptCompression(settings.quality);
      };
      img.onerror = () => reject(new Error('Erro ao carregar imagem para compressão.'));
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo original.'));
  });
}

/**
 * Compresses multiple image files.
 */
export async function compressMultipleImages(
  files: File[],
  options: CompressImageOptions = {}
): Promise<{ success: File[]; errors: { file: File; message: string }[] }> {
  const results = await Promise.allSettled(
    files.map((file) => compressImageFile(file, options))
  );

  const success: File[] = [];
  const errors: { file: File; message: string }[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      success.push(result.value);
    } else {
      errors.push({
        file: files[index],
        message: result.reason instanceof Error ? result.reason.message : 'Erro desconhecido na compressão',
      });
    }
  });

  return { success, errors };
}
