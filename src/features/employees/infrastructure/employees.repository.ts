import { supabase } from "@/lib/supabase";

const employeeColumns = "id,organization_id,profile_id,role_id,full_name,cpf,phone,function_name,is_active,created_at,updated_at,role:roles(id,name)";
const notifyPermissionChange = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event("artvideo:permissions-changed")); };

export const getEmployees = (organizationId: string) =>
  supabase.from("employees").select(employeeColumns).eq("organization_id", organizationId).order("full_name", { ascending: true });

export const listRoles = () =>
  supabase.from("roles").select("id,name,description,is_system,is_active,sort_order").order("sort_order").order("name");

export const listActiveRoles = () =>
  supabase.from("roles").select("id,name,is_active").eq("is_active", true).order("sort_order").order("name");

export const listPermissions = () =>
  supabase.from("permissions").select("id,key,label,description,module_name,sort_order").order("sort_order").order("label");

export const listEmployeeRoleIds = (organizationId: string) => supabase.from("employees").select("role_id").eq("organization_id", organizationId);
export const getRolePermissionIds = (roleId: string) => supabase.from("role_permissions").select("permission_id").eq("role_id", roleId);
export const countRolePermissions = (roleId: string) => supabase.from("role_permissions").select("permission_id", { count: "exact", head: true }).eq("role_id", roleId);
export const createRole = (role: Record<string, unknown>) => supabase.from("roles").insert(role);
export const updateRole = (roleId: string, role: Record<string, unknown>) => supabase.from("roles").update(role).eq("id", roleId);

export async function addRolePermission(roleId: string, permissionId: string) {
  const result = await supabase.from("role_permissions").insert({ role_id: roleId, permission_id: permissionId });
  if (!result.error) notifyPermissionChange();
  return result;
}

export async function removeRolePermission(roleId: string, permissionId: string) {
  const result = await supabase.from("role_permissions").delete().eq("role_id", roleId).eq("permission_id", permissionId);
  if (!result.error) notifyPermissionChange();
  return result;
}

export const invokeEmployeeCommand = (body: Record<string, unknown>) => supabase.functions.invoke("server", { body });
