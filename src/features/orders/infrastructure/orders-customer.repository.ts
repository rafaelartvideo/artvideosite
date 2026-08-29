import { supabase } from "@/lib/supabase";

export const createQuickCustomer = (payload: Record<string, unknown>) =>
  supabase.from("customers").insert(payload).select().single();

export const createQuickCustomerAddress = (
  payload: Record<string, unknown>,
) => supabase.from("customer_addresses").insert(payload);
