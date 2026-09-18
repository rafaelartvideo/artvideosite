const SECTIONS = new Set(["overview", "receivables", "payables", "movements", "accounts", "recurring", "reports", "registries"]);
const REGISTRIES = new Set(["categories", "cost-centers", "payment-methods", "settings"]);

export function financeRoute(resourceId, subpage) {
  const section = SECTIONS.has(resourceId) ? resourceId : "overview";
  if (section === "receivables" || section === "payables") {
    return { section, registry: null, entryId: subpage || null };
  }
  if (section !== "registries") return { section, registry: null };
  return {
    section,
    registry: REGISTRIES.has(subpage) ? subpage : "categories",
  };
}

export function paymentMethodNetAmount(amount, percentageFee, fixedFee) {
  const gross = Math.max(0, Number(amount) || 0);
  const percent = Math.min(100, Math.max(0, Number(percentageFee) || 0));
  const fixed = Math.max(0, Number(fixedFee) || 0);
  return Math.max(0, Math.round((gross - gross * percent / 100 - fixed) * 100) / 100);
}

export function validateSecondApprovalThreshold(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: null };
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0
    ? { ok: true, value: parsed }
    : { ok: false, value: null };
}
