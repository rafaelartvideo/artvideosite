import { formatDateTime } from "@/shared/domain/formatters";

export type PublicOrderHistory = {
  created_at: string;
  notes: string | null;
  order_status?: { name?: string | null } | null;
};

export type PublicTrackedOrder = {
  id: string;
  os_number?: string | null;
  tracking_token?: string | null;
  created_at: string;
  updated_at?: string | null;
  status: string;
  customer_notes?: string | null;
  internal_notes?: string | null;
  history: PublicOrderHistory[];
  title?: string | null;
  description?: string | null;
  estimated_delivery?: string | null;
};

export const TRACKING_STATUS_STEPS = [
  "Solicitação recebida",
  "Em análise",
  "Aguardando aprovação",
  "Em manutenção",
  "Pronto",
  "Finalizado",
] as const;

export function getTrackingStatusIndex(status: string): number {
  const lower = status?.toLowerCase() || "";
  if (lower.includes("receb") || lower.includes("abert") || lower.includes("pend")) return 0;
  if (lower.includes("anál") || lower.includes("anal")) return 1;
  if (lower.includes("aprov") || lower.includes("orç")) return 2;
  if (lower.includes("manuten") || lower.includes("exec") || lower.includes("anda")) return 3;
  if (lower.includes("pront") || lower.includes("conclu")) return 4;
  if (lower.includes("finaliz") || lower.includes("entreg")) return 5;
  return 0;
}

export function formatTrackingDate(date?: string | null): string {
  return formatDateTime(date, "-");
}
