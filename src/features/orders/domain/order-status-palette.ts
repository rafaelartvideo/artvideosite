import { STATUS_TONE_CLASSES, STATUS_TONE_HEX } from "@/shared/domain/status-tone";

/** Status geral da OS tem cores próprias, independentes dos estados de tarefas. */
export function getOrderStatusTone(status?: string | null): "success" | "progress" | "danger" | "neutral" {
  const normalized = String(status || "").trim().toLocaleLowerCase("pt-BR")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized === "aberta" || normalized === "aberto") return "success";
  if (normalized === "fechada" || normalized === "fechado") return "progress";
  if (normalized === "cancelada" || normalized === "cancelado") return "danger";
  return "neutral";
}

export function getOrderStatusBadgeClass(status?: string | null) {
  return STATUS_TONE_CLASSES[getOrderStatusTone(status)].badge;
}

export function getOrderStatusHex(status?: string | null, configuredColor?: string | null) {
  const tone = getOrderStatusTone(status);
  return tone === "neutral" ? (configuredColor || STATUS_TONE_HEX.neutral) : STATUS_TONE_HEX[tone];
}
