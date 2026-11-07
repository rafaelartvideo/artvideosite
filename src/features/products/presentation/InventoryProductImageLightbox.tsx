import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AdminDialog } from "@/shared/ui/admin/AdminLayout";

export type InventoryProductPhoto = {
  mediaId: string;
  url: string;
  alt: string;
};

/** Visualização compartilhada entre a miniatura do estoque e as fotos dos detalhes. */
export function InventoryProductImageLightbox({
  photos, index, onIndexChange, onClose,
}: {
  photos: InventoryProductPhoto[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const photo = photos[index];
  const hasMultiple = photos.length > 1;
  useEffect(() => {
    if (!photo || !hasMultiple) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        onIndexChange((index + (event.key === "ArrowRight" ? 1 : photos.length - 1)) % photos.length);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [photo, hasMultiple, index, onIndexChange, photos.length]);

  if (!photo) return null;
  return <AdminDialog
    open
    onClose={onClose}
    title="Foto do produto"
    description={hasMultiple ? `${index + 1} de ${photos.length} fotos` : photo.alt}
    minimizable={false}
    className="w-[min(96vw,1100px)] max-w-6xl"
    bodyClassName="!overflow-hidden !p-3 sm:!p-4"
  >
    <div className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-xl bg-muted/30">
      <img
        src={photo.url}
        alt={photo.alt}
        className="max-h-[calc(100dvh-11rem)] min-h-0 max-w-full object-contain"
      />
      {hasMultiple && <>
        <button type="button" onClick={() => onIndexChange((index - 1 + photos.length) % photos.length)}
          aria-label="Foto anterior"
          className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-md transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-primary">
          <ChevronLeft size={21} />
        </button>
        <button type="button" onClick={() => onIndexChange((index + 1) % photos.length)}
          aria-label="Próxima foto"
          className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-md transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-primary">
          <ChevronRight size={21} />
        </button>
      </>}
    </div>
  </AdminDialog>;
}
