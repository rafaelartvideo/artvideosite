import { supabase } from "@/lib/supabase";
import { getArtVideoOrganizationId } from "@/lib/organization-identity";

export async function listBrands() {
  const organizationId = await getArtVideoOrganizationId();
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .eq("organization_id", organizationId)
    .order("sort_order");

  if (error) throw error;
  return data ?? [];
}

export async function saveBrand(
  payload: Record<string, unknown>,
  brandId?: string,
) {
  const organizationId = await getArtVideoOrganizationId();
  const query = brandId
    ? supabase.from("brands").update(payload).eq("organization_id", organizationId).eq("id", brandId)
    : supabase.from("brands").insert({ ...payload, organization_id: organizationId });

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function deleteBrand(brandId: string): Promise<void> {
  const organizationId = await getArtVideoOrganizationId();
  const { error } = await supabase.from("brands").delete().eq("organization_id", organizationId).eq("id", brandId);
  if (error) throw error;
}

export async function setBrandActive(
  brandId: string,
  isActive: boolean,
): Promise<void> {
  const organizationId = await getArtVideoOrganizationId();
  const { error } = await supabase
    .from("brands")
    .update({ is_active: isActive })
    .eq("organization_id", organizationId)
    .eq("id", brandId)
    .select("id")
    .single();

  if (error) throw error;
}
