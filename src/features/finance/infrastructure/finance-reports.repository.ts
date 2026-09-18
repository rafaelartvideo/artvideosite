import { supabase } from "@/lib/supabase";
import type {
  FinancialCashFlowReport,
  FinancialDashboardSummary,
  FinancialDreReport,
  FinancialReportFilters,
} from "../domain/finance.types";

function requiredOrganizationId(organizationId: string) {
  const normalized = String(organizationId || "").trim();
  if (!normalized) throw new Error("Empresa ativa não encontrada.");
  return normalized;
}

function requiredDate(value: string, label: string) {
  const normalized = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`${label} inválida.`);
  return normalized;
}

function numberValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalId(value?: string | null) {
  const normalized = String(value || "").trim();
  return normalized && normalized !== "all" ? normalized : null;
}

function normalizeDashboard(data: any): FinancialDashboardSummary {
  return {
    from: String(data?.from || ""),
    to: String(data?.to || ""),
    visibility: {
      balance: Boolean(data?.visibility?.balance),
      receivables: Boolean(data?.visibility?.receivables),
      payables: Boolean(data?.visibility?.payables),
      result: Boolean(data?.visibility?.result),
      approvals: Boolean(data?.visibility?.approvals),
      collections: Boolean(data?.visibility?.collections),
      scheduled_settlements: Boolean(data?.visibility?.scheduled_settlements),
    },
    available_balance: numberValue(data?.available_balance),
    receivable_open: numberValue(data?.receivable_open),
    payable_open: numberValue(data?.payable_open),
    overdue_receivable: numberValue(data?.overdue_receivable),
    overdue_payable: numberValue(data?.overdue_payable),
    due_today_receivable: numberValue(data?.due_today_receivable),
    due_today_payable: numberValue(data?.due_today_payable),
    upcoming_receivable: numberValue(data?.upcoming_receivable),
    upcoming_payable: numberValue(data?.upcoming_payable),
    period_revenue: numberValue(data?.period_revenue),
    period_expense: numberValue(data?.period_expense),
    period_result: numberValue(data?.period_result),
    pending_approvals: Number(data?.pending_approvals || 0),
    collection_followups: Number(data?.collection_followups || 0),
    overdue_scheduled_settlements: Number(data?.overdue_scheduled_settlements || 0),
  };
}

export async function getFinancialDashboard(
  organizationId: string,
  from: string,
  to: string,
): Promise<FinancialDashboardSummary> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("get_financial_dashboard", {
    p_organization_id: org,
    p_from: requiredDate(from, "Data inicial"),
    p_to: requiredDate(to, "Data final"),
  });
  if (error) throw error;
  return normalizeDashboard(data);
}

export async function getFinancialDre(
  organizationId: string,
  filters: FinancialReportFilters,
): Promise<FinancialDreReport> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("get_financial_dre", {
    p_organization_id: org,
    p_from: requiredDate(filters.from, "Data inicial"),
    p_to: requiredDate(filters.to, "Data final"),
    p_category_id: optionalId(filters.category_id),
    p_cost_center_id: optionalId(filters.cost_center_id),
    p_origin_type: optionalId(filters.origin_type),
  });
  if (error) throw error;
  const payload: any = data || {};
  return {
    from: String(payload.from || filters.from),
    to: String(payload.to || filters.to),
    rows: Array.isArray(payload.rows)
      ? payload.rows.map((row: any) => ({
          competence_month: String(row.competence_month || ""),
          category_id: String(row.category_id || ""),
          category_name: String(row.category_name || "Sem categoria"),
          nature: row.nature === "expense" ? "expense" : "revenue",
          report_group: String(row.report_group || "Sem grupo"),
          cost_center_id: row.cost_center_id ? String(row.cost_center_id) : null,
          cost_center_name: String(row.cost_center_name || "Sem centro de custo"),
          origin_type: row.origin_type || "other",
          amount: numberValue(row.amount),
        }))
      : [],
    totals: {
      revenue: numberValue(payload.totals?.revenue),
      expense: numberValue(payload.totals?.expense),
      result: numberValue(payload.totals?.result),
    },
  };
}

export async function getFinancialCashFlow(
  organizationId: string,
  filters: FinancialReportFilters,
): Promise<FinancialCashFlowReport> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("get_financial_cash_flow", {
    p_organization_id: org,
    p_from: requiredDate(filters.from, "Data inicial"),
    p_to: requiredDate(filters.to, "Data final"),
    p_account_id: optionalId(filters.account_id),
    p_category_id: optionalId(filters.category_id),
    p_cost_center_id: optionalId(filters.cost_center_id),
    p_origin_type: optionalId(filters.origin_type),
    p_payment_method_id: optionalId(filters.payment_method_id),
  });
  if (error) throw error;
  const payload: any = data || {};
  return {
    from: String(payload.from || filters.from),
    to: String(payload.to || filters.to),
    rows: Array.isArray(payload.rows)
      ? payload.rows.map((row: any) => ({
          date: String(row.date || ""),
          forecast_in: numberValue(row.forecast_in),
          forecast_out: numberValue(row.forecast_out),
          forecast_net: numberValue(row.forecast_net),
          realized_in: numberValue(row.realized_in),
          realized_out: numberValue(row.realized_out),
          realized_net: numberValue(row.realized_net),
        }))
      : [],
    totals: {
      forecast_in: numberValue(payload.totals?.forecast_in),
      forecast_out: numberValue(payload.totals?.forecast_out),
      forecast_net: numberValue(payload.totals?.forecast_net),
      realized_in: numberValue(payload.totals?.realized_in),
      realized_out: numberValue(payload.totals?.realized_out),
      realized_net: numberValue(payload.totals?.realized_net),
    },
  };
}
