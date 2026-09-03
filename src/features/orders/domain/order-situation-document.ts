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

export type AttachmentType = {
  id: string;
  name: string;
  is_active: boolean;
};

export type OrderSituationDocument = {
  id: string;
  service_order_id: string;
  situation_id?: string | null;
  media_id: string;
  attachment_type_id?: string | null;
  created_at: string;
  media?: {
    id: string;
    file_name?: string | null;
    mime_type?: string | null;
  } | {
    id: string;
    file_name?: string | null;
    mime_type?: string | null;
  }[] | null;
  attachment_type?: AttachmentType | AttachmentType[] | null;
};

export const orderSituationUploadPermission = (situationId: string) =>
  `orders.images.situation.${situationId}.upload`;

export function situationDocumentMedia(document: OrderSituationDocument) {
  return Array.isArray(document.media) ? document.media[0] : document.media;
}

export function situationDocumentType(document: OrderSituationDocument) {
  return Array.isArray(document.attachment_type)
    ? document.attachment_type[0]
    : document.attachment_type;
}
