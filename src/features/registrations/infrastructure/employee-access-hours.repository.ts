import { supabase } from "@/lib/supabase";
import {
  normalizeEmployeeAccessHours,
  type EmployeeAccessHours,
} from "../domain/employee-access-hours";

export type EmployeeAccessHoursSource = {
  employee_id: string;
  full_name: string;
  enabled: boolean;
};

export async function getEmployeeAccessHours(
  organizationId: string, employeeId: string,
): Promise<EmployeeAccessHours> {
  const { data, error } = await supabase.rpc("get_employee_crm_access_hours_v1", {
    p_organization_id: organizationId, p_employee_id: employeeId,
  });
  if (error) throw error;
  return normalizeEmployeeAccessHours(data);
}

export async function saveEmployeeAccessHours(
  organizationId: string, employeeId: string, hours: EmployeeAccessHours,
): Promise<EmployeeAccessHours> {
  const { data, error } = await supabase.rpc("save_employee_crm_access_hours_v1", {
    p_organization_id: organizationId,
    p_employee_id: employeeId,
    p_enabled: hours.enabled,
    p_days: hours.days,
  });
  if (error) throw error;
  return normalizeEmployeeAccessHours(data);
}

export async function listEmployeeAccessHoursSources(
  organizationId: string,
): Promise<EmployeeAccessHoursSource[]> {
  const { data, error } = await supabase.rpc("list_employee_crm_access_sources_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return (data || []) as EmployeeAccessHoursSource[];
}

export type MyEmployeeAccessWindow = {
  allowed: boolean;
  restricted: boolean;
  timezone: string;
};

export async function checkMyEmployeeAccessWindow(organizationId: string): Promise<MyEmployeeAccessWindow> {
  const { data, error } = await supabase.rpc("check_my_employee_crm_access_hours_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  const result = (data || {}) as Partial<MyEmployeeAccessWindow>;
  return {
    allowed: result.allowed === true,
    restricted: result.restricted === true,
    timezone: result.timezone || "America/Sao_Paulo",
  };
}
