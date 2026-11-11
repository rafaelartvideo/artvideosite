import { supabase } from "@/lib/supabase";
import {
  PERMISSIONS_CHANGED_EVENT,
  LEGACY_PERMISSIONS_CHANGED_EVENT,
  dispatchCompatibleEvent,
} from "@/lib/platform-identifiers";

const notifyPermissionChange = () => {
  dispatchCompatibleEvent(PERMISSIONS_CHANGED_EVENT, LEGACY_PERMISSIONS_CHANGED_EVENT);
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

// O banco agora define o catálogo válido, inclusive módulos habilitados e
// permissões de situações; não duplicar a regra no navegador.
export const listPermissions = (organizationId: string) =>
  supabase.rpc("list_organization_permission_catalog_v1", {
    p_organization_id: organizationId,
  });

export type RoleMemberRecord = {
  role_id: string | null;
  user_id: string;
  profile: { full_name: string | null } | null;
};

// Pagina a leitura para que a lista do modal não perca funcionários após
// o limite padrão de linhas do PostgREST. A consulta permanece na empresa ativa.
export async function listRoleMembers(organizationId: string) {
  const pageSize = 500;
  const members: RoleMemberRecord[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("organization_members")
      .select("role_id,user_id,profile:profiles!organization_members_user_id_fkey(full_name)")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("user_id")
      .range(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    const page = (data || []) as unknown as RoleMemberRecord[];
    members.push(...page);
    if (page.length < pageSize) break;
  }
  return { data: members, error: null };
}

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

/** Altera apenas permissões visíveis e válidas; o banco aplica tudo numa transação. */
export async function saveRolePermissions(
  roleId: string,
  selectedPermissionIds: string[],
  visiblePermissionIds: string[],
) {
  const result = await supabase.rpc("save_role_permission_selection_v1", {
    p_role_id: roleId,
    p_selected_permission_ids: Array.from(new Set(selectedPermissionIds)),
    p_visible_permission_ids: Array.from(new Set(visiblePermissionIds)),
  });
  if (!result.error) notifyPermissionChange();
  return result;
}
