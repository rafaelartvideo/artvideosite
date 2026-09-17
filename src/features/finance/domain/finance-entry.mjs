const cents = value => Math.round((Number(value) || 0) * 100);
const money = value => Math.round(value) / 100;

export function splitInstallmentAmounts(total, count) {
  const installmentCount = Math.max(1, Math.trunc(Number(count) || 1));
  const totalCents = cents(total);
  const base = Math.floor(totalCents / installmentCount);
  let remainder = totalCents - base * installmentCount;
  return Array.from({ length: installmentCount }, () => {
    const current = base + (remainder-- > 0 ? 1 : 0);
    return money(current);
  });
}

function addMonths(dateText, months) {
  const [year, month, day] = String(dateText).split("-").map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

export function buildMonthlyInstallments(total, count, firstDueDate) {
  const amounts = splitInstallmentAmounts(total, count);
  return amounts.map((amount, index) => ({
    installment_number: index + 1,
    total_installments: amounts.length,
    due_date: addMonths(firstDueDate, index),
    amount,
  }));
}

export function allocationAmount(total, mode, value) {
  if (mode === "percentage") return money(cents(total) * Math.max(0, Number(value) || 0) / 100);
  return money(cents(value));
}

export function validateAllocationTotal(total, allocations) {
  const expected = cents(total);
  const allocated = (allocations || []).reduce((sum, item) => sum + cents(item?.amount), 0);
  return {
    ok: allocated === expected,
    expected: money(expected),
    allocated: money(allocated),
    difference: money(expected - allocated),
  };
}

export function deriveEntryStatus(installments, today) {
  const rows = installments || [];
  if (!rows.length) return "open";
  const remaining = rows.map(row => Math.max(0, cents(row.original_amount) - cents(row.settled_amount)));
  const remainingTotal = remaining.reduce((sum, value) => sum + value, 0);
  if (remainingTotal === 0) return "settled";
  const originalTotal = rows.reduce((sum, row) => sum + cents(row.original_amount), 0);
  if (remainingTotal < originalTotal) return "partial";
  if (rows.some((row, index) => remaining[index] > 0 && row.due_date < today)) return "overdue";
  return "open";
}
