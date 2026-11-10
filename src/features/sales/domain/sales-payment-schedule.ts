/** Cálculo em centavos: mesma distribuição usada pelo motor financeiro SQL. */
export function parseSalesMoney(text: string): number {
  const raw = String(text || "").trim().replace(/^R\$\s*/, "").replace(/\s/g, "");
  if (!raw) return 0;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(?:\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value > 999999999) return Number.NaN;
  return Math.round(value * 100) / 100;
}

export const salesMoneyText = (value: number) =>
  (Math.round(value * 100) / 100).toFixed(2).replace(".", ",");

export function localSalesDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")].join("-");
}

export function salesMonthlyDate(firstDate: string, offset: number): string {
  const [year, month, day] = firstDate.split("-").map(Number);
  if (!year || !month || !day || month < 1 || month > 12 || offset < 0) return "";
  const firstOfMonth = new Date(Date.UTC(year, month - 1 + offset, 1));
  const lastDay = new Date(Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0)).getUTCDate();
  return [firstOfMonth.getUTCFullYear(), String(firstOfMonth.getUTCMonth() + 1).padStart(2, "0"),
    String(Math.min(day, lastDay)).padStart(2, "0")].join("-");
}

export function splitSalesInstallments(total: number, count: number, firstDate: string) {
  if (!Number.isInteger(count) || count < 1 || count > 12 || !firstDate || !Number.isFinite(total)) return [];
  const cents = Math.round(total * 100);
  if (cents < count) return [];
  const base = Math.floor(cents / count);
  const extra = cents % count;
  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    dueDate: salesMonthlyDate(firstDate, index),
    amount: (base + (index < extra ? 1 : 0)) / 100,
  }));
}
