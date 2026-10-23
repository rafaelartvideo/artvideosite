import { supabase } from "@/lib/supabase";
import { getArtVideoOrganizationId } from "@/lib/organization-identity";

export type SiteCategoryKind = "products" | "services";
export type SiteCategory = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
  icon: string | null;
  image_media_id: string | null;
};

const tableFor = (kind: SiteCategoryKind) =>
  kind === "products" ? "product_categories" : "service_categories";

export async function listCategories(kind: SiteCategoryKind = "services"): Promise<SiteCategory[]> {
  const organizationId = await getArtVideoOrganizationId();
  const { data, error } = await supabase
    .from(tableFor(kind))
    .select("id,name,slug,is_active,sort_order,icon,image_media_id")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SiteCategory[];
}

export async function saveCategory(
  payload: Record<string, unknown>,
  categoryId?: string,
  kind: SiteCategoryKind = "services",
): Promise<void> {
  const organizationId = await getArtVideoOrganizationId();
  const query = categoryId
    ? supabase.from(tableFor(kind)).update(payload).eq("organization_id", organizationId).eq("id", categoryId)
    : supabase.from(tableFor(kind)).insert({ ...payload, organization_id: organizationId });
  const { error } = await query;
  if (error) throw error;
}

export async function deleteCategory(categoryId: string, kind: SiteCategoryKind = "services"): Promise<void> {
  const organizationId = await getArtVideoOrganizationId();
  const { error } = await supabase
    .from(tableFor(kind)).delete().eq("organization_id", organizationId).eq("id", categoryId);
  if (error) throw error;
}

export async function setCategoryActive(
  categoryId: string,
  active: boolean,
  kind: SiteCategoryKind = "services",
): Promise<void> {
  const organizationId = await getArtVideoOrganizationId();
  const { error } = await supabase
    .from(tableFor(kind)).update({ is_active: active })
    .eq("organization_id", organizationId).eq("id", categoryId);
  if (error) throw error;
}
