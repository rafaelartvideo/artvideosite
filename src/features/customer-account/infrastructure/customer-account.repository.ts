import { supabase } from "@/lib/supabase";

export type CustomerPortalItem = {
  id: string;
  number: string;
  status: string;
  created_at: string;
  product_name?: string;
  equipment?: string;
  description?: string;
  delivery_status?: string;
  total?: number;
};
export type CustomerPortal = {
  status: "ready" | "unlinked" | "verify_email";
  customer?: { name: string; email: string; phone: string | null };
  orders?: CustomerPortalItem[];
  services?: CustomerPortalItem[];
  quotes?: CustomerPortalItem[];
};
export type CustomerActivation = {
  status: "linked" | "verify_email" | "needs_name" | "invalid_phone" | "needs_review";
};

export async function activateCustomerAccount(fullName?: string, phone?: string): Promise<CustomerActivation> {
  const { data, error } = await supabase.rpc("artvideo_customer_activate_v1", {
    p_full_name: fullName || null,
    p_phone: phone || null,
  });
  if (error) throw error;
  return data as CustomerActivation;
}

export async function getCustomerPortal(): Promise<CustomerPortal> {
  const { data, error } = await supabase.rpc("artvideo_customer_portal_v1");
  if (error) throw error;
  return data as CustomerPortal;
}
