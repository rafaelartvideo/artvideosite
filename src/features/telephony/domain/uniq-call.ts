export const ARTVIDEO_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";

export type UniqCallDirection = "INGRESS" | "EGRESS" | string;
export type UniqCallState = "ESTABLISHED" | "RELEASED" | string;

export type UniqCallCustomer = {
  id: string;
  full_name?: string | null;
  trade_name?: string | null;
};

export type UniqCallServiceOrder = {
  id: string;
  os_number?: number | string | null;
};

export type UniqCall = {
  id: string;
  organization_id: string;
  uniq_call_id: string;
  direction?: UniqCallDirection | null;
  state?: UniqCallState | null;
  remote_phone?: string | null;
  remote_phone_digits?: string | null;
  uniq_subscriber_id?: string | null;
  answered_subscriber_id?: string | null;
  customer_id?: string | null;
  service_order_id?: string | null;
  setup_at?: string | null;
  answered_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  updated_at?: string | null;
  customer?: UniqCallCustomer | UniqCallCustomer[] | null;
  service_order?: UniqCallServiceOrder | UniqCallServiceOrder[] | null;
};

export function callCustomer(call: UniqCall) {
  if (!call.customer) return null;
  return Array.isArray(call.customer) ? call.customer[0] ?? null : call.customer;
}

export function callServiceOrder(call: UniqCall) {
  if (!call.service_order) return null;
  return Array.isArray(call.service_order) ? call.service_order[0] ?? null : call.service_order;
}

export function formatUniqPhone(value?: string | null) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value || "Número não informado";
}

export function formatCallDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${clock}` : clock;
}
