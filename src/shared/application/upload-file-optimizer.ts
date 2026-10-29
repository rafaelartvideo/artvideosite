export type UploadImagePreset = "service-photo" | "service-label" | "document-image" | "catalog-image" | "whatsapp-image" | "sac-image";

type ImagePresetConfig = {
  maxDimension: number;
  quality: number;
  minQuality: number;
  minBytesToOptimize: number;
  targetMaxBytes: number;
};

const IMAGE_PRESETS: Record<UploadImagePreset, ImagePresetConfig> = {
  "service-photo": { maxDimension: 1600, quality: 0.80, minQuality: 0.68, minBytesToOptimize: 250 * 1024, targetMaxBytes: 900 * 1024 },
  "service-label": { maxDimension: 2200, quality: 0.88, minQuality: 0.82, minBytesToOptimize: 450 * 1024, targetMaxBytes: 1600 * 1024 },
  "document-image": { maxDimension: 1920, quality: 0.84, minQuality: 0.76, minBytesToOptimize: 350 * 1024, targetMaxBytes: 1200 * 1024 },
  "catalog-image": { maxDimension: 1600, quality: 0.82, minQuality: 0.70, minBytesToOptimize: 250 * 1024, targetMaxBytes: 950 * 1024 },
  "sac-image": { maxDimension: 1600, quality: 0.80, minQuality: 0.68, minBytesToOptimize: 160 * 1024, targetMaxBytes: 900 * 1024 },
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

// Weak keys allow selected source files and encoded results to be collected when
// their form is closed. Share concurrent preparation without recompressing results.
const preparedImages = new WeakMap<File, Map<UploadImagePreset, Promise<File>>>();

async function isAnimatedImage(file: File) {
  if (file.type !== "image/png" && file.type !== "image/webp") return false;
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);
  const png = file.type === "image/png" && header[0] === 137 && text(header.slice(1, 4)) === "PNG";
  const webp = file.type === "image/webp" && text(header.slice(0, 4)) === "RIFF" && text(header.slice(8, 12)) === "WEBP";
  if (!png && !webp) return false;
  // Read only chunk headers, never copy all compressed pixels into JS memory.
  let offset = png ? 8 : 12;
  while (offset + 8 <= file.size) {
    const chunk = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const kind = text(png ? chunk.slice(4, 8) : chunk.slice(0, 4));
    if (kind === "acTL" || kind === "ANIM" || kind === "ANMF") return true;
    if (png && (kind === "IDAT" || kind === "IEND")) return false;
    const length = view.getUint32(png ? 0 : 4, !png);
    const next = offset + 8 + length + (png ? 4 : length % 2);
    if (next <= offset || next > file.size) return false;
    offset = next;
  }
  return false;
}

async function decodeImage(file: File): Promise<{
  image: CanvasImageSource; width: number; height: number; release: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch { /* Some mobile browsers decode through HTMLImageElement only. */ }
  }
  if (typeof Image === "undefined") throw new Error("Decodificador de imagem indisponível.");
  const url = URL.createObjectURL(file);
  const image = new Image();
  const release = () => {
    image.onload = null; image.onerror = null; image.src = "";
    URL.revokeObjectURL(url);
  };
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Não foi possível abrir a imagem."));
      image.src = url;
    });
    return { image, width: image.naturalWidth, height: image.naturalHeight, release };
  } catch (error) { release(); throw error; }
}

export async function prepareImageForUpload(
  file: File,
  preset: UploadImagePreset = "service-photo",
  maxBytes = MAX_IMAGE_SOURCE_BYTES,
): Promise<File> {
  if (file.size > MAX_IMAGE_SOURCE_BYTES) throw new Error("A imagem deve ter no máximo 25 MB antes da otimização.");
  let byPreset = preparedImages.get(file);
  if (!byPreset) { byPreset = new Map(); preparedImages.set(file, byPreset); }
  let preparation = byPreset.get(preset);
  if (!preparation) {
    preparation = optimizeImageForUpload(file, preset);
    byPreset.set(preset, preparation);
  }
  const prepared = await preparation;
  if (prepared !== file) {
    let resultPresets = preparedImages.get(prepared);
    if (!resultPresets) { resultPresets = new Map(); preparedImages.set(prepared, resultPresets); }
    resultPresets.set(preset, Promise.resolve(prepared));
  }
  if (prepared.size > maxBytes) throw new Error(`A imagem excede o limite de ${maxBytes / (1024 * 1024)} MB após a otimização.`);
  return prepared;
}

async function optimizeImageForUpload(
  file: File,
  preset: UploadImagePreset = "service-photo",
): Promise<File> {
  if (file.size > MAX_IMAGE_SOURCE_BYTES) {
    throw new Error("A imagem deve ter no máximo 25 MB antes da otimização.");
  }
  if (!OPTIMIZABLE_IMAGE_TYPES.has(file.type)) return file;
  if (await isAnimatedImage(file)) return file;
  if (typeof document === "undefined") return file;

  const config = IMAGE_PRESETS[preset];
  let decoded: Awaited<ReturnType<typeof decodeImage>> | null = null;
  let canvas: HTMLCanvasElement | null = null;

  try {
    decoded = await decodeImage(file);
    const { image, width: sourceWidth, height: sourceHeight } = decoded;
    const largestDimension = Math.max(sourceWidth, sourceHeight);
    const scale = Math.min(1, config.maxDimension / Math.max(1, largestDimension));
    const shouldResize = scale < 1;
    const shouldReencode = shouldResize || file.size > config.minBytesToOptimize;

    if (!shouldReencode) return file;

    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return file;

    context.drawImage(image, 0, 0, width, height);

    if (preset === "whatsapp-image" || preset === "sac-image") {
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
          quality > config.minQuality) {
          quality = Math.max(config.minQuality, Number((quality - 0.06).toFixed(2)));
          const next = await canvasToBlob(canvas, destinationType, quality);
          if (!next?.size || next.size >= optimized.size) break;
          optimized = next;
        }
      }
      if (!optimized?.size) return file;
      if (!shouldResize && optimized.size >= file.size * 0.98 &&
        (file.type === "image/jpeg" || file.type === "image/png")) return file;
      if (optimized.type !== "image/png" && optimized.type !== "image/jpeg") return file;
      const ext = optimized.type === "image/png" ? "png" : "jpg";
      return new File([optimized], `${fileBaseName(file.name)}.${ext}`,
        { type: optimized.type, lastModified: file.lastModified || Date.now() });
    }

    let quality = config.quality;
    let webp = await canvasToBlob(canvas, "image/webp", quality);
    if (!webp?.size || !OPTIMIZABLE_IMAGE_TYPES.has(webp.type)) return file;

    while (webp.size > config.targetMaxBytes && quality > config.minQuality) {
      quality = Math.max(config.minQuality, Number((quality - 0.04).toFixed(2)));
      const next = await canvasToBlob(canvas, "image/webp", quality);
      if (!next?.size || next.size >= webp.size) break;
      webp = next;
    }

    // Evita substituir um arquivo que já esteja menor que a versão otimizada.
    if (!shouldResize && webp.size >= file.size * 0.98) return file;

    return new File(
      [webp],
      `${fileBaseName(file.name)}.${extensionForUploadFile({ type: webp.type, name: file.name } as File)}`,
      { type: webp.type, lastModified: file.lastModified || Date.now() },
    );
  } catch (error) {
    console.warn("[MEDIA] Não foi possível otimizar a imagem; enviando o arquivo original.", error);
    return file;
  } finally {
    decoded?.release();
    // Release the potentially multi-megabyte backing buffer immediately.
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

export async function prepareFileForUpload(
  file: File,
  preset: UploadImagePreset = "document-image",
) {
  // Attachments can be contracts, receipts, scans or originals. Keep their
  // pixels, transparency and bytes intact; only explicit photo flows are lossy.
  if (preset === "document-image" || !file.type.startsWith("image/")) {
    if (file.size > MAX_GENERIC_FILE_BYTES) throw new Error("O arquivo deve ter no máximo 20 MB.");
    return file;
  }
  return prepareImageForUpload(file, preset);
}
