import { supabase } from "@/lib/supabase";

export async function findQuickCustomerByTaxId(
  organizationId: string,
  customerType: "PF" | "PJ",
  value: string,
) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return { data: null, error: null };
  return supabase
    .from("customers")
    .select("id,full_name,trade_name,legal_name")
    .eq("organization_id", organizationId)
    .eq(customerType === "PF" ? "document" : "cnpj", digits)
    .maybeSingle();
}


export const createQuickCustomer = (organizationId: string, payload: Record<string, unknown>) =>
  supabase.from("customers").insert({ ...payload, organization_id: organizationId }).select().single();

export const createQuickCustomerAddress = (
  organizationId: string,
  payload: Record<string, unknown>,
) => supabase
  .from("customer_addresses")
  .upsert({ ...payload, organization_id: organizationId }, { onConflict: "id" })
  .select()
  .single();

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

export const searchOrderCustomers = (organizationId: string, query: string, signal?: AbortSignal) => {
  const term = query.trim();
  const digits = term.replace(/\D/g, "");
  const numericOnly = /^[\d\s./()+-]+$/.test(term);
  const text = term.replace(/[%(),]/g, " ").trim().replace(/\s+/g, "%");
  const conditions: string[] = [];

  // Nomes continuam sendo pesquisados como texto. CPF, CNPJ e telefones
  // são comparados apenas pelos dígitos, com ou sem máscara no cadastro.
  if (text && !numericOnly) {
    conditions.push(
      `full_name.ilike.%${text}%`,
      `trade_name.ilike.%${text}%`,
      `legal_name.ilike.%${text}%`,
    );
  }
  if (digits) {
    const pattern = `%${digits.split("").join("%")}%`;
    conditions.push(
      `document.ilike.${pattern}`,
      `cnpj.ilike.${pattern}`,
      `whatsapp.ilike.${pattern}`,
      `phone.ilike.${pattern}`,
    );
  }
  if (!conditions.length) return Promise.resolve({ data: [], error: null });

  const request = supabase
    .from("customers")
    .select("id,customer_type,full_name,document,whatsapp,phone,trade_name,legal_name,cnpj")
    .eq("organization_id", organizationId)
    .or(conditions.join(","))
    .limit(8);
  return signal ? request.abortSignal(signal) : request;
};


export const getOrderCustomerById = (organizationId: string, customerId: string, signal?: AbortSignal) => {
  const request = supabase
    .from("customers")
    .select("id,customer_type,full_name,document,email,whatsapp,phone,trade_name,legal_name,cnpj,state_registration,foundation_date,birth_date,gender,addresses:customer_addresses(*)")
    .eq("organization_id", organizationId)
    .eq("id", customerId);
  return (signal ? request.abortSignal(signal) : request).maybeSingle();
};

/** Only fill missing verified CPF fields after the order has actually been saved.
 * Conditional updates avoid overwriting concurrent edits or a different CPF. */
export async function completeIntakeCustomerDemographics(organizationId:string, customerId:string, verified:{document:string;birthDate?:string|null;gender?:string|null}) {
  const document=verified.document.replace(/\D/g,"");
  if(document.length!==11)return;
  if(verified.birthDate&&/^\d{4}-\d{2}-\d{2}$/.test(verified.birthDate)){
    const {error}=await supabase.from("customers").update({birth_date:verified.birthDate}).eq("organization_id",organizationId).eq("id",customerId).eq("document",document).is("birth_date",null);
    if(error)throw error;
  }
  if(verified.gender&&["M","F","I"].includes(verified.gender)){
    const {error}=await supabase.from("customers").update({gender:verified.gender}).eq("organization_id",organizationId).eq("id",customerId).eq("document",document).or("gender.is.null,gender.eq.");
    if(error)throw error;
  }
}
