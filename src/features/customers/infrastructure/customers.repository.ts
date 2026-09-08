import { supabase } from "@/lib/supabase";

export async function listCustomers(organizationId: string) {
  const { data, error } = await supabase
    .from("customers")
    .select("*, addresses:customer_addresses(*)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function listCustomerEquipments(organizationId: string, customerId: string) {
  const { data, error } = await supabase
    .from("customer_equipments")
    .select("id,organization_id,customer_id,equipment_type_id,equipment_brand_id,equipment_model_id,equipment_type_name,equipment_brand_name,equipment_model_name,serial_number,technical_values,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getCustomerHistory(organizationId: string, customerId: string) {
  const [quotesResult, ordersResult] = await Promise.all([
    supabase
      .from("quote_requests")
      .select("id, protocol, created_at, status_id, estimated_price, final_price, customer_message, request_status:request_statuses(name), service:services(title), brand:brands(name)")
      .eq("organization_id", organizationId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("service_orders")
      .select("id, os_number, service:services(title), created_at, scheduled_at, completed_at, internal_notes, customer_notes, status_id, order_status:order_statuses(name,color)")
      .eq("organization_id", organizationId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
  ]);

  const error = quotesResult.error || ordersResult.error;
  if (error) throw error;

  return {
    quotes: quotesResult.data ?? [],
    orders: ordersResult.data ?? [],
  };
}

export async function updateCustomer(
  organizationId: string,
  customerId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("customers")
    .update(payload)
    .eq("organization_id", organizationId)
    .eq("id", customerId);

  if (error) throw error;
}

export async function saveCustomerAddress(
  organizationId: string,
  payload: Record<string, unknown>,
  addressId?: string,
) {
  const query = addressId
    ? supabase.from("customer_addresses").update(payload).eq("organization_id", organizationId).eq("id", addressId)
    : supabase.from("customer_addresses").insert({ ...payload, organization_id: organizationId });

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function createCustomer(organizationId: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("customers")
    .insert({ ...payload, organization_id: organizationId })
    .select()
    .single();

  if (error || !data) throw error ?? new Error("Cliente não criado.");
  return data;
}

export async function createCustomerAddress(
  organizationId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("customer_addresses").insert({ ...payload, organization_id: organizationId });
  if (error) throw error;
}

export async function fetchCnpjData(cnpj: string) {
  const digits = cnpj.replace(/\D/g, "");
  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
  if (!response.ok) {
    const message = response.status === 404
      ? "CNPJ não encontrado."
      : "Não foi possível consultar o CNPJ.";
    throw new Error(message);
  }
  return response.json();
}
