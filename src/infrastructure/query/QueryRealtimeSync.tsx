import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
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
  if (!organizationId || !entityId) return [queryKeys.registrations.lists(), queryKeys.registrations.details(), queryKeys.admin.dashboards()];
  return [queryKeys.registrations.list(organizationId), queryKeys.registrations.detail(organizationId, entityId), queryKeys.admin.dashboards()];
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
  const keys: QueryKey[] = [queryKeys.employees.all, queryKeys.orders.lists(), queryKeys.orders.workspace(), queryKeys.admin.dashboards()];
  if (organizationId && employeeId) keys.push(queryKeys.registrations.access(organizationId, employeeId));
  else keys.push(queryKeys.registrations.accessAll);
  if (organizationId && entityId) keys.push(queryKeys.registrations.detail(organizationId, entityId));
  else keys.push(queryKeys.registrations.details());
  return keys;
}

function orderDetailKey(payload: RealtimePayload, idField = "service_order_id") {
  const row = payloadRow(payload);
  const orderId = textValue(row, idField);
  return orderId ? queryKeys.orders.detail(orderId) : queryKeys.orders.details();
}

function serviceOrderKeys(payload: RealtimePayload) {
  const row = payloadRow(payload);
  const orderId = textValue(row, "id");
  const organizationId = textValue(row, "organization_id");
  const keys: QueryKey[] = [
    orderId ? queryKeys.orders.detail(orderId) : queryKeys.orders.details(),
    queryKeys.orders.lists(),
    queryKeys.admin.dashboards(),
  ];

  if (orderId) keys.push(queryKeys.orders.partRequests(orderId));

  if (payload.eventType === "INSERT" || payload.eventType === "DELETE") {
    keys.push(organizationId ? queryKeys.orders.total(organizationId) : queryKeys.orders.totals());
  }

  return keys;
}

function serviceOrderPartRequestKeys(payload: RealtimePayload) {
  const serviceOrderId = textValue(payloadRow(payload), "service_order_id");
  return serviceOrderId
    ? [
        queryKeys.orders.partRequests(serviceOrderId),
        queryKeys.orders.detail(serviceOrderId),
      ]
    : [
        queryKeys.orders.partRequestsAll,
        queryKeys.orders.details(),
      ];
}

function serviceOrderPartRequestItemKeys() {
  // O item possui request_id, mas não service_order_id. Limitamos a invalidação
  // às famílias de detalhe/peças, sem derrubar lista, clientes, agenda ou dashboard.
  return [queryKeys.orders.partRequestsAll, queryKeys.orders.details()];
}

function checklistOrderKeys(payload: RealtimePayload) {
  const serviceOrderId = textValue(payloadRow(payload), "service_order_id");
  return serviceOrderId
    ? [queryKeys.checklists.order(serviceOrderId)]
    : [queryKeys.checklists.ordersAll];
}

const checklistConfigKeys: QueryKey[] = [queryKeys.checklists.all, queryKeys.equipment.all];

const organizationScopedRealtimeTables = new Set([
  "appointments",
  "attachment_types",
  "brands",
  "checklist_profile_items",
  "checklist_profile_stages",
  "checklist_profiles",
  "customer_addresses",
  "customers",
  "employees",
  "entities",
  "entity_addresses",
  "entity_contacts",
  "entity_records",
  "entity_supplier_items",
  "equipment_brands",
  "equipment_checklist_items",
  "equipment_models",
  "equipment_type_technical_fields",
  "equipment_types",
  "financial_accounts",
  "financial_approvals",
  "financial_cash_sessions",
  "financial_categories",
  "financial_cost_centers",
  "financial_entries",
  "financial_installments",
  "financial_movements",
  "financial_payment_methods",
  "financial_recurring_rules",
  "financial_settlements",
  "financial_settings",
  "financial_transfers",
  "general_services",
  "inventory_items",
  "inventory_movements",
  "order_statuses",
  "organization_company_settings",
  "organization_members",
  "os_situations",
  "pdv_sale_items",
  "pdv_sale_payments",
  "pdv_sales",
  "pdv_settings",
  "print_templates",
  "product_categories",
  "products",
  "queue_integration_settings",
  "quote_requests",
  "quote_status_history",
  "service_categories",
  "service_exclusions",
  "service_faqs",
  "service_inclusions",
  "service_price_factors",
  "service_sections",
  "service_variants",
  "service_order_checklist_item_media",
  "service_order_checklist_items",
  "service_order_checklist_stages",
  "service_order_checklists",
  "service_order_part_request_items",
  "service_order_part_requests",
  "service_order_items",
  "service_order_status_history",
  "service_order_used_items",
  "service_orders",
  "service_type_monitoring",
  "service_type_situations",
  "service_types",
  "services",
  "site_settings",
  "technical_fields",
  "user_permission_overrides",
]);

const realtimePublishedTables = new Set([
  // Operacional: alterações simultâneas mudam telas de trabalho em andamento.
  "appointments",
  "customer_addresses",
  "customers",
  "financial_approvals",
  "financial_cash_sessions",
  "financial_entries",
  "financial_installments",
  "financial_movements",
  "financial_recurring_rules",
  "financial_settlements",
  "financial_transfers",
  "inventory_items",
  "inventory_movements",
  "pdv_sale_items",
  "pdv_sale_payments",
  "pdv_sales",
  "pdv_settings",
  "quote_requests",
  "quote_status_history",
  "service_order_checklist_item_media",
  "service_order_checklist_items",
  "service_order_checklist_stages",
  "service_order_checklists",
  "service_order_part_request_items",
  "service_order_part_requests",
  "service_order_items",
  "service_order_status_history",
  "service_order_used_items",
  "service_orders",

  // Referências de baixa mutação: ficam frescas por Realtime e podem permanecer
  // muito mais tempo no cache sem consultas periódicas/reabertura de módulo.
  "attachment_types",
  "brands",
  "checklist_profile_items",
  "checklist_profile_stages",
  "checklist_profiles",
  "employees",
  "equipment_brands",
  "equipment_checklist_items",
  "equipment_models",
  "equipment_type_technical_fields",
  "equipment_types",
  "financial_accounts",
  "financial_categories",
  "financial_cost_centers",
  "financial_payment_methods",
  "financial_settings",
  "general_services",
  "order_statuses",
  "organization_company_settings",
  "os_situations",
  "print_templates",
  "product_categories",
  "products",
  "queue_integration_settings",
  "service_categories",
  "service_exclusions",
  "service_faqs",
  "service_inclusions",
  "service_price_factors",
  "service_sections",
  "service_type_monitoring",
  "service_type_situations",
  "service_types",
  "service_variants",
  "services",
  "site_settings",
  "technical_fields",

  // Publicadas para consumidores específicos fora deste sincronizador global:
  // UnionOrderMonitor usa seller/technician/technical-values e uniq_calls é
  // consumida pelo módulo de telefonia. Elas permanecem na publication do banco,
  // mas não criamos assinaturas extras aqui.
]);

const tableQueryKeys: TableQueryConfig[] = [
  { table: "site_settings", keys: [queryKeys.publicSite.settings()] },
  { table: "services", keys: [queryKeys.publicSite.all, queryKeys.catalog.services(), queryKeys.orders.workspace(), queryKeys.orders.lists(), queryKeys.admin.dashboards()] },
  { table: "service_categories", keys: [queryKeys.publicSite.all, queryKeys.catalog.categories(), queryKeys.catalog.services()] },
  { table: "service_variants", keys: [queryKeys.publicSite.all, queryKeys.catalog.services()] },
  { table: "service_inclusions", keys: [queryKeys.publicSite.all, queryKeys.catalog.services()] },
  { table: "service_exclusions", keys: [queryKeys.publicSite.all, queryKeys.catalog.services()] },
  { table: "service_price_factors", keys: [queryKeys.publicSite.all, queryKeys.catalog.services()] },
  { table: "service_faqs", keys: [queryKeys.publicSite.all, queryKeys.catalog.services()] },
  { table: "service_sections", keys: [queryKeys.publicSite.all, queryKeys.catalog.services()] },
  { table: "products", keys: [queryKeys.publicSite.all, queryKeys.catalog.products(), queryKeys.catalog.services(), queryKeys.orders.workspace(), queryKeys.orders.lists(), queryKeys.pdv.all] },
  { table: "product_categories", keys: [queryKeys.catalog.products()] },
  { table: "brands", keys: [queryKeys.publicSite.all, queryKeys.catalog.brands(), queryKeys.catalog.services(), queryKeys.catalog.products(), queryKeys.orders.workspace(), queryKeys.orders.lists(), queryKeys.admin.dashboards()] },
  { table: "attachment_types", keys: [["documents"]] },
  { table: "print_templates", keys: [["documents"]] },
  { table: "customers", keys: [queryKeys.customers.all, queryKeys.orders.lists(), queryKeys.admin.dashboards()] },
  { table: "customer_addresses", keys: [queryKeys.customers.all] },
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
  { table: "service_order_checklist_item_media", keys: checklistOrderKeys },
  { table: "equipment_types", keys: [queryKeys.equipment.all, queryKeys.orders.workspace(), queryKeys.orders.lists(), queryKeys.checklists.all] },
  { table: "equipment_brands", keys: [queryKeys.equipment.all, queryKeys.orders.workspace(), queryKeys.orders.lists()] },
  { table: "equipment_models", keys: [queryKeys.equipment.all, queryKeys.orders.workspace(), queryKeys.orders.lists()] },
  { table: "technical_fields", keys: [queryKeys.equipment.all, queryKeys.orders.workspace()] },
  { table: "equipment_type_technical_fields", keys: [queryKeys.equipment.all, queryKeys.orders.workspace()] },
  { table: "order_statuses", keys: [queryKeys.orderStatuses.all, queryKeys.orders.workspace(), queryKeys.orders.lists(), queryKeys.admin.dashboards()] },
  { table: "organization_company_settings", keys: [["company-settings"]] },
  { table: "general_services", keys: [queryKeys.generalServices.all, queryKeys.orders.workspace(), queryKeys.orders.lists()] },
  { table: "service_types", keys: [queryKeys.serviceTypes.all, queryKeys.orders.workspace(), queryKeys.orders.lists()] },
  { table: "service_type_situations", keys: [queryKeys.serviceTypes.all, queryKeys.orders.workspace()] },
  { table: "service_type_monitoring", keys: [queryKeys.serviceTypes.all, queryKeys.admin.dashboards()] },
  { table: "os_situations", keys: [queryKeys.orderSituations.all, queryKeys.orders.workspace(), queryKeys.orders.lists(), queryKeys.checklists.all, queryKeys.admin.dashboards()] },
  { table: "financial_accounts", keys: [["finance", "foundation"], queryKeys.pdv.all] },
  { table: "financial_categories", keys: [["finance", "foundation"]] },
  { table: "financial_cost_centers", keys: [["finance", "foundation"]] },
  { table: "financial_payment_methods", keys: [["finance", "foundation"], queryKeys.pdv.all] },
  { table: "financial_settings", keys: [["finance", "foundation"]] },
  { table: "financial_entries", keys: [queryKeys.finance.all] },
  { table: "financial_installments", keys: [queryKeys.finance.all] },
  { table: "financial_approvals", keys: [queryKeys.finance.all] },
  { table: "financial_movements", keys: [queryKeys.finance.all] },
  { table: "financial_settlements", keys: [queryKeys.finance.all] },
  { table: "financial_transfers", keys: [queryKeys.finance.all] },
  { table: "financial_cash_sessions", keys: [queryKeys.finance.all, queryKeys.pdv.all] },
  { table: "financial_recurring_rules", keys: [queryKeys.finance.all] },
  { table: "pdv_settings", keys: [queryKeys.pdv.all] },
  { table: "pdv_sales", keys: [queryKeys.pdv.all] },
  { table: "pdv_sale_items", keys: [queryKeys.pdv.all] },
  { table: "pdv_sale_payments", keys: [queryKeys.pdv.all] },
  { table: "inventory_items", keys: [queryKeys.inventory.all, queryKeys.catalog.products(), queryKeys.registrations.supplierItemsAll, queryKeys.admin.dashboards(), queryKeys.pdv.all] },
  { table: "inventory_movements", keys: [queryKeys.inventory.all] },
  { table: "service_orders", keys: serviceOrderKeys },
  { table: "service_order_status_history", keys: payload => [orderDetailKey(payload)] },
  { table: "service_order_part_requests", keys: serviceOrderPartRequestKeys },
  { table: "service_order_part_request_items", keys: serviceOrderPartRequestItemKeys },
  { table: "service_order_items", keys: payload => [orderDetailKey(payload)] },
  { table: "service_order_used_items", keys: payload => [orderDetailKey(payload), queryKeys.inventory.all] },
  { table: "appointments", keys: [queryKeys.appointments.all, queryKeys.admin.dashboards()] },
  { table: "queue_integration_settings", keys: [queryKeys.queueIntegration.all] },
  { table: "quote_requests", keys: [queryKeys.quotes.all, queryKeys.customers.all, queryKeys.admin.dashboards()] },
  { table: "quote_status_history", keys: [queryKeys.quotes.all, queryKeys.customers.all] },
  { table: "employees", keys: registrationEmployeeKeys },
  { table: "profiles", keys: [queryKeys.employees.all, queryKeys.orders.all, queryKeys.orders.workspace(), queryKeys.registrations.details(), queryKeys.registrations.permissionsAll, queryKeys.registrations.accessAll] },
];

// Consultas de um módulo inativo ficam apenas marcadas como desatualizadas.
// Assim telas retidas/minimizadas não geram GETs a cada evento de outra área.
function isForegroundQuery(queryKey: QueryKey, pathname: string) {
  const family = String(queryKey[0] ?? "");
  const route = pathname;
  const inOrders = route.startsWith("/admin/orders");
  const inInventory = route.startsWith("/admin/inventory");
  const inPdv = route.startsWith("/admin/pdv");
  const inFinance = route.startsWith("/admin/finance");
  const inOperation = route.startsWith("/admin/operation");
  const inSite = route.startsWith("/admin/site");
  if (family === "public-site") return inSite;
  if (family === "company-settings") return route.startsWith("/admin/operation/company");
  if (family === "queue-integration") return route.startsWith("/admin/tools/union-senhas");
  if (family === "admin-home" || family === "admin-notifications") return route === "/admin";
  if (family === "orders" || family === "orders-workspace" || family === "orders-total") return inOrders;
  if (family === "admin") return route.startsWith("/admin/dashboard");
  if (family === "finance") return inFinance || inPdv;
  if (family === "pdv") return inPdv;
  if (family === "inventory") return inInventory || inPdv || inOrders;
  if (family === "catalog") return inSite || inInventory || inOrders || inPdv;
  if (family === "appointments") return route.startsWith("/admin/agenda") || inOrders;
  if (family === "checklists") return inOrders || route.startsWith("/admin/operation/checklists") || route.startsWith("/admin/operation/equipment");
  if (family === "equipment") return inOrders || route.startsWith("/admin/operation/equipment");
  if (family === "documents") return inOrders || route.startsWith("/admin/operation/documents");
  if (family === "registrations") return route.startsWith("/admin/customers") || route.startsWith("/admin/partner-companies") || route.startsWith("/admin/operation/roles");
  if (family === "customers") return inOrders || route.startsWith("/admin/customers") || route.startsWith("/admin/quotes");
  if (family === "quotes") return route.startsWith("/admin/quotes");
  if (family === "order-situations" || family === "order-statuses" || family === "service-types" || family === "general-services") return inOperation || inOrders;
  if (family === "employees") return inOperation || inOrders || route.startsWith("/admin/agenda");
  return true;
}

// Não recriar canal em cada subrota (OS -> Documentos -> OS).
// Somente quando o módulo de trabalho realmente muda.
function subscriptionScope(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[1] === "operation" || parts[1] === "site" || parts[1] === "tools") {
    return parts.slice(0, 3).join("/") || "admin";
  }
  return parts.slice(0, 2).join("/") || "admin";
}

export function QueryRealtimeSync() {
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const scope = subscriptionScope(pathname);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const { activeOrganizationId, activeOrganization } = useAuth();

  // Reativar somente os caches vencidos do módulo que acabou de ser aberto.
  // Um cache não observado não é consultado apenas porque houve navegação.
  useEffect(() => {
    void queryClient.refetchQueries({
      type: "active",
      stale: true,
      predicate: query => isForegroundQuery(query.queryKey, pathname),
    });
  }, [queryClient, scope]);
  const isPlatformOperator = activeOrganization?.is_platform_operator === true;

  useEffect(() => {
    if (!activeOrganizationId) return;

    const pending = new Map<string, ReturnType<typeof window.setTimeout>>();
    let channel = supabase.channel(
      `query-cache-sync:${activeOrganizationId}:${isPlatformOperator ? "platform" : "tenant"}:${scope.replace(/[^a-z0-9/-]/gi, "-")}`,
    );

    const scheduleInvalidation = (queryKey: QueryKey) => {
      const id = JSON.stringify(queryKey);
      // Throttle em vez de debounce: eventos contínuos nunca podem deixar a
      // tela sem atualização, nem gerar um SELECT para cada linha alterada.
      if (pending.has(id)) return;
      pending.set(
        id,
        window.setTimeout(() => {
          pending.delete(id);
          void queryClient.invalidateQueries({
            queryKey,
            refetchType: isForegroundQuery(queryKey, pathnameRef.current) ? "active" : "none",
          });
        }, 900),
      );
    };

    for (const { table, keys } of tableQueryKeys) {
      if (!realtimePublishedTables.has(table)) continue;
      // Não assinar todas as tabelas do banco enquanto o usuário está,
      // por exemplo, apenas na página inicial. Funções que geram chaves
      // são avaliadas sem payload para obter seus prefixos de cache.
      const relevantKeys = typeof keys === "function" ? keys({}) : keys;
      if (!relevantKeys.some(key => isForegroundQuery(key, pathnameRef.current))) continue;

      const handleChange = (payload: RealtimePayload) => {
        const resolvedKeys = typeof keys === "function" ? keys(payload) : keys;
        for (const queryKey of resolvedKeys) scheduleInvalidation(queryKey);
      };

      if (isPlatformOperator) {
        channel = channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          payload => handleChange(payload as RealtimePayload),
        );
        continue;
      }

      const organizationFilter = organizationScopedRealtimeTables.has(table)
        ? `organization_id=eq.${activeOrganizationId}`
        : null;

      // Uma única assinatura por tabela (em vez de INSERT + UPDATE).
      // Quando o evento DELETE disponibilizar o identificador filtrável,
      // ele também invalidará os caches afetados.
      channel = channel.on(
        "postgres_changes",
        organizationFilter
          ? { event: "*", schema: "public", table, filter: organizationFilter }
          : { event: "*", schema: "public", table },
        payload => handleChange(payload as RealtimePayload),
      );
    }

    // AppQueryProvider já limpa uma vez o cache na troca de empresa.
    // Repetir o clear aqui gerava desmontagem/GETs duplicados.
    channel.subscribe();

    return () => {
      for (const timeout of pending.values()) window.clearTimeout(timeout);
      void supabase.removeChannel(channel);
    };
  }, [queryClient, activeOrganizationId, isPlatformOperator, scope]);

  return null;
}
