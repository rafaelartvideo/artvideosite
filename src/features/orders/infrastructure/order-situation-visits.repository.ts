import { getActiveOrganizationId } from "@/lib/active-organization";
import { supabase } from "@/lib/supabase";

export type ServiceOrderSituationVisit = {
  id: string;
  service_order_id: string;
  situation_id: string | null;
  service_type_id_snapshot: string | null;
  visit_number: number;
  situation_name_snapshot: string;
  situation_color_snapshot: string | null;
  entered_at: string;
  exited_at: string | null;
  sla_hours_snapshot: number | null;
  sla_due_at: string | null;
  entered_by: string | null;
  exited_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function listServiceOrderSituationVisits(serviceOrderId: string) {
  const organizationId = await getActiveOrganizationId();
  return supabase
    .from("service_order_situation_visits")
    .select("id,service_order_id,situation_id,service_type_id_snapshot,visit_number,situation_name_snapshot,situation_color_snapshot,entered_at,exited_at,sla_hours_snapshot,sla_due_at,entered_by,exited_by,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("service_order_id", serviceOrderId)
    .order("entered_at", { ascending: false });
}
