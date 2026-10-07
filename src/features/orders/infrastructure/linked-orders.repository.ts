import { getActiveOrganizationId } from "@/lib/active-organization";
import { supabase } from "@/lib/supabase";

export type LinkedServiceOrder = {
  id: string;
  os_number: string | null;
  customer_name: string | null;
};

type LinkedOrderColumn = "situation_id" | "service_type_id";

function customerName(customer: unknown) {
  if (Array.isArray(customer)) {
    const first = customer[0] as { full_name?: string | null } | undefined;
    return first?.full_name ?? null;
  }
  if (customer && typeof customer === "object" && "full_name" in customer) {
    return String((customer as { full_name?: unknown }).full_name || "") || null;
  }
  return null;
}

async function listOrdersBy(column: LinkedOrderColumn, value: string): Promise<LinkedServiceOrder[]> {
  const organizationId = await getActiveOrganizationId();
  const pageSize = 500;
  const result: LinkedServiceOrder[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("service_orders")
      .select("id,os_number,created_at,customer:customers(full_name)")
      .eq("organization_id", organizationId)
      .eq(column, value)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const rows = data ?? [];
    result.push(...rows.map(row => ({
      id: String(row.id),
      os_number: row.os_number == null ? null : String(row.os_number),
      customer_name: customerName(row.customer),
    })));

    if (rows.length < pageSize) break;
  }

  return result;
}

export const listOrdersUsingSituation = (situationId: string) =>
  listOrdersBy("situation_id", situationId);

export const listOrdersUsingServiceType = (serviceTypeId: string) =>
  listOrdersBy("service_type_id", serviceTypeId);
