import { supabase } from "@/lib/supabase";
import type { GeneralService } from "@/lib/database.types";

const generalServiceColumns = "id,name,is_active,sort_order,created_at,updated_at";

export async function listGeneralServices(): Promise<GeneralService[]> {
  const { data, error } = await supabase
    .from("general_services")
    .select(generalServiceColumns)
    .order("sort_order")
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function createGeneralService(
  service: Pick<GeneralService, "name" | "is_active" | "sort_order">,
): Promise<void> {
  const { error } = await supabase.from("general_services").insert(service);
  if (error) throw error;
}

export async function updateGeneralService(
  id: string,
  service: Partial<Pick<GeneralService, "name" | "is_active" | "sort_order">>,
): Promise<void> {
  const { error } = await supabase.from("general_services").update(service).eq("id", id);
  if (error) throw error;
}

export async function setGeneralServiceActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("general_services")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) throw error;
}
