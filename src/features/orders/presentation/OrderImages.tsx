import { useRef, useState } from "react";
import { Camera, Download, MoreVertical, Upload, X } from "lucide-react";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { getMediaById, resolveMediaStorageUrl } from "@/shared/infrastructure/media.repository";
import { LoadingSpinner } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminDialog, Section } from "@/shared/ui/admin/AdminLayout";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";
import type { OrderImage } from "../domain/order-image";
export type { OrderImage } from "../domain/order-image";

type OrderImageDownloadFormat = "original" | "png" | "jpeg";

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

async function downloadOrderImage(image: OrderImage, format: OrderImageDownloadFormat, index: number) {
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
    setBusyFormat(null);
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
  return url ? <AdminDialog
    open
    onClose={onClose}
    title={image.name || "Visualizar imagem"}
    description="Imagem vinculada à ordem de serviço."
    minimizedDescription={image.name || "Imagem da OS"}
    className="max-w-6xl"
  >
    <div className="flex min-h-[45vh] items-center justify-center overflow-hidden rounded-xl bg-[#0d1b2e] p-2">
      <img src={url} alt={image.name} className="max-h-[72vh] max-w-full object-contain" />
    </div>
  </AdminDialog> : null;
}
