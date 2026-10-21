import { useEffect, useState } from "react";
import { Section } from "@/shared/ui/admin/AdminLayout";
import { OrderImageLightbox, OrderImagesField, OrderImageDownloadMenu } from "@/features/orders/presentation/OrderImages";
import type { OrderImage } from "@/features/orders/domain/order-image";
import { loadQuoteEquipmentImages } from "../infrastructure/quote-equipment-images.repository";

export function QuoteEquipmentPhotos({ organizationId, quoteId }: {
  organizationId: string;
  quoteId: string;
}) {
  const [images, setImages] = useState<OrderImage[]>([]);
  const [preview, setPreview] = useState<OrderImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadQuoteEquipmentImages(organizationId, quoteId).then(rows => {
      if (active) setImages(rows);
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : String(err));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, quoteId]);
  if (!loading && !error && images.length === 0) return null;
  return <Section title="Fotos do equipamento" actions={images.length ?
    <OrderImageDownloadMenu images={images} label="imagens-do-orcamento"/> : undefined}>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {loading ? <p className="text-sm text-muted-foreground">Carregando fotos...</p> :
      <OrderImagesField images={images} canEdit={false} canAdd={false} canRemove={false}
        onAdd={() => {}} onRemove={() => {}} onView={setPreview}/>}
    {preview && <OrderImageLightbox context="quote" image={preview} onClose={() => setPreview(null)}/>}
  </Section>;
}
