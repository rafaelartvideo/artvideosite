import { supabase } from "@/lib/supabase";
import { getArtVideoOrganizationId } from "@/lib/organization-identity";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";

export type PublicGeneralService = {
  id: string;
  general_service_id: string;
  show_in_catalog: boolean;
  short_description: string | null;
  description: string | null;
  cover_media_id: string | null;
  is_featured: boolean;
  public_icon: string | null;
};

export type PublicServiceDraft = {
  title: string;
  operationalPrice: number | null;
  priceAtCompletion: boolean;
  operationalActive: boolean;
  publish: boolean;
  shortDescription: string;
  description: string;
  coverMediaId: string | null;
  featured: boolean;
  icon: string;
};

export async function loadGeneralServicePublication(serviceId: string): Promise<PublicGeneralService | null> {
  const organizationId = await getArtVideoOrganizationId();
  const { data, error } = await supabase.from("services")
    .select("id,general_service_id,show_in_catalog,short_description,description,cover_media_id,is_featured,public_icon")
    .eq("organization_id", organizationId)
    .eq("general_service_id", serviceId)
    .maybeSingle();
  if (error) throw error;
  return data as PublicGeneralService | null;
}

/**
 * A OS usa general_services como fonte de verdade. A linha de services só
 * acrescenta os dados de apresentação pública; a relação 1:1 é única no banco.
 */
export async function saveGeneralServicePublication(serviceId: string, draft: PublicServiceDraft, userId: string | null): Promise<void> {
  const organizationId = await getArtVideoOrganizationId();
  const linked = await loadGeneralServicePublication(serviceId);
  if (!linked && !draft.publish) return;
  const title = draft.title.trim();
  const payload = {
    title,
    general_service_id: serviceId,
    show_in_catalog: draft.publish,
    is_active: draft.operationalActive,
    base_price: draft.priceAtCompletion || draft.operationalPrice === null || draft.operationalPrice <= 0
      ? null : draft.operationalPrice,
    price_mode: draft.priceAtCompletion || draft.operationalPrice === null || draft.operationalPrice <= 0
      ? "QUOTE" : "FIXED",
    short_description: draft.shortDescription.trim() || null,
    description: draft.description.trim() || null,
    cover_media_id: draft.coverMediaId || null,
    is_featured: draft.publish && draft.featured,
    public_icon: draft.icon || "wrench",
    updated_by: userId,
  };

  if (linked) {
    const { error } = await supabase.from("services")
      .update(payload)
      .eq("organization_id", organizationId)
      .eq("id", linked.id);
    if (error) throw error;
    return;
  }

  // Vincular a página já existente, quando o nome corresponde a um único
  // serviço antigo. Não inventar outra página nem sobrescrever vínculos de OS.
  const { data: possible, error: possibleError } = await supabase.from("services")
    .select("id,general_service_id")
    .eq("organization_id", organizationId)
    .ilike("title", title)
    .is("general_service_id", null)
    .limit(2);
  if (possibleError) throw possibleError;
  if (possible?.length === 1) {
    const { error } = await supabase.from("services").update(payload)
      .eq("organization_id", organizationId).eq("id", possible[0].id).is("general_service_id", null);
    if (error) throw error;
    return;
  }

  const slug = await generateUniqueSlug("services", title);
  const { error } = await supabase.from("services").insert({
    ...payload,
    organization_id: organizationId,
    created_by: userId,
    slug,
    sort_order: 0,
  });
  if (error) throw error;
}
