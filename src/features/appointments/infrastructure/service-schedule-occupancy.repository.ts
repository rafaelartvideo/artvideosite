import { supabase } from "@/lib/supabase";

export type VisibleServiceTaskSchedule = {
  item_id: string;
  service_order_id: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  status: string;
  assigned_employee_id: string | null;
  assignees: Array<{ employee_id: string; employee: { id: string; full_name: string } | null }>;
  item?: { title_snapshot: string; general_service_id: string | null } | null;
  order?: { id: string; os_number: string | number | null;
    customer: { full_name: string | null } | null;
    order_status: { id: string | null; color: string | null } | null;
    situation: { id: string | null } | null } | null;
};

export async function loadVisibleServiceTaskSchedules(
  organizationId: string, from: string, until: string,
): Promise<VisibleServiceTaskSchedule[]> {
  const { data, error } = await supabase.rpc("list_visible_service_task_schedules_v1", {
    p_organization_id: organizationId,
    p_from: from,
    p_until: until,
  });
  if (error) throw error;
  return Array.isArray(data) ? data as VisibleServiceTaskSchedule[] : [];
}
