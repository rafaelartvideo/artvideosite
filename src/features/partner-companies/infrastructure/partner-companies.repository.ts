import { supabase } from "@/lib/supabase";
import { getPlatformOperatorOrganizationId } from "@/lib/organization-identity";
import { PartnerCompanyError, toPartnerCompanyError, toPartnerFunctionError } from "./partner-companies.errors";

export type PartnerCompanySettings = {
  person_type?: "PF" | "PJ";
  phone?: string;
  whatsapp?: string;
  email?: string;
  state_registration?: string;
  municipal_registration?: string;
  birth_date?: string;
  zip_code?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  company_logo_media_id?: string;
  menu_logo_media_id?: string;
};

export type PartnerCompanyInput = {
  name: string;
  legal_name: string | null;
  document: string | null;
  slug: string;
  status: "active" | "suspended" | "cancelled";
  settings?: PartnerCompanySettings;
};

export type PartnerUserInput = {
  organization_id: string;
  full_name: string;
  cpf: string;
  birth_date?: string | null;
  phone: string | null;
  email: string;
  username?: string;
  password?: string;
  function_name: string | null;
  role_id: string;
  is_owner: boolean;
  is_active: boolean;
  user_id?: string;
};

export type PartnerCompanyPageInput = {
  page: number;
  pageSize: number;
};

export type PartnerCompanyPage = {
  items: any[];
  total: number;
};

export type PartnerMonitoredServiceTypeDraft = {
  title: string;
  description?: string | null;
  forecast_days?: number | null;
};

export type PartnerServiceTypeMonitoring = {
  id: string;
  title: string;
  description: string | null;
  forecast_days: number | null;
  is_active: boolean;
  sort_order: number;
  is_monitored: boolean;
};

// `manage` permanece somente para leitura de registros legados já existentes.
// Novas configurações de compartilhamento da Union World são estritamente de consulta.
export type PartnerShareAccessLevel = "none" | "summary" | "read" | "manage";
export type PartnerShareConfigLevel = Exclude<PartnerShareAccessLevel, "manage">;

const COMPANY_SELECT = "id,name,legal_name,document,slug,status,settings,created_at,updated_at";

export async function listPartnerCompanies({ page, pageSize }: PartnerCompanyPageInput): Promise<PartnerCompanyPage> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const { data, error, count } = await supabase
    .from("organizations")
    .select(COMPANY_SELECT, { count: "exact" })
    .or("organization_type.eq.partner,settings->>is_artvideo_tenant.eq.true")
    .order("name")
    .range(from, to);
  if (error) throw toPartnerCompanyError(error, "Não foi possível carregar as empresas parceiras.");
  return { items: data ?? [], total: count ?? 0 };
}

export async function getPartnerCompany(id: string) {
  const result = await supabase
    .from("organizations")
    .select(COMPANY_SELECT)
    .eq("id", id)
    .or("organization_type.eq.partner,settings->>is_artvideo_tenant.eq.true")
    .single();
  return result.error
    ? { ...result, error: toPartnerCompanyError(result.error, "Não foi possível carregar a empresa parceira.") }
    : result;
}

export async function findPartnerCompanyByDocument(document: string, excludeCompanyId?: string | null) {
  const normalized = String(document || "").trim();
  if (!normalized) return { data: null, error: null };
  let query = supabase
    .from("organizations")
    .select("id,name,document")
    .eq("document", normalized)
    .or("organization_type.eq.partner,settings->>is_artvideo_tenant.eq.true");
  if (excludeCompanyId) query = query.neq("id", excludeCompanyId);
  const result = await query.limit(1).maybeSingle();
  return result.error
    ? { ...result, error: toPartnerCompanyError(result.error, "Não foi possível verificar se o CPF/CNPJ já está cadastrado.") }
    : result;
}

export async function createPartnerCompany(
  payload: PartnerCompanyInput,
  monitoredTypes: PartnerMonitoredServiceTypeDraft[] = [],
) {
  if (monitoredTypes.length > 0) {
    const result = await supabase.rpc("create_partner_company_with_monitoring", {
      p_company: payload,
      p_monitored_types: monitoredTypes,
    });
    return result.error
      ? { ...result, error: toPartnerCompanyError(result.error, "Não foi possível cadastrar a empresa parceira.") }
      : result;
  }

  const result = await supabase
    .from("organizations")
    .insert({ ...payload, organization_type: "partner", parent_organization_id: null })
    .select(COMPANY_SELECT)
    .single();
  return result.error
    ? { ...result, error: toPartnerCompanyError(result.error, "Não foi possível cadastrar a empresa parceira.") }
    : result;
}

export async function updatePartnerCompany(id: string, payload: PartnerCompanyInput) {
  const result = await supabase
    .from("organizations")
    .update({ ...payload, parent_organization_id: null })
    .eq("id", id)
    .select(COMPANY_SELECT)
    .single();
  return result.error
    ? { ...result, error: toPartnerCompanyError(result.error, "Não foi possível atualizar a empresa parceira.") }
    : result;
}

export async function setPartnerCompanyStatus(id: string, status: "active" | "suspended") {
  const result = await supabase
    .from("organizations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(COMPANY_SELECT)
    .single();
  return result.error
    ? { ...result, error: toPartnerCompanyError(result.error, "Não foi possível alterar o status da empresa parceira.") }
    : result;
}

export async function listPartnerMembers(organizationId?: string | null) {
  const platformOrganizationId = await getPlatformOperatorOrganizationId();
  let query = supabase
    .from("organization_members")
    .select("id,organization_id,user_id,role_id,status,is_owner,joined_at,created_at,organization:organizations(id,name),profile:profiles!organization_members_user_id_fkey(id,full_name),role:roles(id,name)")
    .neq("organization_id", platformOrganizationId)
    .order("created_at", { ascending: false });
  if (organizationId) query = query.eq("organization_id", organizationId);
  return query;
}

async function invokePartnerUsers(body: Record<string, unknown>, fallback: string) {
  const result = await supabase.functions.invoke("partner-users", { body });
  const normalizedError = await toPartnerFunctionError(result.error, result.data, fallback);
  if (normalizedError) return { ...result, error: normalizedError };
  if (result.data?.success !== true) {
    return {
      ...result,
      error: new PartnerCompanyError(
        "A função do servidor respondeu sem confirmar a operação. Tente novamente.",
        "invalid_function_response",
      ),
    };
  }
  return { ...result, error: null };
}

export async function listPartnerUsers(organizationId: string) {
  const result = await invokePartnerUsers(
    { action: "list_partner_users", organization_id: organizationId },
    "Não foi possível carregar os usuários da empresa parceira.",
  );
  return { data: result.data?.users ?? [], error: result.error };
}

export async function listPartnerRoles(organizationId: string) {
  const result = await invokePartnerUsers(
    { action: "list_partner_roles", organization_id: organizationId },
    "Não foi possível carregar as funções da empresa parceira.",
  );
  return { data: result.data?.roles ?? [], error: result.error };
}

export async function createPartnerUser(payload: PartnerUserInput) {
  const result = await invokePartnerUsers(
    { action: "create_partner_user", ...payload },
    "Não foi possível cadastrar o usuário da empresa parceira.",
  );
  return { data: result.data, error: result.error };
}

export async function updatePartnerUser(payload: PartnerUserInput & { user_id: string }) {
  const result = await invokePartnerUsers(
    { action: "update_partner_user", ...payload },
    "Não foi possível atualizar o usuário da empresa parceira.",
  );
  return { data: result.data, error: result.error };
}

export function listSystemModules() {
  return supabase
    .from("system_modules")
    .select("key,name,description,category,sort_order,is_active")
    .eq("is_active", true)
    .not("key", "like", "site_%")
    .neq("key", "products")
    .order("category")
    .order("sort_order");
}

export function listOrganizationModules(organizationId: string) {
  return supabase
    .from("organization_modules")
    .select("organization_id,module_key,is_enabled,limits,settings,updated_at")
    .eq("organization_id", organizationId);
}

export async function setOrganizationModuleEnabled(organizationId: string, moduleKey: string, enabled: boolean, userId?: string | null) {
  if (moduleKey.startsWith("site_")) {
    throw new Error("Os módulos do site são exclusivos da ArtVideo.");
  }

  const moduleKeys = moduleKey === "inventory" || moduleKey === "products"
    ? ["inventory", "products"]
    : moduleKey === "customers" || moduleKey === "employees"
      ? ["customers", "employees"]
      : [moduleKey];
  const now = new Date().toISOString();

  return supabase
    .from("organization_modules")
    .upsert(moduleKeys.map(key => ({
      organization_id: organizationId,
      module_key: key,
      is_enabled: enabled,
      enabled_by: userId || null,
      enabled_at: enabled ? now : null,
      updated_at: now,
    })), { onConflict: "organization_id,module_key" });
}

export async function listPartnerShares(organizationId?: string | null) {
  const platformOrganizationId = await getPlatformOperatorOrganizationId();
  let query = supabase
    .from("organization_data_shares")
    .select("id,parent_organization_id,child_organization_id,resource_key,access_level,updated_at,owner:organizations!organization_data_shares_child_organization_id_fkey(id,name)")
    .eq("parent_organization_id", platformOrganizationId)
    .order("resource_key");
  if (organizationId) query = query.eq("child_organization_id", organizationId);
  return query;
}

export function setPartnerDataShare(
  organizationId: string,
  resourceKey: "customers" | "orders" | "inventory",
  accessLevel: PartnerShareConfigLevel,
) {
  return supabase.rpc("set_partner_data_share", {
    p_owner_organization_id: organizationId,
    p_resource_key: resourceKey,
    p_access_level: accessLevel,
  });
}


export async function listPartnerServiceTypeMonitoring(
  organizationId: string,
): Promise<PartnerServiceTypeMonitoring[]> {
  const { data, error } = await supabase.rpc("list_partner_service_type_monitoring", {
    p_organization_id: organizationId,
  });
  if (error) throw toPartnerCompanyError(error, "Não foi possível carregar os tipos monitorados.");
  return (data ?? []) as PartnerServiceTypeMonitoring[];
}

export async function addPartnerMonitoredServiceType(
  organizationId: string,
  serviceTypeId: string,
): Promise<void> {
  const { error } = await supabase.rpc("add_partner_monitored_service_type", {
    p_organization_id: organizationId,
    p_service_type_id: serviceTypeId,
  });
  if (error) throw toPartnerCompanyError(error, "Não foi possível adicionar o tipo ao monitoramento.");
}

export async function createPartnerMonitoredServiceType(
  organizationId: string,
  input: PartnerMonitoredServiceTypeDraft,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_partner_monitored_service_type", {
    p_organization_id: organizationId,
    p_title: input.title,
    p_description: input.description ?? null,
    p_forecast_days: input.forecast_days ?? null,
  });
  if (error) throw toPartnerCompanyError(error, "Não foi possível criar o tipo monitorado.");
  if (!data) throw new PartnerCompanyError("O banco não retornou o tipo de atendimento criado.", "invalid_function_response");
  return String(data);
}
