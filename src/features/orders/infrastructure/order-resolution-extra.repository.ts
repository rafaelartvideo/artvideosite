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

export async function saveServiceOrderLooseParts(
  organizationId: string,
  serviceOrderId: string,
  looseParts: string,
) {
  const { data: scopedOrder, error: scopeError } = await supabase
    .from("service_orders")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", serviceOrderId)
    .maybeSingle();

  if (scopeError) throw scopeError;
  if (!scopedOrder) throw new Error("OS não encontrada nesta empresa ou sem acesso.");

  const { data, error } = await (supabase as any).rpc("set_service_order_loose_parts", {
    p_service_order_id: serviceOrderId,
    p_loose_parts: looseParts,
  });

  if (error) throw error;
  return data as string | null;
}
