import { supabase } from "@/lib/supabase";
import {
  getEmployees as queryEmployees,
  setEmployeeActive as querySetEmployeeActive,
} from "@/lib/queries";

export const getEmployees = () => queryEmployees();

export const setEmployeeActive = (employeeId: string, isActive: boolean) =>
  querySetEmployeeActive(employeeId, isActive);

export const listRoles = () =>
  supabase
    .from("roles")
    .select("id,name,description,is_system,is_active,sort_order")
    .order("sort_order")
    .order("name");

export const listActiveRoles = () =>
  supabase
    .from("roles")
    .select("id,name,is_active")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

export const listPermissions = () =>
  supabase
    .from("permissions")
    .select("id,key,label,description,module_name,sort_order")
    .order("sort_order")
    .order("label");

export const listEmployeeRoleIds = () =>
  supabase.from("employees").select("role_id");

export const getRolePermissionIds = (roleId: string) =>
  supabase.from("role_permissions").select("permission_id").eq("role_id", roleId);

export const countRolePermissions = (roleId: string) =>
  supabase
    .from("role_permissions")
    .select("permission_id", { count: "exact", head: true })
    .eq("role_id", roleId);

export const createRole = (role: Record<string, unknown>) =>
  supabase.from("roles").insert(role);

export const updateRole = (roleId: string, role: Record<string, unknown>) =>
  supabase.from("roles").update(role).eq("id", roleId);

export const addRolePermission = (roleId: string, permissionId: string) =>
  supabase.from("role_permissions").insert({
    role_id: roleId,
    permission_id: permissionId,
  });

export const removeRolePermission = (roleId: string, permissionId: string) =>
  supabase
    .from("role_permissions")
    .delete()
    .eq("role_id", roleId)
    .eq("permission_id", permissionId);

export const invokeEmployeeCommand = (body: Record<string, unknown>) =>
  supabase.functions.invoke("server", { body });

export const deleteEmployeeRecord = (employeeId: string) =>
  supabase.from("employees").delete().eq("id", employeeId);
