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

const AUDIT_SELECT = [
  "id",
  "organization_id",
  "actor_user_id",
  "actor_name_snapshot",
  "action",
  "operation",
  "entity_type",
  "entity_id",
  "table_name",
  "module_key",
  "context_type",
  "context_id",
  "source",
  "changed_fields",
  "row_snapshot",
  "metadata",
  "created_at",
].join(",");

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
  const pageSize = Math.max(1, filters.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("organization_audit_logs")
    .select(AUDIT_SELECT, { count: "exact" })
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.actorUserId) query = query.eq("actor_user_id", filters.actorUserId);
  if (filters.moduleKey) query = query.eq("module_key", filters.moduleKey);
  if (filters.operation) query = query.eq("operation", filters.operation);

  const contextId = filters.contextId?.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  if (contextId) {
    query = query.or(`context_id.eq.${contextId},entity_id.eq.${contextId}`);
  }

  const dateFrom = startOfLocalDayIso(filters.dateFrom || "");
  const dateTo = endOfLocalDayIso(filters.dateTo || "");
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", dateTo);

  const { data, error, count } = await query;
  if (error) throw error;

  const items = (data || []) as AuditLogEntry[];
  if (items.length === 0) return { items, total: count || 0 };

  const { data: displayRows, error: displayError } = await supabase.rpc(
    "resolve_organization_audit_log_display",
    { p_audit_log_ids: items.map(item => item.id) },
  );
  if (displayError) throw displayError;

  const displayById = new Map(
    (displayRows || []).map((row: any) => [Number(row.audit_log_id), row]),
  );

  return {
    items: items.map(item => {
      const display = displayById.get(item.id);
      return {
        ...item,
        resolved_changed_fields: display?.resolved_changed_fields || item.changed_fields || {},
        resolved_row_snapshot: display?.resolved_row_snapshot || item.row_snapshot || {},
      };
    }),
    total: count || 0,
  };
}

export async function listAuditActors(organizationId: string): Promise<AuditActor[]> {
  const { data, error } = await supabase
    .from("organization_audit_logs")
    .select("actor_user_id,actor_name_snapshot,created_at")
    .eq("organization_id", organizationId)
    .not("actor_user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) throw error;

  const seen = new Set<string>();
  const actors: AuditActor[] = [];
  for (const row of data || []) {
    const id = row.actor_user_id ? String(row.actor_user_id) : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    actors.push({
      id,
      name: String(row.actor_name_snapshot || "Usuário"),
    });
  }
  return actors.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
