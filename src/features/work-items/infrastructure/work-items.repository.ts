import { supabase } from "@/lib/supabase";

export type WorkKind = "task" | "commitment";
export type WorkStatus = "pending" | "in_progress" | "waiting" | "completed" | "cancelled";
export type WorkPriority = "low" | "normal" | "high" | "urgent";
export type WorkOutcome = "fulfilled" | "not_fulfilled" | "no_show" | "cancelled";
export type WorkItem = {
  id: string;
  organization_id: string;
  kind: WorkKind;
  title: string;
  description: string;
  status: WorkStatus;
  outcome: WorkOutcome | null;
  priority: WorkPriority;
  category: string;
  starts_at: string | null;
  due_at: string | null;
  reminder_minutes: number[];
  assigned_employee_ids: string[];
  customer_id: string | null;
  service_order_id: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  customer?: { id: string; full_name: string; trade_name: string | null; whatsapp: string | null } | null;
  service_order?: { id: string; os_number: number | string } | null;
  checklist?: Array<{ done: boolean }>;
};
export type WorkEmployee = { id: string; full_name: string; profile_id: string | null };
export type WorkChecklist = { id: string; work_item_id: string; label: string; done: boolean; sort_order: number };
export type WorkActivity = { id: number; work_item_id: string; actor_user_id: string | null; action: string; note: string | null; created_at: string };

const itemFields = "*,customer:customers(id,full_name,trade_name,whatsapp),service_order:service_orders(id,os_number),checklist:work_item_checklist(done)";

export async function loadWorkItems(organizationId: string): Promise<WorkItem[]> {
  const { data, error } = await supabase.from("work_items")
    .select(itemFields).eq("organization_id", organizationId)
    .order("created_at", { ascending: false }).limit(1000);
  if (error) throw error;
  return (data || []) as unknown as WorkItem[];
}

export async function loadWorkEmployees(organizationId: string): Promise<WorkEmployee[]> {
  const { data, error } = await supabase.rpc("list_work_item_employees_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return (data || []) as WorkEmployee[];
}

export async function findWorkCustomers(organizationId: string, term: string) {
  const digits = term.replace(/\D/g, "");
  const text = term.trim().replace(/[%(),]/g, " ").replace(/\s+/g, "%");
  const clauses = [];
  if (text && !/^[\d\s./()+-]+$/.test(term)) {
    clauses.push("full_name.ilike.%" + text + "%", "trade_name.ilike.%" + text + "%");
  }
  if (digits) {
    const pattern = "%" + digits.split("").join("%") + "%";
    clauses.push("document.ilike." + pattern, "cnpj.ilike." + pattern);
  }
  if (!clauses.length) return [];
  const { data, error } = await supabase.from("customers")
    .select("id,full_name,trade_name,whatsapp")
    .eq("organization_id", organizationId).or(clauses.join(","))
    .limit(6);
  if (error) throw error;
  return data || [];
}

export async function findCustomerWorkOrders(organizationId: string, customerId: string) {
  const { data, error } = await supabase.rpc("list_work_item_customer_orders_v1", {
    p_organization_id: organizationId,
    p_customer_id: customerId,
  });
  if (error) throw error;
  return data || [];
}

export type WorkItemDraft = Pick<WorkItem, "kind" | "title" | "description" | "status" | "outcome" |
  "priority" | "category" | "starts_at" | "due_at" | "reminder_minutes" | "assigned_employee_ids" |
  "customer_id" | "service_order_id">;

export async function saveWorkItem(organizationId: string, draft: WorkItemDraft, id?: string) {
  const payload = { ...draft, organization_id: organizationId, title: draft.title.trim(), description: draft.description.trim() };
  const request = id
    ? supabase.from("work_items").update(payload).eq("organization_id", organizationId).eq("id", id)
    : supabase.from("work_items").insert(payload);
  const { data, error } = await request.select(itemFields).single();
  if (error) throw error;
  return data as unknown as WorkItem;
}

export async function updateWorkStatus(organizationId: string, item: WorkItem, status: WorkStatus, outcome: WorkOutcome | null = null) {
  const { data, error } = await supabase.from("work_items")
    .update({ status, outcome }).eq("organization_id", organizationId).eq("id", item.id)
    .select(itemFields).single();
  if (error) throw error;
  return data as unknown as WorkItem;
}

export async function loadWorkDetails(organizationId: string, id: string) {
  const [checklist, activity] = await Promise.all([
    supabase.from("work_item_checklist").select("id,work_item_id,label,done,sort_order")
      .eq("organization_id", organizationId).eq("work_item_id", id).order("sort_order"),
    supabase.from("work_item_activity").select("id,work_item_id,actor_user_id,action,note,created_at")
      .eq("organization_id", organizationId).eq("work_item_id", id)
      .order("created_at", { ascending: false }).limit(30),
  ]);
  if (checklist.error) throw checklist.error;
  if (activity.error) throw activity.error;
  return { checklist: (checklist.data || []) as WorkChecklist[], activity: (activity.data || []) as WorkActivity[] };
}

export async function addWorkChecklistItem(organizationId: string, itemId: string, label: string, order: number) {
  const { error } = await supabase.from("work_item_checklist")
    .insert({ organization_id: organizationId, work_item_id: itemId, label: label.trim(), sort_order: order });
  if (error) throw error;
}
export async function updateWorkChecklistItem(organizationId: string, id: string, done: boolean) {
  const { error } = await supabase.from("work_item_checklist").update({ done })
    .eq("organization_id", organizationId).eq("id", id);
  if (error) throw error;
}
export async function removeWorkChecklistItem(organizationId: string, id: string) {
  const { error } = await supabase.from("work_item_checklist").delete()
    .eq("organization_id", organizationId).eq("id", id);
  if (error) throw error;
}
export function subscribeWorkItems(organizationId: string, onChange: () => void) {
  const channel = supabase.channel("work-items:" + organizationId)
    .on("postgres_changes", { event: "*", schema: "public", table: "work_items", filter: "organization_id=eq." + organizationId }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "work_item_checklist", filter: "organization_id=eq." + organizationId }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}