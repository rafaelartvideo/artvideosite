import { supabase } from "@/lib/supabase";

export type NfseDraft = {
  id: string;
  organization_id: string;
  source_order_id: string | null;
  source_order_number_snapshot: string | null;
  customer_name_snapshot: string | null;
  status: "draft";
  services_gross_total: number;
  services_net_total: number;
  created_at: string;
};
export type FiscalCompanySettings = {
  organization_id: string;
  tax_regime: string;
  municipal_registration: string | null;
  municipality_ibge_code: string | null;
  default_service_code: string | null;
  fiscal_contact_email: string | null;
  accounting_notes: string | null;
  emission_enabled: false;
  automatic_emission_enabled: false;
};
export type FiscalServiceMapping = {
  organization_id: string;
  general_service_id: string;
  national_service_code: string | null;
  municipal_service_code: string | null;
  national_taxation_code: string | null;
  suggested_iss_rate: number | null;
};

function requireOrganizationId(id: string | null): string {
  if (!id) throw new Error("Selecione uma empresa antes de acessar NFS-e.");
  return id;
}

export async function listNfseDrafts(organizationId: string, page: number, search: string) {
  const id = requireOrganizationId(organizationId);
  const term = search.trim().replace(/[,%()]/g, "").slice(0, 80);
  let q = supabase.from("fiscal_documents")
    .select("id,organization_id,source_order_id,source_order_number_snapshot,customer_name_snapshot,status,services_gross_total,services_net_total,created_at", { count: "exact" })
    .eq("organization_id", id)
    .eq("document_type", "nfse")
    .order("created_at", { ascending: false })
    .range(page * 10, page * 10 + 9);
  if (term) q = /\d/.test(term[0]) ? q.ilike("source_order_number_snapshot", `%${term}%`) : q.ilike("customer_name_snapshot", `%${term}%`);
  const { data, count, error } = await q;
  if (error) throw error;
  return { items: (data || []) as NfseDraft[], total: count || 0 };
}

export async function getFiscalCompanySettings(organizationId: string) {
  const { data, error } = await supabase.from("fiscal_company_settings")
    .select("organization_id,tax_regime,municipal_registration,municipality_ibge_code,default_service_code,fiscal_contact_email,accounting_notes,emission_enabled,automatic_emission_enabled")
    .eq("organization_id", requireOrganizationId(organizationId))
    .maybeSingle();
  if (error) throw error;
  return data as FiscalCompanySettings | null;
}

export async function saveFiscalCompanySettings(input: Omit<FiscalCompanySettings, "emission_enabled" | "automatic_emission_enabled">) {
  const { error } = await supabase.from("fiscal_company_settings")
    .upsert({ ...input, emission_enabled: false, automatic_emission_enabled: false }, { onConflict: "organization_id" });
  if (error) throw error;
}

export async function listFiscalServiceMappings(organizationId: string, page: number) {
  const org = requireOrganizationId(organizationId);
  const { data: services, count, error } = await supabase.from("general_services")
    .select("id,name", { count: "exact" })
    .eq("organization_id", org).order("name").range(page * 10, page * 10 + 9);
  if (error) throw error;
  const ids = (services || []).map(s => s.id);
  if (!ids.length) return { items: [], total: count || 0 };
  const { data: mappings, error: mappingError } = await supabase.from("fiscal_service_mappings")
    .select("organization_id,general_service_id,national_service_code,municipal_service_code,national_taxation_code,suggested_iss_rate")
    .eq("organization_id", org).in("general_service_id", ids);
  if (mappingError) throw mappingError;
  const byServiceId = new Map((mappings || []).map(m => [m.general_service_id, m]));
  return {
    items: (services || []).map(service => ({
      id: service.id, name: service.name,
      mapping: (byServiceId.get(service.id) || null) as FiscalServiceMapping | null,
    })),
    total: count || 0,
  };
}

export async function saveFiscalServiceMapping(input: FiscalServiceMapping) {
  const { error } = await supabase.from("fiscal_service_mappings").upsert(input, { onConflict: "organization_id,general_service_id" });
  if (error) throw error;
}

export async function previewOrderNfseServices(organizationId: string, orderId: string) {
  const org = requireOrganizationId(organizationId);
  const { data: order, error: orderError } = await supabase.from("service_orders")
    .select("id,os_number").eq("organization_id", org).eq("id", orderId).single();
  if (orderError) throw orderError;
  const { data, error } = await supabase.from("service_order_items")
    .select("id,title_snapshot,description_snapshot,quantity,unit_price,subtotal,item_type")
    .eq("organization_id", org).eq("service_order_id", orderId)
    .in("item_type", ["service", "custom_service"]);
  if (error) throw error;
  return {
    order,
    items: data || [],
    total: (data || []).reduce((sum, item) => sum + Number(item.subtotal ?? Number(item.quantity) * Number(item.unit_price || 0)), 0),
  };
}

export async function prepareNfseDraftFromOrder(orderId: string) {
  const { data, error } = await supabase.rpc("create_nfse_draft_from_order_v1", { p_service_order_id: orderId });
  if (error) throw error;
  return String(data);
}
