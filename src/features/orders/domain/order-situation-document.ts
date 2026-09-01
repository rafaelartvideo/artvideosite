export type OrderSituation = {
  id: string;
  name: string;
  color?: string | null;
  sort_order?: number | null;
};

export type ServiceTypeSituationLink = {
  service_type_id: string;
  situation_id: string;
  sort_order?: number | null;
  situation?: OrderSituation | OrderSituation[] | null;
};

export type OrderSituationDocument = {
  id: string;
  service_order_id: string;
  situation_id: string;
  media_id: string;
  created_at: string;
  media?: { id: string; file_name?: string | null } | { id: string; file_name?: string | null }[] | null;
};

export const orderSituationUploadPermission = (situationId: string) =>
  `orders.images.situation.${situationId}.upload`;

export function situationDocumentMedia(document: OrderSituationDocument) {
  return Array.isArray(document.media) ? document.media[0] : document.media;
}
