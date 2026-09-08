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
  const { data, error } = await supabase
    .from("service_orders")
    .update({ loose_parts: looseParts.trim() || null } as any)
    .eq("organization_id", organizationId)
    .eq("id", serviceOrderId)
    .select("id,loose_parts")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("OS não encontrada nesta empresa ou sem permissão para alteração.");
  return data;
}
