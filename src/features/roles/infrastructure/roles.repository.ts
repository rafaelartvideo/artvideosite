import { supabase } from "@/lib/supabase";

const notifyPermissionChange = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("artvideo:permissions-changed"));
};

export const listRoles = (organizationId: string) =>
  supabase
    .from("roles")
    .select("id,organization_id,name,description,is_system,is_active,sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order")
    .order("name");

export const listActiveRoles = (organizationId: string) =>
  supabase
    .from("roles")
    .select("id,organization_id,name,is_active,sort_order")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

export const listPermissions = () =>
  supabase
    .from("permissions")
    .select("id,key,label,description,module_name,sort_order")
    .order("sort_order")
    .order("label");

export const listRoleMembers = (organizationId: string) =>
  supabase
    .from("organization_members")
    .select("role_id")
    .eq("organization_id", organizationId)
    .eq("status", "active");

export const getRolePermissionIds = (roleId: string) =>
  supabase.from("role_permissions").select("permission_id").eq("role_id", roleId);

export const createRole = (organizationId: string, role: Record<string, unknown>) =>
  supabase.from("roles").insert({ ...role, organization_id: organizationId });

export const updateRole = (roleId: string, organizationId: string, role: Record<string, unknown>) =>
  supabase.from("roles").update(role).eq("id", roleId).eq("organization_id", organizationId);

export async function addRolePermission(roleId: string, permissionId: string) {
  const result = await supabase.from("role_permissions").insert({ role_id: roleId, permission_id: permissionId });
  if (!result.error) notifyPermissionChange();
  return result;
}

export async function removeRolePermission(roleId: string, permissionId: string) {
  const result = await supabase
    .from("role_permissions")
    .delete()
    .eq("role_id", roleId)
    .eq("permission_id", permissionId);
  if (!result.error) notifyPermissionChange();
  return result;
}
