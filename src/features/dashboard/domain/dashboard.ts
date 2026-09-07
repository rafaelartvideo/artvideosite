export type DashboardModule =
  | "overview"
  | "orders"
  | "customers"
  | "employees"
  | "inventory"
  | "agenda"
  | "quotes"
  | "finance";

export type DashboardAccess = {
  orders: boolean;
  customers: boolean;
  employees: boolean;
  inventory: boolean;
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

export type DashboardCustomer = {
  id: string;
  full_name: string;
  created_at: string;
};

export type DashboardEmployee = {
  id: string;
  full_name: string;
  function_name: string | null;
  is_active: boolean;
};

export type DashboardInventoryItem = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  quantity: number | null;
  min_quantity: number | null;
  purchase_price: number | null;
  sale_price: number | null;
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
  customers: DashboardCustomer[];
  employees: DashboardEmployee[];
  inventory: DashboardInventoryItem[];
  appointments: DashboardAppointment[];
  quotes: DashboardQuote[];
};
