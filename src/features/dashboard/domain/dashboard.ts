export type DashboardModule =
  | "overview"
  | "orders"
  | "registrations"
  | "inventory"
  | "agenda"
  | "quotes"
  | "finance"
  | "attendances";

export type DashboardAccess = {
  orders: boolean;
  registrations: boolean;
  inventory: boolean;
  inventoryCosts: boolean;
  agenda: boolean;
  quotes: boolean;
};

export type DashboardRelation = {
  id?: string;
  name?: string | null;
  title?: string | null;
  full_name?: string | null;
  color?: string | null;
};

export type DashboardOrder = {
  id: string;
  os_number: string | null;
  customer_id: string | null;
  quote_request_id: string | null;
  technician_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  solved_at: string | null;
  final_total: number | null;
  discount_amount: number | null;
  order_status: DashboardRelation | null;
  situation: DashboardRelation | null;
  customer: DashboardRelation | null;
  technician: DashboardRelation | null;
  technician_links: Array<{ employee_id: string; employee: DashboardRelation | null }>;
};

export type DashboardSlaState = "success" | "warning" | "danger" | "neutral";

export type DashboardOrderDistributionItem = {
  id: string | null;
  name: string;
  color: string | null;
  total: number;
  sla?: Record<DashboardSlaState, number>;
};

export type DashboardOrdersCharts = {
  opened: Array<{ name: string; value: number }>;
  service_types: Array<{ name: string; value: number }>;
  equipment_types: Array<{ name: string; value: number }>;
  equipment_models: Array<{ name: string; value: number }>;
  quote_approved: Array<{ name: string; value: number }>;
  quote_rejected: Array<{ name: string; value: number }>;
};

export type DashboardOrdersSummary = {
  total_orders: number;
  orders_in_period: number;
  active_orders: number;
  waiting_orders: number;
  completed_in_period: number;
  situations: DashboardOrderDistributionItem[];
  statuses: DashboardOrderDistributionItem[];
};

export type DashboardOrderSelectionKind = "situation" | "status" | "opened" | "service_type" | "equipment_type" | "equipment_model" | "quote_approved" | "quote_rejected" | "metric_opened" | "metric_active" | "metric_waiting" | "metric_completed";

export type DashboardOrderSelectionPage = { total: number; rows: DashboardOrderGroupItem[] };

export type DashboardOrderGroupItem = {
  row_key?: string;
  event_at?: string | null;
  quote_version?: number | null;
  id: string;
  os_number: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  customer: DashboardRelation | null;
  order_status: DashboardRelation | null;
  situation: DashboardRelation | null;
  sla_state?: DashboardSlaState | null;
};

export type DashboardRegistration = {
  id: string;
  name: string;
  person_type: "PF" | "PJ";
  is_active: boolean;
  created_at: string;
  roles: Array<{ role: "customer" | "employee" | "supplier"; is_active: boolean }>;
};

export type DashboardInventoryItem = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  quantity: number | null;
  min_quantity: number | null;
  average_cost?: number | null;
  is_active: boolean;
};

export type DashboardAppointment = {
  id: string;
  appointment_date: string;
  period: string | null;
  start_time: string | null;
  is_return: boolean;
  customer: DashboardRelation | null;
  situation: DashboardRelation | null;
};

export type DashboardQuote = {
  id: string;
  protocol: string | null;
  customer_id: string | null;
  created_at: string;
  estimated_price: number | null;
  final_price: number | null;
  request_status: DashboardRelation | null;
  customer: DashboardRelation | null;
  service: DashboardRelation | null;
  brand: DashboardRelation | null;
};

export type DashboardOverview = {
  orders: DashboardOrder[];
  registrations: DashboardRegistration[];
  inventory: DashboardInventoryItem[];
  appointments: DashboardAppointment[];
  quotes: DashboardQuote[];
};
