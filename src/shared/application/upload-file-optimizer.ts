import { IMAGE_PRESETS, type UploadImagePreset } from "../../../supabase/functions/_shared/upload-image-profiles.ts";
export { IMAGE_PRESETS, type UploadImagePreset } from "../../../supabase/functions/_shared/upload-image-profiles.ts";

const MAX_IMAGE_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_GENERIC_FILE_BYTES = 20 * 1024 * 1024;

const OUTPUT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const OPTIMIZABLE_IMAGE_TYPES = new Set([...OUTPUT_IMAGE_TYPES, "image/heic", "image/heif", "image/avif", "image/bmp"]);
const PRESERVED_IMAGE_TYPES = new Set(["image/gif", "image/svg+xml"]);

export function uploadImageMimeType(file: Pick<File, "type" | "name">): string {
  const type = file.type.toLowerCase();
  if (type && type !== "application/octet-stream") return type === "image/jpg" ? "image/jpeg" : type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", avif: "image/avif", bmp: "image/bmp", gif: "image/gif", svg: "image/svg+xml" } as Record<string, string>)[extension || ""] || type;
}

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
// Bound decoded pixel memory when a gallery selects many camera photos at once.
let imageQueue: Promise<unknown> = Promise.resolve();

async function isAnimatedImage(file: File, type: string) {
  if (type !== "image/png" && type !== "image/webp") return false;
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);
  const png = type === "image/png" && header[0] === 137 && text(header.slice(1, 4)) === "PNG";
  const webp = type === "image/webp" && text(header.slice(0, 4)) === "RIFF" && text(header.slice(8, 12)) === "WEBP";
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
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
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
    preparation = imageQueue.then(() => optimizeImageForUpload(file, preset));
    imageQueue = preparation.catch(() => undefined);
    byPreset.set(preset, preparation);
    // A temporary decoder/encoder failure must not poison retries forever.
    void preparation.catch(() => { byPreset?.delete(preset); });
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
  const sourceType = uploadImageMimeType(file);
  // Normalize metadata without decoding pixels again; this also covers small files
  // and the no-size-increase return, without uploading an empty/octet MIME.
  if (sourceType.startsWith("image/") && sourceType !== file.type) {
    file = new File([file], file.name, { type: sourceType, lastModified: file.lastModified });
  }
  if (PRESERVED_IMAGE_TYPES.has(sourceType)) return file;
  if (!OPTIMIZABLE_IMAGE_TYPES.has(sourceType)) {
    if (sourceType.startsWith("image/")) throw new Error("Formato de imagem não suportado para otimização. Use JPEG, PNG ou WebP.");
    return file;
  }
  if (await isAnimatedImage(file, sourceType)) return file;
  if (typeof document === "undefined") throw new Error("Este navegador não permite otimizar imagens antes do envio.");

  const config = IMAGE_PRESETS[preset];
  let decoded: Awaited<ReturnType<typeof decodeImage>> | null = null;
  let canvas: HTMLCanvasElement | null = null;

  try {
    decoded = await decodeImage(file);
    const { image, width: sourceWidth, height: sourceHeight } = decoded;
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
      throw new Error("A imagem possui dimensões inválidas.");
    }
    const largestDimension = Math.max(sourceWidth, sourceHeight);
    const scale = Math.min(1, config.maxDimension / Math.max(1, largestDimension));
    const shouldResize = scale < 1;
    const providerConversion = (preset === "whatsapp-image" || preset === "sac-image") && sourceType !== "image/jpeg" && sourceType !== "image/png";
    const shouldReencode = shouldResize || file.size > config.minBytesToOptimize || !OUTPUT_IMAGE_TYPES.has(sourceType) || providerConversion;

    if (!shouldReencode) return file;

    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Canvas indisponível para otimizar a imagem.");

    context.drawImage(image, 0, 0, width, height);

    if (preset === "whatsapp-image" || preset === "sac-image") {
      // WuzAPI /chat/send/image accepts JPEG or PNG photos (WebP is a
      // sticker there). Optimize before Storage upload, using JPEG for
      // opaque photos while retaining PNG alpha transparency.
      let hasTransparency = false;
      if (sourceType !== "image/jpeg") {
        for (let row = 0; row < height && !hasTransparency; row += 64) {
          const alpha = context.getImageData(0, row, width, Math.min(64, height - row)).data;
          for (let i = 3; i < alpha.length; i += 4) {
            if (alpha[i] !== 255) { hasTransparency = true; break; }
          }
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
      if (!optimized?.size) throw new Error("Não foi possível codificar a imagem.");
      if (optimized.size >= file.size) {
        if (sourceType === "image/jpeg" || sourceType === "image/png") return file;
        throw new Error("Não foi possível converter a imagem sem aumentar seu tamanho. Use JPEG ou PNG.");
      }
      if (optimized.type !== destinationType) throw new Error("Formato de saída incompatível com o envio de imagem.");
      const ext = optimized.type === "image/png" ? "png" : "jpg";
      return new File([optimized], `${fileBaseName(file.name)}.${ext}`,
        { type: optimized.type, lastModified: file.lastModified || Date.now() });
    }

    // Logos carry fine edges and may have alpha; PNG encoding is lossless.
    const encodingType = preset === "logo-image" && sourceType !== "image/jpeg" ? "image/png" : "image/webp";
    let quality = config.quality;
    let webp = await canvasToBlob(canvas, encodingType, quality);
    if (!webp?.size || !OUTPUT_IMAGE_TYPES.has(webp.type)) throw new Error("Não foi possível codificar a imagem em um formato compatível.");

    while (webp.size > config.targetMaxBytes && quality > config.minQuality) {
      quality = Math.max(config.minQuality, Number((quality - 0.04).toFixed(2)));
      const next = await canvasToBlob(canvas, encodingType, quality);
      if (!next?.size || next.size >= webp.size) break;
      webp = next;
    }

    // Evita substituir um arquivo que já esteja menor que a versão otimizada.
    if (webp.size >= file.size) {
      if (OUTPUT_IMAGE_TYPES.has(sourceType)) return file;
      throw new Error("Não foi possível converter a imagem sem aumentar seu tamanho. Use JPEG, PNG ou WebP.");
    }

    return new File(
      [webp],
      `${fileBaseName(file.name)}.${extensionForUploadFile({ type: webp.type, name: file.name } as File)}`,
      { type: webp.type, lastModified: file.lastModified || Date.now() },
    );
  } catch (error) {
    throw new Error(`Não foi possível otimizar a imagem. ${error instanceof Error ? error.message : "Selecione outro arquivo."}`);
  } finally {
    decoded?.release();
    // Release the potentially multi-megabyte backing buffer immediately.
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

export async function prepareFileForUpload(
  file: File,
  preset: UploadImagePreset = "document-image",
  options: { preserveOriginal?: boolean; maxBytes?: number } = {},
): Promise<File> {
  // Explicit binary-integrity exception for signed originals. PDFs and other
  // non-image documents always retain their bytes, irrespective of the preset.
  if (options.preserveOriginal || !uploadImageMimeType(file).startsWith("image/")) {
    const maxBytes = options.maxBytes ?? MAX_GENERIC_FILE_BYTES;
    if (file.size > maxBytes) throw new Error(`O arquivo deve ter no máximo ${maxBytes / (1024 * 1024)} MB.`);
    return file;
  }
  return prepareImageForUpload(file, preset, options.maxBytes);
}
