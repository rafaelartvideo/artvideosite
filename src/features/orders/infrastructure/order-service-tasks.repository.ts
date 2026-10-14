import { supabase } from "@/lib/supabase";

export type OrderServiceTaskStatus = "pending" | "in_progress" | "completed" | "cancelled";

export type OrderServiceTask = {
  item_id: string;
  assigned_employee_id: string | null;
  technician_name: string | null;
  status: OrderServiceTaskStatus;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
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
