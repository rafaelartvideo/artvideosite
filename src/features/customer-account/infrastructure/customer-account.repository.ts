import { supabase } from "@/lib/supabase";

export type CustomerPortalItem = {
  id: string;
  number: string;
  status: string;
  created_at: string;
  product_name?: string;
  description?: string;
  delivery_status?: string;
  total?: number;
};
export type CustomerPortal = {
  status: "ready" | "unlinked" | "verify_email";
  customer?: { name: string; email: string; phone: string | null };
  match_status?: "needs_cpf" | "matched" | "created" | "pending_review" | "approved" | "rejected";
  orders?: CustomerPortalItem[];
  quotes?: CustomerPortalItem[];
};
export type CustomerActivation = {
  status: "linked" | "verify_email" | "needs_name" | "invalid_phone" | "needs_review" | "needs_cpf" | "invalid_cpf";
};

export async function activateCustomerAccount(fullName?: string, phone?: string, cpf?: string): Promise<CustomerActivation> {
  const { data, error } = await supabase.rpc("artvideo_customer_activate_v2", {
    p_full_name: fullName || null,
    p_phone: phone || null,
    p_cpf: cpf || null,
  });
  if (error) throw error;
  return data as CustomerActivation;
}

export async function getCustomerPortal(): Promise<CustomerPortal> {
  const [portal, link] = await Promise.all([
    supabase.rpc("artvideo_customer_portal_v1"),
    supabase.rpc("artvideo_customer_link_status_v1"),
  ]);
  if (portal.error) throw portal.error;
  if (link.error) throw link.error;
  return { ...(portal.data as CustomerPortal), match_status: link.data?.status } as CustomerPortal;
}
