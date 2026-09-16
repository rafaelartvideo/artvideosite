import { supabase } from "@/lib/supabase";

export type ServiceOrderSolutionAttemptItem = {
  id: string;
  inventory_item_id: string;
  inventory_name_snapshot: string;
  unit_snapshot: string;
  quantity: number;
  unit_sale_price: number | null;
  total_sale_price: number | null;
};

export type ServiceOrderSolutionAttemptMedia = {
  id: string;
  media_id: string;
  sort_order: number;
  file_name_snapshot: string;
  media?: {
    id: string;
    file_name: string;
    bucket_id: string;
    storage_path: string;
    mime_type?: string | null;
  } | null;
};

export type ServiceOrderSolutionAttempt = {
  id: string;
  organization_id: string;
  service_order_id: string;
  attempt_number: number;
  diagnosis: string;
  solution: string;
  loose_parts: string | null;
  solved_at: string;
  solved_by: string | null;
  reverted_at: string | null;
  reverted_by: string | null;
  revert_reason: string | null;
  created_at: string;
  solved_by_profile?: { id: string; full_name: string | null } | null;
  reverted_by_profile?: { id: string; full_name: string | null } | null;
  items?: ServiceOrderSolutionAttemptItem[];
  media?: ServiceOrderSolutionAttemptMedia[];
};

async function assertServiceOrderOrganization(organizationId: string, serviceOrderId: string) {
  const { data, error } = await supabase
    .from("service_orders")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", serviceOrderId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("OS não encontrada nesta empresa ou sem acesso.");
}

export async function listServiceOrderSolutionAttempts(
  organizationId: string,
  serviceOrderId: string,
): Promise<ServiceOrderSolutionAttempt[]> {
  await assertServiceOrderOrganization(organizationId, serviceOrderId);

  const { data, error } = await (supabase as any)
    .from("service_order_solution_attempts")
    .select(`
      id,
      organization_id,
      service_order_id,
      attempt_number,
      diagnosis,
      solution,
      loose_parts,
      solved_at,
      solved_by,
      reverted_at,
      reverted_by,
      revert_reason,
      created_at,
      solved_by_profile:profiles!service_order_solution_attempts_solved_by_fkey(id,full_name),
      reverted_by_profile:profiles!service_order_solution_attempts_reverted_by_fkey(id,full_name),
      items:service_order_solution_attempt_items(
        id,
        inventory_item_id,
        inventory_name_snapshot,
        unit_snapshot,
        quantity,
        unit_sale_price,
        total_sale_price
      ),
      media:service_order_solution_attempt_media(
        id,
        media_id,
        sort_order,
        file_name_snapshot,
        media:media(id,file_name,bucket_id,storage_path,mime_type)
      )
    `)
    .eq("organization_id", organizationId)
    .eq("service_order_id", serviceOrderId)
    .order("attempt_number", { ascending: false });

  if (error) throw error;
  return (data || []) as ServiceOrderSolutionAttempt[];
}

export async function undoServiceOrderSolution({
  organizationId,
  serviceOrderId,
  reason,
}: {
  organizationId: string;
  serviceOrderId: string;
  reason: string;
}) {
  await assertServiceOrderOrganization(organizationId, serviceOrderId);

  const { data, error } = await (supabase as any).rpc("undo_service_order_solution", {
    p_service_order_id: serviceOrderId,
    p_reason: reason,
  });

  if (error) throw error;
  return data as {
    success: boolean;
    service_order_id: string;
    reverted_attempt_id: string;
    solution_count: number;
    parts_return_pending: boolean;
  };
}
