import { supabase } from "@/lib/supabase";

export type CustomerWhatsappConflict = {
  customer_id: string;
  customer_name: string;
};

// A função RPC só retorna dados dentro da empresa e para perfis autorizados.
export async function findCustomerWhatsappConflict(
  organizationId: string,
  whatsapp: string,
  excludeCustomerId?: string | null,
): Promise<CustomerWhatsappConflict | null> {
  if (!organizationId || whatsapp.replace(/\D/g, "").length < 10) return null;
  const { data, error } = await supabase.rpc("customer_whatsapp_duplicate_v1", {
    p_organization_id: organizationId,
    p_whatsapp: whatsapp,
    p_exclude_customer_id: excludeCustomerId || null,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || !data.customer_id) return null;
  return {
    customer_id: String(data.customer_id),
    customer_name: String(data.customer_name || "outro cadastro"),
  };
}

export function duplicateWhatsappMessage(conflict: CustomerWhatsappConflict): string {
  return "WhatsApp já cadastrado para " + conflict.customer_name + ". Abra o cadastro existente ou informe outro número.";
}

export function isDuplicateCustomerWhatsappError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  const message = String(record.message || "");
  return (record.code === "23505" && /whatsapp|customers_whatsapp_unique_per_organization/i.test(message + " " + (record.details || "")))
    || /whatsapp já cadastrado/i.test(message);
}
