import { useRef } from "react";
import { Camera, Upload, X } from "lucide-react";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { AdminButton, AdminIconButton, Section } from "@/shared/ui/admin/AdminLayout";
import type { OrderImage } from "../domain/order-image";
export type { OrderImage } from "../domain/order-image";

export function OrderImageThumb({ image, onRemove, onView }: { image: OrderImage; onRemove?: () => void; onView?: () => void }) {
  const { url: mediaUrl, loading, error } = useMediaUrl(image.mediaId);
  const url = image.url || mediaUrl;

  return (
    <div className="relative group w-24 h-20 rounded-lg overflow-hidden border border-[#0d1b2e]/12 bg-[#f5f7fa]">
      {loading ? (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-[#5a6a82]">Carregando...</div>
      ) : url ? (
        <button type="button" className="w-full h-full" onClick={onView}><img src={url} alt={image.name} className="w-full h-full object-cover" /></button>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-[#5a6a82] bg-[#f5f7fa]">{error ? "Imagem indisponível" : "Sem imagem"}</div>
      )}
      {onRemove && <button type="button" onClick={onRemove} aria-label={`Remover ${image.name}`} className="absolute top-1 right-1 p-1 rounded-full bg-[#0d1b2e]/75 text-white opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>}
    </div>
  );
}

export function OrderImagesField({ images, onAdd, onRemove, onView, canEdit = true, embedded = false }: { images: OrderImage[]; onAdd: (files: FileList | null) => void; onRemove: (key: string) => void; onView?: (image: OrderImage) => void; canEdit?: boolean; embedded?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const content = (
    <>
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <p className="min-w-0 text-xs text-[#5a6a82]">{images.length}/5 imagens</p>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-2">
            <AdminButton
              variant="secondary"
              size="sm"
              disabled={images.length >= 5}
              onClick={() => inputRef.current?.click()}
              aria-label="Adicionar imagens"
              title="Adicionar imagens"
              className="h-[42px] w-[42px] shrink-0 justify-center border-[#0057e7]/30 p-0 text-[#0057e7] hover:bg-[#0057e7]/5 sm:h-auto sm:w-auto sm:px-3 sm:py-2"
            >
              <Upload size={14} />
              <span className="hidden sm:inline">Adicionar imagens</span>
            </AdminButton>
            <AdminButton
              variant="secondary"
              size="sm"
              disabled={images.length >= 5}
              onClick={() => cameraInputRef.current?.click()}
              aria-label="Abrir câmera"
              title="Abrir câmera"
              className="h-[42px] w-[42px] shrink-0 justify-center border-[#0057e7]/30 p-0 text-[#0057e7] hover:bg-[#0057e7]/5 sm:h-auto sm:w-auto sm:px-3 sm:py-2"
            >
              <Camera size={14} />
              <span className="hidden sm:inline">Abrir câmera</span>
            </AdminButton>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={event => { onAdd(event.target.files); event.currentTarget.value = ""; }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { onAdd(event.target.files); event.currentTarget.value = ""; }} />
      {images.length > 0 && <div className="flex flex-wrap gap-3">{images.map(image => <OrderImageThumb key={image.key} image={image} onRemove={canEdit ? () => onRemove(image.key) : undefined} onView={() => onView?.(image)} />)}</div>}
    </>
  );

  return embedded ? content : <Section title="Imagens da OS">{content}</Section>;
}

export function OrderImageLightbox({ image, onClose }: { image: OrderImage; onClose: () => void }) {
  const { url: mediaUrl } = useMediaUrl(image.mediaId);
  const url = image.url || mediaUrl;
  return url ? <div className="fixed inset-0 z-[220] flex items-center justify-center bg-[#0d1b2e]/80 p-5" onClick={onClose}><AdminIconButton ariaLabel="Fechar imagem" onClick={onClose} variant="ghost" className="absolute right-4 top-4 h-10 w-10 rounded-full bg-white/15 text-white hover:bg-white/25 hover:text-white"><X size={20} /></AdminIconButton><img src={url} alt={image.name} className="max-w-full max-h-full object-contain" onClick={event => event.stopPropagation()} /></div> : null;
}
