import { supabase } from "@/lib/supabase";
import { getActiveOrganizationId } from "@/lib/active-organization";
import type { GeneralService } from "@/lib/database.types";

const generalServiceColumns = "id,name,price,price_at_completion,max_discount_percentage,max_discount_amount,is_active,sort_order,created_at,updated_at,organization_id";

type GeneralServiceWrite = Pick<
  GeneralService,
  "name" | "price" | "price_at_completion" | "max_discount_percentage" | "max_discount_amount" | "is_active" | "sort_order"
>;

export async function listGeneralServices(): Promise<GeneralService[]> {
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase
    .from("general_services")
    .select(generalServiceColumns)
    .eq("organization_id", organizationId)
    .order("sort_order")
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function createGeneralService(service: GeneralServiceWrite): Promise<void> {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase.from("general_services").insert({ ...service, organization_id: organizationId });
  if (error) throw error;
}

export async function updateGeneralService(
  id: string,
  service: Partial<GeneralServiceWrite>,
): Promise<void> {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase
    .from("general_services")
    .update(service)
    .eq("id", id)
    .eq("organization_id", organizationId);
  if (error) throw error;
}

export async function setGeneralServiceActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase
    .from("general_services")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) throw error;
}
