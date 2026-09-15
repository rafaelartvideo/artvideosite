import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./query-keys";

type RealtimePayload = {
  eventType?: string;
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
};

type TableQueryConfig = {
  table: string;
  keys: QueryKey[] | ((payload: RealtimePayload) => QueryKey[]);
};

function payloadRow(payload: RealtimePayload) {
  const current = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
  return (current || {}) as Record<string, unknown>;
}

function textValue(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === "string" && value ? value : null;
}

function registrationEntityKeys(payload: RealtimePayload) {
  const row = payloadRow(payload);
  const organizationId = textValue(row, "organization_id");
  const entityId = textValue(row, "entity_id") || textValue(row, "id");
  if (!organizationId || !entityId) return [queryKeys.registrations.lists(), queryKeys.registrations.details()];
  return [queryKeys.registrations.list(organizationId), queryKeys.registrations.detail(organizationId, entityId)];
}

function registrationChildKeys(
  payload: RealtimePayload,
  family: "contacts" | "records" | "supplier-items",
) {
  const row = payloadRow(payload);
  const organizationId = textValue(row, "organization_id");
  const entityId = textValue(row, "entity_id");
  if (!organizationId || !entityId) {
    if (family === "contacts") return [queryKeys.registrations.contactsAll];
    if (family === "records") return [queryKeys.registrations.recordsAll];
    return [queryKeys.registrations.supplierItemsAll];
  }
  if (family === "contacts") return [queryKeys.registrations.contacts(organizationId, entityId)];
  if (family === "records") return [queryKeys.registrations.records(organizationId, entityId)];
  return [queryKeys.registrations.supplierItems(organizationId, entityId)];
}

function registrationPermissionKeys(payload: RealtimePayload) {
  const row = payloadRow(payload);
  const organizationId = textValue(row, "organization_id");
  const userId = textValue(row, "user_id");
  if (!organizationId || !userId) return [queryKeys.registrations.permissionsAll];
  return [queryKeys.registrations.permissions(organizationId, userId)];
}

function registrationEmployeeKeys(payload: RealtimePayload) {
  const row = payloadRow(payload);
  const organizationId = textValue(row, "organization_id");
  const employeeId = textValue(row, "id") || textValue(row, "employee_id");
  const entityId = textValue(row, "entity_id");
  const keys: QueryKey[] = [queryKeys.employees.all, queryKeys.orders.all];
  if (organizationId && employeeId) keys.push(queryKeys.registrations.access(organizationId, employeeId));
  else keys.push(queryKeys.registrations.accessAll);
  if (organizationId && entityId) keys.push(queryKeys.registrations.detail(organizationId, entityId));
  else keys.push(queryKeys.registrations.details());
  return keys;
}

const checklistConfigKeys: QueryKey[] = [queryKeys.checklists.all, queryKeys.equipment.all];
const checklistOrderKeys: QueryKey[] = [queryKeys.checklists.ordersAll, queryKeys.orders.all];

const tableQueryKeys: TableQueryConfig[] = [
  { table: "site_settings", keys: [queryKeys.publicSite.settings()] },
  { table: "services", keys: [queryKeys.publicSite.all, queryKeys.catalog.services()] },
  { table: "service_categories", keys: [queryKeys.publicSite.all, queryKeys.catalog.categories()] },
  { table: "products", keys: [queryKeys.publicSite.all, queryKeys.catalog.products()] },
  { table: "brands", keys: [queryKeys.publicSite.all, queryKeys.catalog.brands()] },
  { table: "customers", keys: [queryKeys.customers.all, queryKeys.orders.all] },
  { table: "customer_addresses", keys: [queryKeys.customers.all, queryKeys.orders.all] },
  { table: "entities", keys: registrationEntityKeys },
  { table: "entity_roles", keys: registrationEntityKeys },
  { table: "entity_addresses", keys: registrationEntityKeys },
  { table: "entity_employee_details", keys: registrationEntityKeys },
  { table: "entity_supplier_items", keys: payload => [...registrationChildKeys(payload, "supplier-items"), queryKeys.inventory.all] },
  { table: "entity_contacts", keys: payload => registrationChildKeys(payload, "contacts") },
  { table: "entity_records", keys: payload => registrationChildKeys(payload, "records") },
  { table: "organization_members", keys: payload => [...registrationPermissionKeys(payload), queryKeys.registrations.accessAll, queryKeys.employees.all] },
  { table: "user_permission_overrides", keys: payload => [...registrationPermissionKeys(payload), queryKeys.employees.all] },
  { table: "role_permissions", keys: [queryKeys.registrations.permissionsAll, queryKeys.employees.all] },
  { table: "checklist_profiles", keys: checklistConfigKeys },
  { table: "checklist_profile_stages", keys: checklistConfigKeys },
  { table: "checklist_profile_items", keys: checklistConfigKeys },
  { table: "equipment_checklist_items", keys: checklistConfigKeys },
  { table: "service_order_checklists", keys: checklistOrderKeys },
  { table: "service_order_checklist_stages", keys: checklistOrderKeys },
  { table: "service_order_checklist_items", keys: checklistOrderKeys },
  { table: "service_order_checklist_item_media", keys: [...checklistOrderKeys, queryKeys.orders.all] },
  { table: "equipment_types", keys: [queryKeys.equipment.all, queryKeys.orders.all, queryKeys.checklists.all] },
  { table: "os_situations", keys: [queryKeys.orderSituations.all, queryKeys.orders.all, queryKeys.checklists.all] },
  { table: "inventory_items", keys: [queryKeys.inventory.all, queryKeys.orders.all, queryKeys.registrations.supplierItemsAll] },
  { table: "inventory_movements", keys: [queryKeys.inventory.all] },
  { table: "service_orders", keys: [queryKeys.orders.all, queryKeys.customers.all, queryKeys.appointments.all, queryKeys.admin.dashboard()] },
  { table: "service_order_status_history", keys: [queryKeys.orders.all, queryKeys.customers.all] },
  { table: "service_order_part_requests", keys: [queryKeys.orders.all, queryKeys.inventory.all] },
  { table: "service_order_part_request_items", keys: [queryKeys.orders.all, queryKeys.inventory.all] },
  { table: "service_order_used_items", keys: [queryKeys.orders.all, queryKeys.inventory.all] },
  { table: "appointments", keys: [queryKeys.appointments.all, queryKeys.orders.all] },
  { table: "quote_requests", keys: [queryKeys.quotes.all, queryKeys.customers.all, queryKeys.admin.dashboard()] },
  { table: "quote_status_history", keys: [queryKeys.quotes.all, queryKeys.customers.all] },
  { table: "employees", keys: registrationEmployeeKeys },
  { table: "profiles", keys: [queryKeys.employees.all, queryKeys.orders.all, queryKeys.registrations.details(), queryKeys.registrations.permissionsAll, queryKeys.registrations.accessAll] },
];

export function QueryRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const pending = new Map<string, ReturnType<typeof window.setTimeout>>();
    let channel = supabase.channel("query-cache-sync");

    const scheduleInvalidation = (queryKey: QueryKey) => {
      const id = JSON.stringify(queryKey);
      const current = pending.get(id);
      if (current) window.clearTimeout(current);
      pending.set(
        id,
        window.setTimeout(() => {
          pending.delete(id);
          void queryClient.invalidateQueries({ queryKey });
        }, 150),
      );
    };

    for (const { table, keys } of tableQueryKeys) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          const resolvedKeys = typeof keys === "function" ? keys(payload as RealtimePayload) : keys;
          for (const queryKey of resolvedKeys) scheduleInvalidation(queryKey);
        },
      );
    }

    const handleOrganizationChange = () => {
      queryClient.clear();
    };

    window.addEventListener("artvideo:organization-changed", handleOrganizationChange);
    channel.subscribe();

    return () => {
      window.removeEventListener("artvideo:organization-changed", handleOrganizationChange);
      for (const timeout of pending.values()) window.clearTimeout(timeout);
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return null;
}
