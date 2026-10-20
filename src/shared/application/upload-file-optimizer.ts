export type UploadImagePreset = "service-photo" | "service-label" | "document-image" | "catalog-image" | "whatsapp-image";

type ImagePresetConfig = {
  maxDimension: number;
  quality: number;
  minQuality: number;
  minBytesToOptimize: number;
  targetMaxBytes: number;
};

const IMAGE_PRESETS: Record<UploadImagePreset, ImagePresetConfig> = {
  "service-photo": { maxDimension: 1920, quality: 0.82, minQuality: 0.72, minBytesToOptimize: 350 * 1024, targetMaxBytes: 1200 * 1024 },
  "service-label": { maxDimension: 2200, quality: 0.88, minQuality: 0.82, minBytesToOptimize: 450 * 1024, targetMaxBytes: 1600 * 1024 },
  "document-image": { maxDimension: 1920, quality: 0.84, minQuality: 0.76, minBytesToOptimize: 350 * 1024, targetMaxBytes: 1200 * 1024 },
  "catalog-image": { maxDimension: 2200, quality: 0.86, minQuality: 0.80, minBytesToOptimize: 400 * 1024, targetMaxBytes: 1500 * 1024 },
  "whatsapp-image": { maxDimension: 2560, quality: 0.86, minQuality: 0.68, minBytesToOptimize: 160 * 1024, targetMaxBytes: 3 * 1024 * 1024 },
};

const MAX_IMAGE_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_GENERIC_FILE_BYTES = 20 * 1024 * 1024;

const OPTIMIZABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function fileBaseName(name: string) {
  const normalized = String(name || "imagem").trim();
  const dot = normalized.lastIndexOf(".");
  return (dot > 0 ? normalized.slice(0, dot) : normalized) || "imagem";
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
}

export function extensionForUploadFile(file: File) {
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  return file.name.split(".").pop()?.toLowerCase() || "bin";
}

export async function prepareImageForUpload(
  file: File,
  preset: UploadImagePreset = "service-photo",
): Promise<File> {
  if (file.size > MAX_IMAGE_SOURCE_BYTES) {
    throw new Error("A imagem deve ter no máximo 25 MB antes da otimização.");
  }
  if (!OPTIMIZABLE_IMAGE_TYPES.has(file.type)) return file;
  if (typeof createImageBitmap !== "function") return file;

  const config = IMAGE_PRESETS[preset];
  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await createImageBitmap(file);
    const largestDimension = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, config.maxDimension / Math.max(1, largestDimension));
    const shouldResize = scale < 1;
    const shouldReencode = shouldResize || file.size > config.minBytesToOptimize;

    if (!shouldReencode) return file;

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return file;

    context.drawImage(bitmap, 0, 0, width, height);

    if (preset === "whatsapp-image") {
      // WuzAPI /chat/send/image accepts JPEG or PNG photos (WebP is a
      // sticker there). Optimize before Storage upload, using JPEG for
      // opaque photos while retaining PNG alpha transparency.
      let hasTransparency = false;
      if (file.type === "image/png" || file.type === "image/webp") {
        const alpha = context.getImageData(0, 0, width, height).data;
        for (let i = 3; i < alpha.length; i += 4) {
          if (alpha[i] !== 255) { hasTransparency = true; break; }
        }
      }
      const destinationType = hasTransparency ? "image/png" : "image/jpeg";
      let optimized: Blob | null = null;
      if (hasTransparency) {
        optimized = await canvasToBlob(canvas, destinationType, 1);
      } else {
        let quality = config.quality;
        optimized = await canvasToBlob(canvas, destinationType, quality);
        while (optimized?.size && optimized.size > config.targetMaxBytes &&
          quality - 0.06 >= config.minQuality) {
          quality = Math.max(config.minQuality, Number((quality - 0.06).toFixed(2)));
          const next = await canvasToBlob(canvas, destinationType, quality);
          if (!next?.size || next.size >= optimized.size) break;
          optimized = next;
        }
      }
      if (!optimized?.size) return file;
      if (!shouldResize && optimized.size >= file.size * 0.98 &&
        (file.type === "image/jpeg" || file.type === "image/png")) return file;
      const ext = hasTransparency ? "png" : "jpg";
      return new File([optimized], `${fileBaseName(file.name)}.${ext}`,
        { type: destinationType, lastModified: file.lastModified || Date.now() });
    }

    let quality = config.quality;
    let webp = await canvasToBlob(canvas, "image/webp", quality);
    if (!webp?.size) return file;

    while (webp.size > config.targetMaxBytes && quality - 0.04 >= config.minQuality) {
      quality = Math.max(config.minQuality, Number((quality - 0.04).toFixed(2)));
      const next = await canvasToBlob(canvas, "image/webp", quality);
      if (!next?.size || next.size >= webp.size) break;
      webp = next;
    }

    // Evita substituir um arquivo que já esteja menor que a versão otimizada.
    if (!shouldResize && webp.size >= file.size * 0.98) return file;

    return new File(
      [webp],
      `${fileBaseName(file.name)}.webp`,
      { type: "image/webp", lastModified: file.lastModified || Date.now() },
    );
  } catch (error) {
    console.warn("[MEDIA] Não foi possível otimizar a imagem; enviando o arquivo original.", error);
    return file;
  } finally {
    bitmap?.close();
  }
}

export async function prepareFileForUpload(
  file: File,
  preset: UploadImagePreset = "document-image",
) {
  if (!file.type.startsWith("image/")) {
    if (file.size > MAX_GENERIC_FILE_BYTES) {
      throw new Error("O arquivo deve ter no máximo 20 MB.");
    }
    return file;
  }
  return prepareImageForUpload(file, preset);
}
