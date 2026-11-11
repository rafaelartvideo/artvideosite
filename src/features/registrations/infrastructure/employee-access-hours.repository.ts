import { supabase } from "@/lib/supabase";
import {
  normalizeEmployeeAccessHours,
  type EmployeeAccessHours,
} from "../domain/employee-access-hours";

export type EmployeeAccessHoursSource = {
  entity_id: string;
  full_name: string;
  enabled: boolean;
};

export async function getEmployeeAccessHours(
  organizationId: string, entityId: string,
): Promise<EmployeeAccessHours> {
  const { data, error } = await supabase.rpc("get_employee_crm_access_hours_v2", {
    p_organization_id: organizationId, p_entity_id: entityId,
  });
  if (error) throw error;
  return normalizeEmployeeAccessHours(data);
}

export async function saveEmployeeAccessHours(
  organizationId: string, entityId: string, hours: EmployeeAccessHours,
): Promise<EmployeeAccessHours> {
  const { data, error } = await supabase.rpc("save_employee_crm_access_hours_v2", {
    p_organization_id: organizationId,
    p_entity_id: entityId,
    p_enabled: hours.enabled,
    p_days: hours.days,
  });
  if (error) throw error;
  return normalizeEmployeeAccessHours(data);
}

export async function listEmployeeAccessHoursSources(
  organizationId: string,
): Promise<EmployeeAccessHoursSource[]> {
  const { data, error } = await supabase.rpc("list_employee_crm_access_sources_v2", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return (data || []) as EmployeeAccessHoursSource[];
}

export type MyEmployeeAccessWindow = {
  allowed: boolean;
  restricted: boolean;
  timezone: string;
  server_now: string | null;
  next_end_at: string | null;
};

export async function checkMyEmployeeAccessWindow(organizationId: string): Promise<MyEmployeeAccessWindow> {
  const { data, error } = await supabase.rpc("check_my_employee_crm_access_hours_v2", {
    p_organization_id: organizationId,
  }).abortSignal(AbortSignal.timeout(12_000));
  if (error) throw error;
  const result = (data || {}) as Partial<MyEmployeeAccessWindow>;
  if (typeof result.allowed !== "boolean" || typeof result.restricted !== "boolean") {
    throw new Error("Resposta inválida ao verificar o horário de acesso.");
  }
  return {
    allowed: result.allowed,
    restricted: result.restricted,
    timezone: result.timezone || "America/Sao_Paulo",
    server_now: typeof result.server_now === "string" ? result.server_now : null,
    next_end_at: typeof result.next_end_at === "string" ? result.next_end_at : null,
  };
}
