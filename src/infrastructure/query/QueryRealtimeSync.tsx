import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./query-keys";

const tableQueryKeys: Array<{ table: string; keys: QueryKey[] }> = [
  { table: "site_settings", keys: [queryKeys.publicSite.settings()] },
  { table: "services", keys: [queryKeys.publicSite.all, queryKeys.catalog.services()] },
  { table: "service_categories", keys: [queryKeys.publicSite.all, queryKeys.catalog.categories()] },
  { table: "products", keys: [queryKeys.publicSite.all, queryKeys.catalog.products()] },
  { table: "brands", keys: [queryKeys.publicSite.all, queryKeys.catalog.brands()] },
  { table: "customers", keys: [queryKeys.customers.all, queryKeys.orders.all] },
  { table: "customer_addresses", keys: [queryKeys.customers.all, queryKeys.orders.all] },
  { table: "entities", keys: [queryKeys.registrations.all] },
  { table: "entity_roles", keys: [queryKeys.registrations.all] },
  { table: "entity_addresses", keys: [queryKeys.registrations.all] },
  { table: "entity_employee_details", keys: [queryKeys.registrations.all] },
  { table: "entity_supplier_items", keys: [queryKeys.registrations.all, queryKeys.inventory.all] },
  { table: "entity_contacts", keys: [queryKeys.registrations.all] },
  { table: "entity_records", keys: [queryKeys.registrations.all] },
  { table: "organization_members", keys: [queryKeys.registrations.all, queryKeys.employees.all] },
  { table: "user_permission_overrides", keys: [queryKeys.registrations.all, queryKeys.employees.all] },
  { table: "role_permissions", keys: [queryKeys.registrations.all, queryKeys.employees.all] },
  { table: "inventory_items", keys: [queryKeys.inventory.all, queryKeys.orders.all, queryKeys.registrations.all] },
  { table: "inventory_movements", keys: [queryKeys.inventory.all] },
  { table: "service_orders", keys: [queryKeys.orders.all, queryKeys.customers.all, queryKeys.appointments.all, queryKeys.admin.dashboard()] },
  { table: "service_order_status_history", keys: [queryKeys.orders.all, queryKeys.customers.all] },
  { table: "service_order_part_requests", keys: [queryKeys.orders.all, queryKeys.inventory.all] },
  { table: "service_order_part_request_items", keys: [queryKeys.orders.all, queryKeys.inventory.all] },
  { table: "service_order_used_items", keys: [queryKeys.orders.all, queryKeys.inventory.all] },
  { table: "appointments", keys: [queryKeys.appointments.all, queryKeys.orders.all] },
  { table: "quote_requests", keys: [queryKeys.quotes.all, queryKeys.customers.all, queryKeys.admin.dashboard()] },
  { table: "quote_status_history", keys: [queryKeys.quotes.all, queryKeys.customers.all] },
  { table: "employees", keys: [queryKeys.employees.all, queryKeys.orders.all, queryKeys.registrations.all] },
  { table: "profiles", keys: [queryKeys.employees.all, queryKeys.orders.all, queryKeys.registrations.all] },
];

const organizationScopedQueryKeys: QueryKey[] = [
  queryKeys.admin.all,
  queryKeys.customers.all,
  queryKeys.registrations.all,
  queryKeys.equipment.all,
  queryKeys.generalServices.all,
  queryKeys.serviceTypes.all,
  queryKeys.inventory.all,
  queryKeys.appointments.all,
  queryKeys.quotes.all,
  queryKeys.employees.all,
  queryKeys.orderSituations.all,
  queryKeys.orderStatuses.all,
  queryKeys.orders.all,
];

export function QueryRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const pending = new Map<string, ReturnType<typeof window.setTimeout>>();
    let channel = supabase.channel("query-cache-sync");

    for (const { table, keys } of tableQueryKeys) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          for (const queryKey of keys) {
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
          }
        },
      );
    }

    const handleOrganizationChange = () => {
      for (const queryKey of organizationScopedQueryKeys) {
        void queryClient.invalidateQueries({ queryKey });
      }
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
