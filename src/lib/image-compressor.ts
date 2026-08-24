/**
 * @module image-compressor
 * @description Client-side image resizing and compression utility.
 * Resizes large smartphone/camera photos (e.g. 5~15MB) to web-optimized dimensions (max 1920px)
 * and compresses to ~200KB–500KB JPEG to strictly avoid Vercel 4.5MB payload limit (HTTP 413).
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

/**
 * Compresses a single image file using HTML5 Canvas.
 * Falls back to original file if compression fails or file is not an image.
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.82,
  } = options;

  // Non-image files or SVG/GIF: return original
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }

  // Already tiny file (< 200KB): return original
  if (file.size < 200 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;

          // If image is already smaller than max bounds and file is relatively small (< 800KB), keep it
          if (width <= maxWidth && height <= maxHeight && file.size < 800 * 1024) {
            resolve(file);
            return;
          }

          // Calculate new dimensions preserving aspect ratio
          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              }
            } else {
              if (height > maxHeight) {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
              }
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(file);
            return;
          }

          // Enable high quality rendering
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(file);
                return;
              }

              // Create a new File from blob with .jpg extension
              const newFileName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
              const compressedFile = new File([blob], newFileName, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });

              console.log(
                `[ImageCompressor] Compressed "${file.name}": ${(file.size / 1024).toFixed(0)}KB → ${(compressedFile.size / 1024).toFixed(0)}KB (${width}x${height})`
              );

              resolve(compressedFile);
            },
            'image/jpeg',
            quality
          );
        } catch (err) {
          console.warn('[ImageCompressor] Canvas compression error, using original:', err);
          resolve(file);
        }
      };

      img.onerror = () => {
        console.warn('[ImageCompressor] Image load error, using original:', file.name);
        resolve(file);
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      console.warn('[ImageCompressor] FileReader error, using original:', file.name);
      resolve(file);
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Compresses multiple image files sequentially or in batches.
 */
export async function compressImages(
  files: File[],
  options?: CompressionOptions
): Promise<File[]> {
  const compressed: File[] = [];
  for (const file of files) {
    const result = await compressImage(file, options);
    compressed.push(result);
  }
  return compressed;
}

/**
 * Uploads photos one by one (with compression) to ensure no single request exceeds Vercel's 4.5MB limit (HTTP 413).
 */
export async function uploadPhotosSequentially(
  buildingId: string,
  files: File[],
  onProgress?: (msg: string) => void
): Promise<{ urls: string[]; failedCount: number; errors: string[] }> {
  const urls: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const originalFile = files[i];
    if (onProgress) {
      onProgress(`사진 ${i + 1}/${files.length} 압축 및 업로드 중...`);
    }

    try {
      // 1. Client-side compression (resizes to max 1920px, JPEG 0.82)
      const compressedFile = await compressImage(originalFile);

      // 2. Upload individual file
      const formData = new FormData();
      formData.append('file', compressedFile);

      const res = await fetch(`/api/broker/buildings/${buildingId}/photos/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        let errorMsg = `HTTP ${res.status}`;
        try {
          const json = await res.json();
          errorMsg = json.error || errorMsg;
        } catch { /* ignore */ }
        errors.push(`${originalFile.name}: ${errorMsg}`);
        console.error(`[PhotoUpload] Upload failed for ${originalFile.name}:`, errorMsg);
        continue;
      }

      const data = await res.json();
      if (Array.isArray(data.urls) && data.urls.length > 0) {
        urls.push(...data.urls);
      } else {
        errors.push(`${originalFile.name}: URL 응답 없음`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`${originalFile.name}: ${errMsg}`);
      console.error(`[PhotoUpload] Error uploading ${originalFile.name}:`, errMsg);
    }
  }

  return {
    urls,
    failedCount: files.length - urls.length,
    errors,
  };
}
