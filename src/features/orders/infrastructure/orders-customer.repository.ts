import { supabase } from "@/lib/supabase";

export const createQuickCustomer = (organizationId: string, payload: Record<string, unknown>) =>
  supabase.from("customers").insert({ ...payload, organization_id: organizationId }).select().single();

export const createQuickCustomerAddress = (
  organizationId: string,
  payload: Record<string, unknown>,
) => supabase.from("customer_addresses").insert({ ...payload, organization_id: organizationId });

export const getQuickCustomerDefaultAddress = (organizationId: string, customerId: string) =>
  supabase
    .from("customer_addresses")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

export const updateOrderCustomer = (
  organizationId: string,
  customerId: string,
  payload: Record<string, unknown>,
) => supabase.from("customers").update(payload).eq("organization_id", organizationId).eq("id", customerId);

export const saveOrderCustomerAddress = (
  organizationId: string,
  addressId: string | null,
  payload: Record<string, unknown>,
) =>
  addressId
    ? supabase.from("customer_addresses").update(payload).eq("organization_id", organizationId).eq("id", addressId)
    : supabase.from("customer_addresses").insert({ ...payload, organization_id: organizationId });

export const searchOrderCustomers = (organizationId: string, query: string) =>
  supabase
    .from("customers")
    .select("id,customer_type,full_name,document,email,whatsapp,phone,trade_name,legal_name,cnpj,state_registration,foundation_date,birth_date,addresses:customer_addresses(*)")
    .eq("organization_id", organizationId)
    .or(`full_name.ilike.%${query}%,trade_name.ilike.%${query}%,document.ilike.%${query}%,cnpj.ilike.%${query}%,whatsapp.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(8);
