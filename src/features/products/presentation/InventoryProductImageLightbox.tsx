import { Image as ImageIcon } from "lucide-react";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { AdminDialog } from "@/shared/ui/admin/AdminLayout";

type Props = {
  mediaId?: string | null;
  src?: string | null;
  name: string;
  onClose: () => void;
};

export function InventoryProductImageLightbox({ mediaId, src, name, onClose }: Props) {
  const { url } = useMediaUrl(mediaId || null);
  const imageUrl = src || url;

  return <AdminDialog open onClose={onClose} title="Imagem do produto" description={name}
    className="w-[min(96vw,1100px)] max-w-6xl"
    bodyClassName="flex min-h-[180px] items-center justify-center bg-muted/30 p-2 sm:p-4">
    {imageUrl
      ? <img src={imageUrl} alt={name} className="max-h-[calc(100dvh-12rem)] w-auto max-w-full object-contain" />
      : <div className="flex flex-col items-center gap-2 text-muted-foreground"><ImageIcon size={32} /><span>Imagem indisponível</span></div>}
  </AdminDialog>;
}
