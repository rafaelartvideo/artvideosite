import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  authEmailForUsername,
  INTERNAL_AUTH_DOMAIN,
  normalizeUsername,
  usernameFromAuthEmail,
  usernameHash,
} from "@/features/auth/domain/username";

export type EmployeeAccess = {
  enabled: boolean;
  profile_id: string | null;
  user_id: string | null;
  username: string | null;
  email: string | null;
  role_id: string | null;
  uniq_subscriber_id: string | null;
  is_owner: boolean;
};

export type SaveEmployeeAccessInput = {
  organizationId: string;
  employeeId: string;
  enabled: boolean;
  username?: string | null;
  email?: string | null;
  password?: string | null;
  roleId?: string | null;
  uniqSubscriberId?: string | null;
};

async function normalizeFunctionInvokeError(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json();
      const message = typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.message === "string"
          ? payload.message
          : "";
      if (message.trim()) {
        if (message.toLocaleLowerCase("pt-BR").includes("e-mail já cadastrado")) {
          return new Error("Este usuário já está em uso.");
        }
        return new Error(message.trim());
      }
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
  const result = await invokeEmployeeAccess({
    action: "get_employee_access",
    organization_id: organizationId,
    employee_id: employeeId,
  });

  if (result.error || !result.data?.access) return result;
  const access = result.data.access as Record<string, unknown>;
  const username = normalizeUsername(access.username || usernameFromAuthEmail(access.email));
  return {
    ...result,
    data: {
      ...result.data,
      access: {
        ...access,
        username: username || null,
      } as EmployeeAccess,
    },
  };
}

export async function checkEmployeeUsernameAvailability(username: string, currentUserId?: string | null) {
  const normalized = normalizeUsername(username);
  const hash = await usernameHash(normalized);
  const { data, error } = await supabase
    .from("username_registry")
    .select("user_id")
    .eq("username_hash", hash)
    .maybeSingle();

  if (error) return { available: false, error };
  return {
    available: !data?.user_id || data.user_id === currentUserId,
    error: null,
  };
}

export async function saveEmployeeAccess(input: SaveEmployeeAccessInput) {
  const currentEmail = String(input.email || "").trim().replace(/\s+/g, "").toLowerCase();
  const username = normalizeUsername(input.username || usernameFromAuthEmail(currentEmail));
  const emailAlreadyUsesUsername = currentEmail.endsWith(`@${INTERNAL_AUTH_DOMAIN}`);
  const unchangedLegacyUsername = Boolean(
    input.enabled
    && !input.username
    && currentEmail
    && !emailAlreadyUsesUsername
    && usernameFromAuthEmail(currentEmail) === username,
  );

  if (input.enabled && username && !unchangedLegacyUsername) {
    const availability = await checkEmployeeUsernameAvailability(username);
    if (availability.error) {
      return { data: null, error: new Error("Não foi possível verificar a disponibilidade do usuário.") };
    }
    if (!availability.available) {
      return { data: null, error: new Error("Este usuário já está em uso.") };
    }
  }

  const authEmail = input.username || emailAlreadyUsesUsername
    ? authEmailForUsername(username)
    : currentEmail || (username ? authEmailForUsername(username) : null);

  return invokeEmployeeAccess({
    action: "upsert_employee_access",
    organization_id: input.organizationId,
    employee_id: input.employeeId,
    enabled: input.enabled,
    username: username || null,
    email: authEmail,
    password: input.password || undefined,
    role_id: input.roleId || null,
    uniq_subscriber_id: input.uniqSubscriberId === undefined ? undefined : input.uniqSubscriberId,
  });
}

export async function setEmployeeAccessActive(organizationId: string, employeeId: string, isActive: boolean) {
  return supabase.rpc("set_employee_active_state", {
    p_organization_id: organizationId,
    p_employee_id: employeeId,
    p_is_active: isActive,
  });
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
