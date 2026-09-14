import { supabase } from "@/lib/supabase";

export type RegistrationRole = "customer" | "employee" | "supplier";

export type Registration = {
  id: string;
  organization_id: string;
  person_type: "PF" | "PJ";
  name: string;
  legal_name: string | null;
  trade_name: string | null;
  document: string | null;
  state_registration: string | null;
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
  id,organization_id,person_type,name,legal_name,trade_name,document,state_registration,
  birth_date,foundation_date,phone,whatsapp,email,is_active,legacy_customer_id,legacy_employee_id,
  created_at,updated_at,
  roles:entity_roles(role,is_active),
  employee_details:entity_employee_details(job_title,team_name,admission_date,profile_id,role_id,uniq_subscriber_id),
  addresses:entity_addresses(id,type,zip_code,state,city,neighborhood,street,number,complement,reference,location_url,is_primary,is_active)
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
  address?: {
    type?: string;
    zip_code?: string;
    state?: string;
    city?: string;
    neighborhood?: string;
    street?: string;
    number?: string;
    complement?: string;
    reference?: string;
    location_url?: string;
  } | null;
};

export async function saveRegistration(input: SaveRegistrationInput) {
  return supabase.rpc("save_registration", {
    p_registration_id: input.id || null,
    p_organization_id: input.organizationId,
    p_entity: input.entity,
    p_roles: input.roles,
    p_employee: input.employee || {},
    p_address: input.address || null,
  });
}
