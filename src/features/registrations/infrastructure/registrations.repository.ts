import { supabase } from "@/lib/supabase";

export type RegistrationRole = "customer" | "employee" | "supplier";

export type SupplierInventoryItem = {
  id: string;
  name: string;
  sku: string | null;
  is_active: boolean;
};

export type Registration = {
  id: string;
  organization_id: string;
  person_type: "PF" | "PJ";
  name: string;
  legal_name: string | null;
  trade_name: string | null;
  document: string | null;
  state_registration: string | null;
  municipal_registration: string | null;
  birth_date: string | null;
  foundation_date: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  is_active: boolean;
  legacy_customer_id: string | null;
  legacy_employee_id: string | null;
  created_at: string;
  updated_at: string;
  roles?: Array<{ role: RegistrationRole; is_active: boolean }> | null;
  employee_details?: Array<{
    job_title: string | null;
    team_name: string | null;
    admission_date: string | null;
    profile_id: string | null;
    role_id: string | null;
    uniq_subscriber_id: string | null;
  }> | null;
  addresses?: Array<{
    id: string;
    type: string;
    zip_code: string | null;
    state: string | null;
    city: string | null;
    neighborhood: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    reference: string | null;
    location_url: string | null;
    is_primary: boolean;
    is_active: boolean;
  }> | null;
};

const REGISTRATION_SELECT = `
  id,organization_id,person_type,name,legal_name,trade_name,document,state_registration,municipal_registration,
  birth_date,foundation_date,phone,whatsapp,email,is_active,legacy_customer_id,legacy_employee_id,
  created_at,updated_at,
  roles:entity_roles(role,is_active),
  employee_details:entity_employee_details(job_title,team_name,admission_date,profile_id,role_id,uniq_subscriber_id),
  addresses:entity_addresses!entity_addresses_entity_organization_fkey(id,type,zip_code,state,city,neighborhood,street,number,complement,reference,location_url,is_primary,is_active)
`;

function normalizeRegistration<T extends Record<string, any> | null>(row: T): T {
  if (!row) return row;
  const employeeDetails = row.employee_details;
  if (employeeDetails && !Array.isArray(employeeDetails)) row.employee_details = [employeeDetails];
  return row;
}

export async function listRegistrations(organizationId: string) {
  const result = await supabase
    .from("entities")
    .select(REGISTRATION_SELECT)
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  return { ...result, data: result.data?.map(row => normalizeRegistration(row)) ?? result.data };
}

export async function getRegistration(organizationId: string, id: string) {
  const result = await supabase
    .from("entities")
    .select(REGISTRATION_SELECT)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  return { ...result, data: normalizeRegistration(result.data) };
}

export async function findRegistrationByDocument(
  organizationId: string,
  document: string,
  excludeRegistrationId?: string | null,
) {
  const digits = document.replace(/\D/g, "");
  if (!digits) return { data: null, error: null };
  let query = supabase
    .from("entities")
    .select("id,name,person_type,document")
    .eq("organization_id", organizationId)
    .eq("document", digits);
  if (excludeRegistrationId) query = query.neq("id", excludeRegistrationId);
  return query.maybeSingle();
}

export type SaveRegistrationInput = {
  id?: string | null;
  organizationId: string;
  entity: {
    person_type: "PF" | "PJ";
    name: string;
    legal_name?: string;
    trade_name?: string;
    document?: string;
    state_registration?: string;
    municipal_registration?: string;
    birth_date?: string;
    foundation_date?: string;
    phone?: string;
    whatsapp?: string;
    email?: string;
    is_active: boolean;
  };
  roles: RegistrationRole[];
  employee?: {
    job_title?: string;
    team_name?: string;
    admission_date?: string;
  };
};

export async function saveRegistration(input: SaveRegistrationInput) {
  const document = input.entity.document || "";
  if (document) {
    const existing = await findRegistrationByDocument(input.organizationId, document, input.id);
    if (existing.error) return { data: null, error: existing.error };
    if (existing.data) {
      return {
        data: null,
        error: new Error(`Cadastro já existente: ${existing.data.name}. Abra o cadastro existente para adicionar ou alterar vínculos.`),
      };
    }
  }

  return supabase.rpc("save_registration", {
    p_registration_id: input.id || null,
    p_organization_id: input.organizationId,
    p_entity: input.entity,
    p_roles: input.roles,
    p_employee: input.employee || {},
    p_address: null,
  });
}

export async function syncRegistrationAddresses(
  organizationId: string,
  registrationId: string,
  addresses: Array<Record<string, unknown>>,
) {
  return supabase.rpc("sync_registration_addresses", {
    p_registration_id: registrationId,
    p_organization_id: organizationId,
    p_addresses: addresses,
  });
}

export async function listSupplierInventoryItems(organizationId: string) {
  return supabase
    .from("inventory_items")
    .select("id,name,sku,is_active")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true });
}

export async function getRegistrationSupplierItems(organizationId: string, registrationId: string) {
  const links = await supabase
    .from("entity_supplier_items")
    .select("inventory_item_id")
    .eq("organization_id", organizationId)
    .eq("entity_id", registrationId);
  if (links.error || !links.data?.length) {
    return { data: [] as SupplierInventoryItem[], error: links.error };
  }
  const ids = links.data.map(row => String(row.inventory_item_id));
  const items = await supabase
    .from("inventory_items")
    .select("id,name,sku,is_active")
    .eq("organization_id", organizationId)
    .in("id", ids)
    .order("name", { ascending: true });
  return { data: (items.data || []) as SupplierInventoryItem[], error: items.error };
}

export async function syncRegistrationSupplierItems(
  organizationId: string,
  registrationId: string,
  inventoryItemIds: string[],
) {
  return supabase.rpc("sync_registration_supplier_items", {
    p_registration_id: registrationId,
    p_organization_id: organizationId,
    p_inventory_item_ids: inventoryItemIds,
  });
}
