import { supabase } from "@/lib/supabase";
import { createMediaRecord } from "@/shared/infrastructure/media.repository";
import { extensionForUploadFile, prepareFileForUpload } from "@/shared/application/upload-file-optimizer";

export type OrderQuoteItem = {
  item_type: "product" | "service" | "custom_service";
  inventory_item_id: string | null;
  general_service_id: string | null;
  title_snapshot: string;
  description_snapshot: string;
  quantity: number;
  unit_price: number;
  additional_cost: number;
  /** Price fixed by the current service or product catalog when added. */
  catalog_price_fixed?: boolean;
  /** Mantém o item fixado no início da lista do orçamento. */
  pinned?: boolean;
};
export type OrderQuoteProposal = {
  id: string;
  status: "draft" | "awaiting_approval" | "approved" | "rejected" | "renegotiation";
  version: number;
  diagnosis: string;
  proposed_solution: string;
  commercial_conditions: string;
  valid_until: string | null;
  items: OrderQuoteItem[];
  discount_type: "amount" | "percentage";
  discount_value: number;
  versions: Array<Record<string, any>>;
  rejection_reason: string | null;
  approved_at: string | null;
  updated_at: string;
};

export type OrderQuoteDraft = Pick<OrderQuoteProposal,
  "diagnosis" | "proposed_solution" | "commercial_conditions" | "valid_until" | "items" | "discount_type" | "discount_value">;

export function emptyOrderQuoteDraft(): OrderQuoteDraft {
  return {
    diagnosis: "", proposed_solution: "", commercial_conditions: "", valid_until: null,
    items: [], discount_type: "amount", discount_value: 0,
  };
}
export async function readOrderQuote(organizationId: string, serviceOrderId: string): Promise<OrderQuoteProposal | null> {
  const started = Date.now();
  try {
    const { data, error } = await supabase.from("service_order_quote_proposals")
      .select("id,status,version,diagnosis,proposed_solution,commercial_conditions,valid_until,items,discount_type,discount_value,versions,rejection_reason,approved_at,updated_at")
      .eq("organization_id",organizationId).eq("service_order_id",serviceOrderId).maybeSingle();
    if (error) throw error;
    return data ? data as OrderQuoteProposal : null;
  } finally {
    const elapsed = Date.now() - started;
    if (elapsed >= 3000) console.warn("[PERF][OS] Consulta do orçamento lenta", { duration_ms: elapsed });
  }
}
export async function changeOrderQuote(
  organizationId: string, serviceOrderId: string,
  action: "save" | "submit" | "approve" | "reject" | "renegotiate",
  payload: Record<string,unknown> = {},
): Promise<OrderQuoteProposal> {
  const { data, error } = await supabase.rpc("manage_service_order_quote_v1", {
    p_organization_id: organizationId, p_order_id: serviceOrderId,
    p_action: action, p_payload: payload,
  });
  if (error) throw error;
  return data as OrderQuoteProposal;
}
export type OrderQuoteCommentAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
  url: string | null;
};
export type OrderQuoteComment = {
  id: string;
  parent_id: string | null;
  author_id: string;
  body: string;
  created_at: string;
  authorName: string;
  avatarUrl: string | null;
  likesCount: number;
  likedByMe: boolean;
  attachments: OrderQuoteCommentAttachment[];
};

export async function listOrderQuoteComments(
  organizationId: string,
  orderId: string,
  currentUserId?: string | null,
): Promise<OrderQuoteComment[]> {
  const { data: comments, error } = await supabase.from("service_order_quote_comments")
    .select("id,parent_id,author_id,body,created_at,author:profiles!service_order_quote_comments_author_id_fkey(full_name,avatar_media_id)")
    .eq("organization_id", organizationId).eq("service_order_id", orderId)
    .order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  const rows = (comments || []) as unknown as Array<{
    id: string; parent_id: string | null; author_id: string; body: string; created_at: string;
    author: { full_name: string | null; avatar_media_id: string | null } | { full_name: string | null; avatar_media_id: string | null }[] | null;
  }>;
  if (!rows.length) return [];

  // Consultas em lote: sem um request por comentário, curtida ou anexo.
  const ids = rows.map(row => row.id);
  const avatarIds = Array.from(new Set(rows.flatMap(row => {
    const author = Array.isArray(row.author) ? row.author[0] : row.author;
    return author?.avatar_media_id ? [author.avatar_media_id] : [];
  })));
  const [likesResult, filesResult, avatarsResult] = await Promise.all([
    (supabase as any).from("service_order_quote_comment_likes")
      .select("comment_id,user_id").eq("organization_id", organizationId)
      .eq("service_order_id", orderId).in("comment_id", ids),
    (supabase as any).from("service_order_quote_comment_attachments")
      .select("id,comment_id,media:media(file_name,mime_type,bucket_id,storage_path)")
      .eq("organization_id", organizationId).eq("service_order_id", orderId)
      .in("comment_id", ids),
    avatarIds.length
      ? supabase.from("media").select("id,bucket_id,storage_path").in("id", avatarIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (likesResult.error) throw likesResult.error;
  if (filesResult.error) throw filesResult.error;
  // Imagens de perfil são opcionais; um perfil sem permissão de mídia não bloqueia os comentários.
  if (avatarsResult.error) console.warn("[QUOTE COMMENTS] Avatares indisponíveis.", avatarsResult.error);

  const attachments = ((filesResult.data || []) as any[]).flatMap(item => {
    const media = Array.isArray(item.media) ? item.media[0] : item.media;
    return media?.bucket_id === "service-images" && media.storage_path
      ? [{ id: item.id as string, commentId: item.comment_id as string,
        fileName: String(media.file_name || "Anexo"), mimeType: String(media.mime_type || ""),
        bucket: "service-images", path: String(media.storage_path) }] : [];
  });
  const avatars = ((avatarsResult.data || []) as Array<{ id: string; bucket_id: string; storage_path: string }>)
    .filter(item => item.bucket_id === "avatars" && Boolean(item.storage_path));
  const paths = new Map<string, string[]>();
  const previewMedia = attachments.filter(file =>
    file.mimeType.startsWith("image/") || file.mimeType.startsWith("audio/"));
  if (previewMedia.length) paths.set("service-images", Array.from(new Set(previewMedia.map(file => file.path))));
  if (avatars.length) paths.set("avatars", Array.from(new Set(avatars.map(item => item.storage_path))));
  const urls = new Map<string, string>();
  await Promise.all(Array.from(paths.entries()).map(async ([bucket, filenames]) => {
    const { data: signed, error: signError } = await supabase.storage.from(bucket).createSignedUrls(filenames, 3600);
    if (signError) {
      console.warn("[QUOTE COMMENTS] Não foi possível assinar prévias de arquivos.", signError);
      return;
    }
    signed?.forEach((entry, index) => {
      if (entry.signedUrl) urls.set(bucket + "/" + (entry.path || filenames[index]), entry.signedUrl);
    });
  }));
  const likeRows = (likesResult.data || []) as Array<{ comment_id: string; user_id: string }>;
  return rows.map(row => {
    const author = Array.isArray(row.author) ? row.author[0] : row.author;
    const avatar = avatars.find(item => item.id === author?.avatar_media_id);
    const rowLikes = likeRows.filter(like => like.comment_id === row.id);
    return {
      id: row.id, parent_id: row.parent_id, author_id: row.author_id,
      body: row.body, created_at: row.created_at, authorName: author?.full_name || "Usuário",
      avatarUrl: avatar ? urls.get("avatars/" + avatar.storage_path) || null : null,
      likesCount: rowLikes.length,
      likedByMe: rowLikes.some(like => like.user_id === currentUserId),
      attachments: attachments.filter(item => item.commentId === row.id)
        .map(item => ({
          id: item.id, fileName: item.fileName, mimeType: item.mimeType,
          storagePath: item.path, url: urls.get("service-images/" + item.path) || null,
        })),
    };
  });
}

// O bucket privado service-images tem limite de 10 MB por arquivo.
const COMMENT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const COMMENT_ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "application/pdf", "text/plain", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg",
]);

export function validateOrderQuoteCommentFiles(files: File[]) {
  if (files.length > 3) throw new Error("Selecione no máximo 3 anexos por comentário.");
  for (const file of files) {
    if (!COMMENT_ALLOWED_MIME.has(file.type.toLowerCase())) {
      throw new Error("Envie imagens, áudios, PDF, TXT ou documentos Word.");
    }
    if (file.size <= 0 || file.size > COMMENT_MAX_ATTACHMENT_BYTES) {
      throw new Error(`O arquivo "${file.name}" deve ter até 10 MB.`);
    }
  }
}

export async function addOrderQuoteComment(
  organizationId: string, orderId: string, body: string,
  files: File[] = [], parentId: string | null = null,
) {
  validateOrderQuoteCommentFiles(files);
  if (!body.trim() && !files.length) throw new Error("Digite um comentário ou escolha um anexo.");
  const uploaded: Array<{ mediaId: string; path: string }> = [];
  try {
    for (const file of files) {
      const prepared = await prepareFileForUpload(file, file.type.startsWith("image/") ? "service-photo" : "document-image");
      const path = `orders/${orderId}/attachments/quote-comments/${crypto.randomUUID()}.${extensionForUploadFile(prepared)}`;
      const { error: storageError } = await supabase.storage.from("service-images")
        .upload(path, prepared, { upsert: false, contentType: prepared.type || undefined });
      if (storageError) throw storageError;
      try {
        const mediaId = await createMediaRecord({
          bucket: "service-images", path, file: prepared, organizationId,
        });
        uploaded.push({ mediaId, path });
      } catch (mediaError) {
        await supabase.storage.from("service-images").remove([path]);
        throw mediaError;
      }
    }
    // O RPC insere a mensagem e vincula todos os anexos numa mesma transação.
    const { data, error } = await (supabase as any).rpc("add_service_order_quote_comment_v2", {
      p_organization_id: organizationId,
      p_order_id: orderId,
      p_body: body.trim(),
      p_parent_id: parentId,
      p_media_ids: uploaded.map(item => item.mediaId),
    });
    if (error) throw error;
    return data as string;
  } catch (error) {
    // Falha antes da publicação: tenta limpar arquivos recém-enviados e sem vínculo.
    await Promise.allSettled(uploaded.map(async item => {
      await (supabase as any).from("media").delete().eq("id", item.mediaId);
      await supabase.storage.from("service-images").remove([item.path]);
    }));
    throw error;
  }
}

export async function setOrderQuoteCommentLike(
  organizationId: string, orderId: string, commentId: string, userId: string, liked: boolean,
) {
  const query = (supabase as any).from("service_order_quote_comment_likes");
  const result = liked
    ? await query.insert({ organization_id: organizationId, service_order_id: orderId, comment_id: commentId, user_id: userId })
    : await query.delete().eq("comment_id", commentId).eq("user_id", userId)
      .eq("organization_id", organizationId).eq("service_order_id", orderId);
  if (result.error) throw result.error;
}

export async function getOrderQuoteCommentAttachmentUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from("service-images")
    .createSignedUrl(storagePath, 300);
  if (error || !data?.signedUrl) throw error || new Error("Não foi possível abrir o anexo.");
  return data.signedUrl;
}

export async function readOrderPricingAfterApproval(organizationId: string, orderId: string) {
  const {data,error}=await supabase.from("service_orders")
    .select("service_price,parts_total,subtotal,discount_type,discount_percentage,discount_amount,final_total,commercial_pricing_enabled")
    .eq("organization_id",organizationId).eq("id",orderId).single();
  if(error) throw error;
  return data;
}
