import { supabase } from "@/lib/supabase";

export async function getServiceOrderLooseParts(organizationId: string, serviceOrderId: string) {
  const { data, error } = await supabase
    .from("service_orders")
    .select("id,loose_parts")
    .eq("organization_id", organizationId)
    .eq("id", serviceOrderId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("OS não encontrada nesta empresa.");
  return (data as any).loose_parts as string | null;
}

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

export async function saveServiceOrderLooseParts(
  organizationId: string,
  serviceOrderId: string,
  looseParts: string,
) {
  await assertServiceOrderOrganization(organizationId, serviceOrderId);

  const { data, error } = await (supabase as any).rpc("set_service_order_loose_parts", {
    p_service_order_id: serviceOrderId,
    p_loose_parts: looseParts,
  });

  if (error) throw error;
  return data as string | null;
}

export async function resolveServiceOrderWithLooseParts({
  organizationId,
  serviceOrderId,
  diagnosis,
  solution,
  looseParts,
  usedItems,
}: {
  organizationId: string;
  serviceOrderId: string;
  diagnosis: string;
  solution: string;
  looseParts: string;
  usedItems: Array<{ inventory_item_id: string; quantity: number }>;
}) {
  await assertServiceOrderOrganization(organizationId, serviceOrderId);

  return (supabase as any).rpc("resolve_service_order_with_loose_parts", {
    p_service_order_id: serviceOrderId,
    p_diagnosis: diagnosis,
    p_solution: solution,
    p_used_items: usedItems,
    p_loose_parts: looseParts,
  }) as Promise<{ data: any; error: any }>;
}
