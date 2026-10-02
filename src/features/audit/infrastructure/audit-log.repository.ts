import { supabase } from "@/lib/supabase";

export type AuditOperation = "insert" | "update" | "delete";

export type AuditLogEntry = {
  id: number;
  organization_id: string | null;
  actor_user_id: string | null;
  actor_name_snapshot: string | null;
  action: string;
  operation: AuditOperation | null;
  entity_type: string | null;
  entity_id: string | null;
  table_name: string | null;
  module_key: string | null;
  context_type: string | null;
  context_id: string | null;
  source: string | null;
  changed_fields: Record<string, { before?: unknown; after?: unknown }> | null;
  row_snapshot: Record<string, unknown> | null;
  resolved_changed_fields?: Record<string, { before?: unknown; after?: unknown }> | null;
  resolved_row_snapshot?: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  linked_service_order_id?: string | null;
  linked_service_order_number?: string | null;
  changed_field_count?: number;
  first_changed_field?: string | null;
  created_at: string;
};

export type AuditActor = {
  id: string;
  name: string;
};

export type AuditLogFilters = {
  page: number;
  pageSize: number;
  actorUserId?: string;
  moduleKey?: string;
  operation?: string;
  contextId?: string;
  dateFrom?: string;
  dateTo?: string;
};

function startOfLocalDayIso(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function endOfLocalDayIso(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function listAuditLogs(organizationId: string, filters: AuditLogFilters) {
  const page = Math.max(1, filters.page);
  const pageSize = Math.max(1, Math.min(filters.pageSize, 100));
  const dateFrom = startOfLocalDayIso(filters.dateFrom || "");
  const dateTo = endOfLocalDayIso(filters.dateTo || "");
  const contextId = filters.contextId?.trim() || "";

  const { data, error } = await supabase.rpc(
    "search_organization_audit_log_page_v1",
    {
      p_organization_id: organizationId,
      p_page: page,
      p_page_size: pageSize,
      p_actor_user_id: filters.actorUserId || null,
      p_module_key: filters.moduleKey || "",
      p_operation: filters.operation || "",
      p_context_id: contextId,
      p_date_from: dateFrom,
      p_date_to: dateTo,
    },
  );
  if (error) throw error;

  const rows = (data || []) as Array<AuditLogEntry & { total_count: number | string }>;
  return {
    items: rows.map(({ total_count: _totalCount, ...item }) => ({
      ...item,
      changed_fields: null,
      row_snapshot: null,
      resolved_changed_fields: null,
      resolved_row_snapshot: null,
      metadata: null,
    })),
    total: rows.length ? Number(rows[0].total_count || 0) : 0,
  };
}

export async function getAuditLogDetail(
  organizationId: string,
  auditLogId: number,
): Promise<AuditLogEntry | null> {
  const { data, error } = await supabase.rpc(
    "get_organization_audit_log_detail_v2",
    {
      p_organization_id: organizationId,
      p_audit_log_id: auditLogId,
    },
  );
  if (error) throw error;
  const row = (data || [])[0] as AuditLogEntry | undefined;
  return row || null;
}

export async function listAuditActors(organizationId: string): Promise<AuditActor[]> {
  const { data, error } = await supabase.rpc(
    "list_organization_audit_actors_v1",
    { p_organization_id: organizationId },
  );
  if (error) throw error;

  return ((data || []) as Array<{ id: string; name: string }>).map(row => ({
    id: String(row.id),
    name: String(row.name || "Usuário"),
  }));
}
