import { supabase } from "@/lib/supabase";

export type CustomerServiceOrder = {
  id: string; os_number: string; description: string; status: string;
  /** Situação atual vinculada à OS, independente do status administrativo. */
  situation_name?: string | null;
  situation_color?: string | null;
  /** Equipamento + marca/modelo, sem utilizar a descrição do serviço. */
  equipment?: string | null;
  model?: string; created_at: string; scheduled_at?: string|null;
  completed_at?: string|null; cancelled_at?: string|null;
};
export type CustomerOrderDetails = {
  order: CustomerServiceOrder & {
    status_slug:string; started_at:string|null; cancelled_at:string|null;
    problem:string;serial_number:string;accessories:string;
    equipment_type:string;brand:string;equipment_model:string;
  };
  situations:{id:string;name:string;color:string|null;visited:boolean;current:boolean}[];
  items:{title:string;description:string;quantity:number;item_type:string}[];
  photos:{id:string;name:string;mime_type:string}[];
  documents:{
    id:string;title:string;signed_at:string|null;type:"signature"|"invoice";
    created_at?:string|null;file_name?:string|null;mime_type?:string|null;
  }[];
  certificate:{id:string;number:number;issued_at:string;starts_at:string;expires_at:string;warranty:string}|null;
};
export type CustomerSignatureRequest = {
  id:string;service_order_id:string;os_number:string;title:string;created_at:string;
  signed_at:string|null;expires_at:string;status:string;
  customer_status:"pending"|"signed"|"cancelled"|"expired";downloadable:boolean;
};
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
  crm_access?: boolean;
  crm_profile?: {name:string;cpf:string;whatsapp:string;address?:{street:string;number:string;neighborhood:string;city:string;state:string;zip_code:string;complement?:string|null}|null};
  service_orders?: CustomerServiceOrder[];
  documents?: {id:string;os_number:string;title:string;signed_at:string}[];
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
    supabase.rpc("artvideo_customer_portal_extended_v1"),
    supabase.rpc("artvideo_customer_link_status_v1"),
  ]);
  if (portal.error) throw portal.error;
  if (link.error) throw link.error;
  return { ...(portal.data as CustomerPortal), match_status: link.data?.status } as CustomerPortal;
}
