import { supabase } from "@/lib/supabase";

export type OrderServiceTaskStatus = "pending" | "in_progress" | "completed" | "cancelled";

export type OrderServiceTask = {
  item_id: string;
  assigned_employee_id: string | null;
  technician_name: string | null;
  technicians?: OrderServiceTechnician[];
  status: OrderServiceTaskStatus;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
  execution_report?: string | null;
  start_location?: { lat: number | null; lng: number | null; accuracy_m: number | null; captured_at: string | null } | null;
  finish_location?: { lat: number | null; lng: number | null; accuracy_m: number | null; captured_at: string | null } | null;
};

export type OrderServiceTechnician = {
  id: string;
  name: string;
};

export async function listOrderServiceTasks(serviceOrderId: string): Promise<OrderServiceTask[]> {
  const { data, error } = await supabase.rpc("list_order_service_tasks_v1", {
    p_service_order_id: serviceOrderId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data as OrderServiceTask[] : [];
}

export async function listOrderServiceTechnicians(serviceOrderId: string): Promise<OrderServiceTechnician[]> {
  const { data, error } = await supabase.rpc("list_order_service_technicians_v1", {
    p_service_order_id: serviceOrderId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data as OrderServiceTechnician[] : [];
}

export async function setOrderServiceTask(input: {
  itemId: string;
  employeeId: string | null;
  status: OrderServiceTaskStatus;
}): Promise<OrderServiceTask> {
  const { data, error } = await supabase.rpc("set_order_service_task_v1", {
    p_item_id: input.itemId,
    p_employee_id: input.employeeId,
    p_status: input.status,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("O servidor não retornou o andamento do serviço.");
  return data as OrderServiceTask;
}

export async function setOrderServiceTaskTechnicians(itemId: string, employeeIds: string[]) {
  const { data, error } = await supabase.rpc("set_order_service_task_technicians_v1", {
    p_item_id: itemId,
    p_employee_ids: employeeIds,
  });
  if (error) throw error;
  return data as { item_id: string; technicians: OrderServiceTechnician[] };
}

export async function setOrderServiceTaskSchedule(input: {
  itemId: string;
  startAt: string | null;
  endAt: string | null;
}): Promise<{ item_id: string; scheduled_start_at: string | null; scheduled_end_at: string | null }> {
  const { data, error } = await supabase.rpc("set_order_service_task_schedule_v1", {
    p_item_id: input.itemId,
    p_start_at: input.startAt,
    p_end_at: input.endAt,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("Não foi possível confirmar o agendamento do serviço.");
  return data as { item_id: string; scheduled_start_at: string | null; scheduled_end_at: string | null };
}

export type OrderTaskPhoto = {
  id: string;
  item_id: string;
  path: string;
  created_at: string;
};

export async function listOrderTaskPhotos(serviceOrderId: string): Promise<OrderTaskPhoto[]> {
  const { data, error } = await supabase.rpc("list_order_service_task_photos_v1", {
    p_service_order_id: serviceOrderId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data as OrderTaskPhoto[] : [];
}

export async function createOrderTaskPhotoUrl(path: string) {
  const { data, error } = await supabase.storage.from("technician-task-photos")
    .createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw error || new Error("Não foi possível abrir a foto do serviço.");
  return data.signedUrl;
}
