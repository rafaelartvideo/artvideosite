import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon } from "lucide-react";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { AdminDialog } from "@/shared/ui/admin/AdminLayout";

export type InventoryProductPhoto = {
  mediaId?: string | null;
  src?: string | null;
  name: string;
};

type Props = InventoryProductPhoto & {
  photos?: InventoryProductPhoto[];
  startIndex?: number;
  onClose: () => void;
};

export function InventoryProductImageLightbox({ mediaId, src, name, photos, startIndex = 0, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const hasMultiple = Boolean(photos && photos.length > 1);
  const active = photos?.[index] || { mediaId, src, name };
  const { url } = useMediaUrl(active.mediaId || null);
  const imageUrl = active.src || url;

  useEffect(() => {
    if (!hasMultiple || !photos) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setIndex(current => (current + (event.key === "ArrowRight" ? 1 : photos.length - 1)) % photos.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasMultiple, photos]);

  return <AdminDialog open onClose={onClose} title="Imagem do produto"
    description={hasMultiple ? String(index + 1) + " de " + photos!.length + " fotos · " + active.name : active.name}
    className="w-[min(96vw,1100px)] max-w-6xl"
    bodyClassName="!overflow-hidden p-2 sm:p-4">
    <div className="relative flex min-h-[180px] items-center justify-center rounded-xl bg-muted/30">
      {imageUrl
        ? <img src={imageUrl} alt={active.name} className="max-h-[calc(100dvh-12rem)] w-auto max-w-full object-contain" />
        : <div className="flex flex-col items-center gap-2 text-muted-foreground"><ImageIcon size={32} /><span>Imagem indisponível</span></div>}
      {hasMultiple && photos && <>
        <button type="button" onClick={() => setIndex(current => (current - 1 + photos.length) % photos.length)}
          aria-label="Foto anterior" title="Foto anterior"
          className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-md transition-colors hover:bg-card">
          <ChevronLeft size={21} />
        </button>
        <button type="button" onClick={() => setIndex(current => (current + 1) % photos.length)}
          aria-label="Próxima foto" title="Próxima foto"
          className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-md transition-colors hover:bg-card">
          <ChevronRight size={21} />
        </button>
      </>}
    </div>
  </AdminDialog>;
}
