import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type EmployeeAccess = {
  enabled: boolean;
  profile_id: string | null;
  user_id: string | null;
  email: string | null;
  role_id: string | null;
  uniq_subscriber_id: string | null;
  is_owner: boolean;
};

export type SaveEmployeeAccessInput = {
  organizationId: string;
  employeeId: string;
  enabled: boolean;
  email?: string | null;
  password?: string | null;
  roleId?: string | null;
  uniqSubscriberId?: string | null;
};

const EMPLOYEE_ACCESS_CACHE_TTL = 60_000;
const employeeAccessCache = new Map<string, { at: number; result: any }>();
const employeeAccessPending = new Map<string, Promise<any>>();

function employeeAccessKey(organizationId: string, employeeId: string) {
  return `${organizationId}:${employeeId}`;
}

async function normalizeFunctionInvokeError(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json();
      const message = typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.message === "string"
          ? payload.message
          : "";
      if (message.trim()) return new Error(message.trim());
    } catch {
      // Keep the SDK fallback below when the response body is not JSON.
    }
  }
  if (error instanceof Error) return error;
  return new Error(String(error || "Não foi possível acessar o usuário do sistema."));
}

async function invokeEmployeeAccess(body: Record<string, unknown>) {
  const result = await supabase.functions.invoke("employee-access", { body });
  if (!result.error) return result;
  return { ...result, error: await normalizeFunctionInvokeError(result.error) };
}

export async function getEmployeeAccess(organizationId: string, employeeId: string) {
  const key = employeeAccessKey(organizationId, employeeId);
  const cached = employeeAccessCache.get(key);
  if (cached && Date.now() - cached.at < EMPLOYEE_ACCESS_CACHE_TTL) return cached.result;

  const pending = employeeAccessPending.get(key);
  if (pending) return pending;

  const request = invokeEmployeeAccess({
    action: "get_employee_access",
    organization_id: organizationId,
    employee_id: employeeId,
  }).then(result => {
    employeeAccessPending.delete(key);
    if (!result.error) employeeAccessCache.set(key, { at: Date.now(), result });
    return result;
  }, error => {
    employeeAccessPending.delete(key);
    throw error;
  });

  employeeAccessPending.set(key, request);
  return request;
}

export async function saveEmployeeAccess(input: SaveEmployeeAccessInput) {
  const result = await invokeEmployeeAccess({
    action: "upsert_employee_access",
    organization_id: input.organizationId,
    employee_id: input.employeeId,
    enabled: input.enabled,
    email: input.email?.trim() || null,
    password: input.password || undefined,
    role_id: input.roleId || null,
    uniq_subscriber_id: input.uniqSubscriberId === undefined ? undefined : input.uniqSubscriberId,
  });
  if (!result.error) employeeAccessCache.delete(employeeAccessKey(input.organizationId, input.employeeId));
  return result;
}

export async function setEmployeeAccessActive(organizationId: string, employeeId: string, isActive: boolean) {
  const result = await supabase.rpc("set_employee_active_state", {
    p_organization_id: organizationId,
    p_employee_id: employeeId,
    p_is_active: isActive,
  });
  if (!result.error) employeeAccessCache.delete(employeeAccessKey(organizationId, employeeId));
  return result;
}

export const listObservedUniqSubscribers = () => supabase.rpc("observed_uniq_subscribers");

export type PermissionAccess = {
  roleId: string | null;
  roleName: string | null;
  permissions: Array<{
    id: string;
    key: string;
    label: string | null;
    description: string | null;
    module_name: string | null;
    sort_order: number | null;
  }>;
  inheritedPermissionIds: string[];
  individualPermissionIds: string[];
};

export async function getUserPermissionAccess(organizationId: string, userId: string): Promise<PermissionAccess> {
  const [{ data: membership, error: membershipError }, { data: permissions, error: permissionsError }, { data: overrides, error: overridesError }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("role_id,role:roles(id,name)")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("permissions")
      .select("id,key,label,description,module_name,sort_order")
      .order("sort_order")
      .order("label"),
    supabase
      .from("user_permission_overrides")
      .select("permission_id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId),
  ]);

  const error = membershipError || permissionsError || overridesError;
  if (error) throw error;

  const roleId = membership?.role_id ?? null;
  const { data: inherited, error: inheritedError } = roleId
    ? await supabase.from("role_permissions").select("permission_id").eq("role_id", roleId)
    : { data: [], error: null };
  if (inheritedError) throw inheritedError;

  const roleValue = Array.isArray((membership as any)?.role)
    ? (membership as any).role[0]
    : (membership as any)?.role;

  return {
    roleId,
    roleName: roleValue?.name ?? null,
    permissions: (permissions || []) as PermissionAccess["permissions"],
    inheritedPermissionIds: (inherited || []).map((item: any) => String(item.permission_id)),
    individualPermissionIds: (overrides || []).map((item: any) => String(item.permission_id)),
  };
}

export async function setUserPermissionOverrides(
  organizationId: string,
  userId: string,
  permissionIds: string[],
) {
  const result = await supabase.rpc("set_user_permission_overrides", {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_permission_ids: Array.from(new Set(permissionIds)),
  });
  if (!result.error && typeof window !== "undefined") {
    window.dispatchEvent(new Event("artvideo:permissions-changed"));
  }
  return result;
}
