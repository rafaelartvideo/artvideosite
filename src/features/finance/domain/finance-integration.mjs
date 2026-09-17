const toCents = value => Math.round((Number(value) || 0) * 100);
const fromCents = value => Math.round(value) / 100;

function isoDateParts(value) {
  const text = String(value || "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

function addMonthsClamped(dateText, months) {
  const parts = isoDateParts(dateText);
  if (!parts) throw new Error("Data de primeiro vencimento inválida.");
  const first = new Date(Date.UTC(parts.year, parts.month - 1 + months, 1));
  const targetYear = first.getUTCFullYear();
  const targetMonth = first.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(parts.day, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizePaymentSplits(total, splits = []) {
  const totalCents = Math.max(0, toCents(total));
  const payments = [];
  let paidCents = 0;

  for (const raw of Array.isArray(splits) ? splits : []) {
    const principalCents = toCents(raw?.principal_amount);
    if (principalCents <= 0) continue;
    const paymentMethodId = String(raw?.payment_method_id || "").trim();
    const accountId = String(raw?.financial_account_id || "").trim();
    if (!paymentMethodId || !accountId) {
      return { valid: false, reason: "missing_payment_data", totalPaid: fromCents(paidCents), openAmount: fromCents(Math.max(0, totalCents - paidCents)), payments };
    }
    paidCents += principalCents;
    payments.push({
      principal_amount: fromCents(principalCents),
      payment_method_id: paymentMethodId,
      financial_account_id: accountId,
      occurred_at: raw?.occurred_at || null,
    });
  }

  if (paidCents > totalCents) {
    return { valid: false, reason: "payments_exceed_total", totalPaid: fromCents(paidCents), openAmount: 0, payments };
  }

  return {
    valid: true,
    reason: null,
    totalPaid: fromCents(paidCents),
    openAmount: fromCents(totalCents - paidCents),
    payments,
  };
}

export function inventoryPurchaseTotal({ quantity, unitCost, discount = 0, freight = 0, otherCosts = 0 }) {
  const subtotalCents = Math.max(0, toCents(quantity) * toCents(unitCost) / 100);
  const totalCents = Math.max(
    0,
    Math.round(subtotalCents) - Math.max(0, toCents(discount)) + Math.max(0, toCents(freight)) + Math.max(0, toCents(otherCosts)),
  );
  return fromCents(totalCents);
}

export function buildInstallments(total, count, firstDueDate) {
  const totalCents = toCents(total);
  const normalizedCount = Math.trunc(Number(count) || 0);
  if (totalCents <= 0) throw new Error("O total das parcelas deve ser maior que zero.");
  if (normalizedCount < 1 || normalizedCount > 60) throw new Error("Informe entre 1 e 60 parcelas.");
  if (!isoDateParts(firstDueDate)) throw new Error("Data de primeiro vencimento inválida.");

  const base = Math.floor(totalCents / normalizedCount);
  let remainder = totalCents - base * normalizedCount;
  return Array.from({ length: normalizedCount }, (_, index) => {
    const cents = base + (remainder-- > 0 ? 1 : 0);
    return {
      installment_number: index + 1,
      due_date: addMonthsClamped(firstDueDate, index),
      amount: fromCents(cents),
    };
  });
}
