import { supabase } from "@/lib/supabase";

export type WhatsAppQuickReply = {
  id: string;
  organization_id: string;
  title: string;
  message: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listWhatsAppQuickReplies(
  organizationId: string,
  activeOnly = false,
): Promise<WhatsAppQuickReply[]> {
  let query = supabase.from("union_whatsapp_quick_replies")
    .select("id,organization_id,title,message,sort_order,is_active,created_at,updated_at")
    .eq("organization_id", organizationId);
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query.order("sort_order", { ascending: true })
    .order("title", { ascending: true }).limit(200);
  if (error) throw error;
  return (data || []) as WhatsAppQuickReply[];
}

export async function saveWhatsAppQuickReply(
  organizationId: string,
  entry: { id?: string; title: string; message: string; sort_order: number; is_active: boolean },
): Promise<void> {
  const value = {
    organization_id: organizationId,
    title: entry.title.trim(),
    message: entry.message.trim(),
    sort_order: entry.sort_order,
    is_active: entry.is_active,
    updated_at: new Date().toISOString(),
  };
  if (!value.title || value.title.length > 70 || !value.message || value.message.length > 4000) {
    throw new Error("Informe título (até 70 caracteres) e mensagem (até 4.000 caracteres).");
  }
  const result = entry.id
    ? await supabase.from("union_whatsapp_quick_replies").update(value)
      .eq("id", entry.id).eq("organization_id", organizationId)
    : await supabase.from("union_whatsapp_quick_replies").insert(value);
  if (result.error) throw result.error;
}

export async function deleteWhatsAppQuickReply(
  organizationId: string, id: string,
): Promise<void> {
  const { error } = await supabase.from("union_whatsapp_quick_replies").delete()
    .eq("organization_id", organizationId).eq("id", id);
  if (error) throw error;
}
