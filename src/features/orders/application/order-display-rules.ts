import { formatCurrency, formatDateOnly, formatDateTime } from "@/shared/domain/formatters";

export function formatOrderDate(value?: string | null, time = false) {
  if (!value) return "—";
  return time ? formatDateTime(value) : formatDateOnly(value, "—");
}

export function equipmentSummary(order: any) {
  const type = order.equipment_type?.name;
  const brand = order.equipment_brand?.name;
  const model = order.equipment_model?.name || order.model;
  return [type, [brand, model].filter(Boolean).join(" ")].filter(Boolean).join(" • ") || "—";
}

export function stateLabel(state: unknown, states: { sigla: string; nome: string }[]) {
  const code = String(state ?? "").trim().toUpperCase();
  if (!code) return "";
  const match = states.find(item => item.sigla.trim().toUpperCase() === code);
  return match ? `${code} — ${match.nome}` : code;
}

export function situationsForType(
  serviceTypeId: string,
  links: any[],
  situations: any[],
  currentSituationId?: string,
  currentSituation?: any,
) {
  const orderedLinks = links
    .filter(link => link.service_type_id === serviceTypeId)
    .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0));
  if (orderedLinks.length === 0) return situations;
  const linkedIds = new Set(orderedLinks.map(link => link.situation_id));
  const allowed = orderedLinks
    .map(link => situations.find(situation => situation.id === link.situation_id))
    .filter(Boolean);
  const historical = currentSituationId && !linkedIds.has(currentSituationId)
    ? [currentSituation || situations.find(situation => situation.id === currentSituationId)].filter(Boolean)
    : [];
  return [...historical, ...allowed];
}

export function slaForOrder(
  serviceTypeId: string | undefined,
  situationId: string | undefined,
  relatedSituation: any,
  links: any[],
  situations: any[],
) {
  const link = links.find(item =>
    item.service_type_id === serviceTypeId && item.situation_id === situationId,
  );
  const situation = situations.find(item => item.id === situationId) || relatedSituation;
  if (!link || !situation) return null;
  const hours = Number(link.use_default_hours ? situation.hours : link.sla_hours);
  return Number.isFinite(hours) && hours > 0
    ? { hours, isDefault: link.use_default_hours !== false }
    : null;
}

export const formatSolvedAt = (value: string) => formatDateTime(value).replace(", ", " às ");
export const formatOrderCurrency = (value: number) => formatCurrency(value, "R$ 0,00");

export function usedItemsTotal(items: any[]) {
  return items.reduce((total, item) => {
    if (item.total_sale_price == null) return total;
    const itemTotal = Number(item.total_sale_price);
    return Number.isFinite(itemTotal) ? total + itemTotal : total;
  }, 0);
}
