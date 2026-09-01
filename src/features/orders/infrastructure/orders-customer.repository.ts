import { supabase } from "@/lib/supabase";

export const createQuickCustomer = (payload: Record<string, unknown>) =>
  supabase.from("customers").insert(payload).select().single();

export const createQuickCustomerAddress = (
  payload: Record<string, unknown>,
) => supabase.from("customer_addresses").insert(payload);

export const updateOrderCustomer = (
  customerId: string,
  payload: Record<string, unknown>,
) => supabase.from("customers").update(payload).eq("id", customerId);

export const saveOrderCustomerAddress = (
  addressId: string | null,
  payload: Record<string, unknown>,
) =>
  addressId
    ? supabase.from("customer_addresses").update(payload).eq("id", addressId)
    : supabase.from("customer_addresses").insert(payload);

export const searchOrderCustomers = (query: string) =>
  supabase
    .from("customers")
    .select("id,customer_type,full_name,document,email,whatsapp,phone,trade_name,legal_name,cnpj,state_registration,foundation_date,birth_date,addresses:customer_addresses(*)")
    .or(`full_name.ilike.%${query}%,trade_name.ilike.%${query}%,document.ilike.%${query}%,cnpj.ilike.%${query}%,whatsapp.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(8);
