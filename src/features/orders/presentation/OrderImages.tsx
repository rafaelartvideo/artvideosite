import { useRef, useState } from "react";
import { Camera, Download, MoreVertical, Upload, X } from "lucide-react";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { getMediaById, resolveMediaStorageUrl } from "@/shared/infrastructure/media.repository";
import { LoadingSpinner } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminDialog, Section } from "@/shared/ui/admin/AdminLayout";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";
import type { OrderImage } from "../domain/order-image";
export type { OrderImage } from "../domain/order-image";

type OrderImageDownloadFormat = "original" | "png" | "jpeg" | "pdf";

function safeFileBaseName(value: string, fallback: string) {
  const normalized = String(value || "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "";
}

function extensionFromFileName(fileName: string) {
  const match = String(fileName || "").match(/\.([a-z0-9]{2,5})$/i);
  return match?.[1]?.toLowerCase() || "";
}

async function loadOrderImageBlob(image: OrderImage) {
  if (image.file) {
    return {
      blob: image.file,
      fileName: image.file.name || image.name || "imagem",
    };
  }

  let sourceUrl = image.url || "";
  let fileName = image.name || "imagem";

  if (!sourceUrl && image.mediaId) {
    const media = await getMediaById(image.mediaId);
    if (!media) throw new Error("Imagem não encontrada.");
    const bucket = String(media.bucket_id || media.bucket_name || "");
    const storagePath = String(media.storage_path || "");
    sourceUrl = await resolveMediaStorageUrl(bucket, storagePath);
    fileName = String(media.file_name || image.name || "imagem");
  }

  if (!sourceUrl) throw new Error("Imagem indisponível para download.");

  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error("Não foi possível baixar a imagem.");
  return { blob: await response.blob(), fileName };
}

async function convertImageBlob(blob: Blob, format: Exclude<OrderImageDownloadFormat, "original">) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a conversão da imagem.");

    if (format === "jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0);

    const mimeType = format === "png" ? "image/png" : "image/jpeg";
    const converted = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, mimeType, format === "jpeg" ? 0.92 : undefined),
    );
    if (!converted) throw new Error("Não foi possível converter a imagem.");
    return converted;
  } finally {
    bitmap.close();
  }
}

function triggerImageDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
}

type PreparedPdfImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

async function preparePdfImage(image: OrderImage): Promise<PreparedPdfImage> {
  const source = await loadOrderImageBlob(image);
  const bitmap = await createImageBitmap(source.blob);
  try {
    const maxDimension = 2400;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a imagem para PDF.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const jpegBlob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, "image/jpeg", 0.94),
    );
    if (!jpegBlob) throw new Error("Não foi possível converter a imagem para PDF.");

    return {
      bytes: new Uint8Array(await jpegBlob.arrayBuffer()),
      width,
      height,
    };
  } finally {
    bitmap.close();
  }
}

async function createImagesPdfBlob(images: OrderImage[]) {
  if (!images.length) throw new Error("Nenhuma imagem disponível para gerar o PDF.");

  const prepared: PreparedPdfImage[] = [];
  for (const image of images) prepared.push(await preparePdfImage(image));

  const encoder = new TextEncoder();
  const textBytes = (value: string) => encoder.encode(value);
  const objectCount = 2 + prepared.length * 3;
  const objects: Uint8Array[] = new Array(objectCount + 1);

  objects[1] = textBytes("<< /Type /Catalog /Pages 2 0 R >>");

  const pageRefs: string[] = [];
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 36;

  prepared.forEach((image, index) => {
    const pageObject = 3 + index * 3;
    const contentObject = pageObject + 1;
    const imageObject = pageObject + 2;
    const imageName = `Im${index + 1}`;
    pageRefs.push(`${pageObject} 0 R`);

    const fitScale = Math.min(
      (pageWidth - margin * 2) / image.width,
      (pageHeight - margin * 2) / image.height,
    );
    const renderWidth = image.width * fitScale;
    const renderHeight = image.height * fitScale;
    const x = (pageWidth - renderWidth) / 2;
    const y = (pageHeight - renderHeight) / 2;
    const content = [
      "q",
      `${renderWidth.toFixed(3)} 0 0 ${renderHeight.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm`,
      `/${imageName} Do`,
      "Q",
      "",
    ].join("\n");
    const contentBytes = textBytes(content);

    objects[pageObject] = textBytes(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /${imageName} ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`,
    );
    objects[contentObject] = concatBytes([
      textBytes(`<< /Length ${contentBytes.length} >>\nstream\n`),
      contentBytes,
      textBytes("endstream"),
    ]);
    objects[imageObject] = concatBytes([
      textBytes(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`),
      image.bytes,
      textBytes("\nendstream"),
    ]);
  });

  objects[2] = textBytes(
    `<< /Type /Pages /Count ${prepared.length} /Kids [${pageRefs.join(" ")}] >>`,
  );

  const chunks: Uint8Array[] = [textBytes("%PDF-1.4\n")];
  const offsets = new Array<number>(objectCount + 1).fill(0);
  let byteOffset = chunks[0].length;

  for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) {
    offsets[objectNumber] = byteOffset;
    const objectChunk = concatBytes([
      textBytes(`${objectNumber} 0 obj\n`),
      objects[objectNumber],
      textBytes("\nendobj\n"),
    ]);
    chunks.push(objectChunk);
    byteOffset += objectChunk.length;
  }

  const xrefOffset = byteOffset;
  const xrefLines = [
    "xref",
    `0 ${objectCount + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objectCount + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");
  chunks.push(textBytes(xrefLines));

  const pdfBytes = concatBytes(chunks);
  if (pdfBytes.length < 100) throw new Error("Não foi possível gerar o PDF.");
  return new Blob([pdfBytes], { type: "application/pdf" });
}

async function buildImagesPdf(images: OrderImage[], fileName: string) {
  const pdfBlob = await createImagesPdfBlob(images);
  triggerImageDownload(pdfBlob, fileName);
}
async function downloadOrderImage(image: OrderImage, format: OrderImageDownloadFormat, index: number) {
  if (format === "pdf") {
    const baseName = safeFileBaseName(image.name, `imagem-${index + 1}`);
    await buildImagesPdf([image], `${baseName}.pdf`);
    return;
  }

  const source = await loadOrderImageBlob(image);
  const baseName = safeFileBaseName(source.fileName || image.name, `imagem-${index + 1}`);

  if (format === "original") {
    const originalExtension = extensionFromFileName(source.fileName)
      || extensionForMimeType(source.blob.type)
      || "jpg";
    triggerImageDownload(source.blob, `${baseName}.${originalExtension}`);
    return;
  }

  const converted = await convertImageBlob(source.blob, format);
  triggerImageDownload(converted, `${baseName}.${format === "png" ? "png" : "jpeg"}`);
}

export function OrderImageDownloadMenu({
  images,
  label,
}: {
  images: OrderImage[];
  label: string;
}) {
  const [busyFormat, setBusyFormat] = useState<OrderImageDownloadFormat | null>(null);
  const [error, setError] = useState("");

  if (!images.length) return null;

  const downloadAll = async (format: OrderImageDownloadFormat) => {
    if (busyFormat) return;
    setBusyFormat(format);
    setError("");

    try {
      if (format === "pdf") {
        await buildImagesPdf(images, `${safeFileBaseName(label, "imagens")}.pdf`);
        return;
      }

      let failed = 0;
      for (let index = 0; index < images.length; index += 1) {
        try {
          await downloadOrderImage(images[index], format, index);
        } catch (downloadError) {
          console.error("[ORDER_IMAGES] download failed", downloadError);
          failed += 1;
        }
      }

      if (failed > 0) {
        setError(failed === images.length
          ? "Não foi possível baixar as imagens."
          : `${failed} imagem(ns) não puderam ser baixadas.`);
      }
    } catch (downloadError) {
      console.error("[ORDER_IMAGES] batch download failed", downloadError);
      setError("Não foi possível baixar as imagens.");
    } finally {
      setBusyFormat(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="hidden text-[10px] font-semibold text-red-600 sm:inline">{error}</span>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={Boolean(busyFormat)}
            aria-label={`Opções de download de ${label}`}
            title={busyFormat ? "Baixando imagens..." : "Opções de download"}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#0d1b2e]/12 bg-white text-[#5a6a82] transition-colors hover:bg-[#f5f7fa] hover:text-[#0d1b2e] disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <MoreVertical size={15} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem
            disabled={Boolean(busyFormat)}
            onSelect={() => void downloadAll("original")}
            className="cursor-pointer gap-2"
          >
            <Download size={14} />
            Baixar todas no original
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={Boolean(busyFormat)}
            onSelect={() => void downloadAll("png")}
            className="cursor-pointer gap-2"
          >
            <Download size={14} />
            Baixar todas em PNG
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={Boolean(busyFormat)}
            onSelect={() => void downloadAll("jpeg")}
            className="cursor-pointer gap-2"
          >
            <Download size={14} />
            Baixar todas em JPEG
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={Boolean(busyFormat)}
            onSelect={() => void downloadAll("pdf")}
            className="cursor-pointer gap-2"
          >
            <Download size={14} />
            Baixar todas em PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function OrderImageThumb({ image, onRemove, onView }: { image: OrderImage; onRemove?: () => void; onView?: () => void }) {
  const { url: mediaUrl, loading, error } = useMediaUrl(image.mediaId);
  const url = image.url || mediaUrl;

  return (
    <div className="relative group w-24 h-20 rounded-lg overflow-hidden border border-[#0d1b2e]/12 bg-[#f5f7fa]">
      {loading ? (
        <div className="flex h-full w-full items-center justify-center"><LoadingSpinner size="sm" /></div>
      ) : url ? (
        <button type="button" className="w-full h-full" onClick={onView}><img src={url} alt={image.name} className="w-full h-full object-cover" /></button>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-[#5a6a82] bg-[#f5f7fa]">{error ? "Imagem indisponível" : "Sem imagem"}</div>
      )}
      {onRemove && <button type="button" onClick={onRemove} aria-label={`Remover ${image.name}`} className="absolute top-1 right-1 p-1 rounded-full bg-[#0d1b2e]/75 text-white opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>}
    </div>
  );
}

type OrderImagesFieldProps = {
  images: OrderImage[];
  onAdd: (files: FileList | null) => void;
  onRemove: (key: string) => void;
  onView?: (image: OrderImage) => void;
  canEdit?: boolean;
  canAdd?: boolean;
  canRemove?: boolean | ((image: OrderImage) => boolean);
  embedded?: boolean;
  totalCount?: number;
  maxImages?: number;
};

export function OrderImagesField({
  images,
  onAdd,
  onRemove,
  onView,
  canEdit = true,
  canAdd,
  canRemove,
  embedded = false,
  totalCount,
  maxImages = 5,
}: OrderImagesFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const allowAdd = canAdd ?? canEdit;
  const count = totalCount ?? images.length;
  const canRemoveImage = (image: OrderImage) => typeof canRemove === "function" ? canRemove(image) : (canRemove ?? canEdit);

  const content = (
    <>
      <div className="mb-3 flex min-w-0 flex-col gap-2">
        <p className="min-w-0 text-xs text-[#5a6a82]">{count}/{maxImages} imagens</p>
        {allowAdd && (
          <div className="grid w-full min-w-0 grid-cols-2 gap-2">
            <AdminButton
              variant="secondary"
              size="sm"
              disabled={count >= maxImages}
              onClick={() => inputRef.current?.click()}
              aria-label="Adicionar imagens"
              title="Adicionar imagens"
              className="h-[42px] w-full min-w-0 justify-center gap-1.5 border-[#0057e7]/30 px-2 py-0 text-[#0057e7] hover:bg-[#0057e7]/5 md:px-3"
            >
              <Upload size={18} className="shrink-0" />
              <span className="hidden text-xs md:inline">Adicionar</span>
            </AdminButton>
            <AdminButton
              variant="secondary"
              size="sm"
              disabled={count >= maxImages}
              onClick={() => cameraInputRef.current?.click()}
              aria-label="Abrir câmera"
              title="Abrir câmera"
              className="h-[42px] w-full min-w-0 justify-center gap-1.5 border-[#0057e7]/30 px-2 py-0 text-[#0057e7] hover:bg-[#0057e7]/5 md:px-3"
            >
              <Camera size={18} className="shrink-0" />
              <span className="hidden text-xs md:inline">Câmera</span>
            </AdminButton>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={event => { onAdd(event.target.files); event.currentTarget.value = ""; }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { onAdd(event.target.files); event.currentTarget.value = ""; }} />
      {images.length > 0 && <div className="flex flex-wrap gap-3">{images.map(image => <OrderImageThumb key={image.key} image={image} onRemove={canRemoveImage(image) ? () => onRemove(image.key) : undefined} onView={() => onView?.(image)} />)}</div>}
    </>
  );

  return embedded ? content : <Section title="Imagens da OS">{content}</Section>;
}

export function OrderImageLightbox({ image, onClose }: { image: OrderImage; onClose: () => void }) {
  const { url: mediaUrl } = useMediaUrl(image.mediaId);
  const url = image.url || mediaUrl;
  const [busyFormat, setBusyFormat] = useState<OrderImageDownloadFormat | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);

  const download = async (format: OrderImageDownloadFormat) => {
    if (busyFormat) return;
    setBusyFormat(format);
    setDownloadError("");
    try {
      await downloadOrderImage(image, format, 0);
    } catch (error) {
      console.error("[ORDER_IMAGES] individual download failed", error);
      setDownloadError("Não foi possível baixar esta imagem.");
    } finally {
      setBusyFormat(null);
    }
  };

  return url ? <AdminDialog
    open
    onClose={onClose}
    title={image.name || "Visualizar imagem"}
    description="Imagem vinculada à ordem de serviço."
    minimizedDescription={image.name || "Imagem da OS"}
    className="max-w-6xl"
    headerActions={
      <div
        className="relative"
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDownloadMenuOpen(false);
          }
        }}
      >
        <button
          type="button"
          disabled={Boolean(busyFormat)}
          aria-label="Baixar imagem"
          aria-haspopup="menu"
          aria-expanded={downloadMenuOpen}
          title={busyFormat ? "Preparando download..." : "Baixar imagem"}
          onClick={() => setDownloadMenuOpen(open => !open)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-primary disabled:cursor-wait disabled:opacity-60"
        >
          <Download size={15} />
        </button>
        {downloadMenuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+0.35rem)] z-[230] w-52 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-xl"
          >
            {([
              ["original", "Baixar original"],
              ["png", "Baixar em PNG"],
              ["jpeg", "Baixar em JPEG"],
              ["pdf", "Baixar em PDF"],
            ] as Array<[OrderImageDownloadFormat, string]>).map(([format, label]) => (
              <button
                key={format}
                type="button"
                role="menuitem"
                disabled={Boolean(busyFormat)}
                onClick={() => {
                  setDownloadMenuOpen(false);
                  void download(format);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-primary-soft hover:text-primary focus:bg-primary-soft focus:text-primary disabled:pointer-events-none disabled:opacity-50"
              >
                <Download size={14} className="shrink-0" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    }
  >
    {downloadError && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{downloadError}</div>}
    <div className="flex min-h-[45vh] items-center justify-center overflow-hidden rounded-xl bg-[#0d1b2e] p-2">
      <img src={url} alt={image.name} className="max-h-[72vh] max-w-full object-contain" />
    </div>
  </AdminDialog> : null;
}
