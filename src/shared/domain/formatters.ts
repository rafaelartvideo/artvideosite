export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function slugify(value: string) {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

const BRAZILIAN_DDDS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

export function getWhatsAppUrl(value?: string | null) {
  const digits = normalizeDigits(value);
  return digits ? `https://wa.me/${digits}` : null;
}

export function formatPhone(value: string | number | null | undefined) {
  const digits = normalizeDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function isValidBrazilianPhone(value: unknown) {
  const digits = normalizeDigits(value);
  if (digits.length !== 10 && digits.length !== 11) return false;
  if (!BRAZILIAN_DDDS.has(digits.slice(0, 2))) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  if (digits.length === 11) return digits[2] === "9";
  return /^[2-5]$/.test(digits[2]);
}

export function isValidBrazilianMobile(value: unknown) {
  const digits = normalizeDigits(value);
  return digits.length === 11
    && BRAZILIAN_DDDS.has(digits.slice(0, 2))
    && digits[2] === "9"
    && !/^(\d)\1+$/.test(digits);
}

export function formatCpf(value: string) {
  const digits = normalizeDigits(value).slice(0, 11);
  return digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

export function isValidCpf(value: string): boolean {
  const digits = normalizeDigits(value);
  if (digits.length !== 11 || /^([0-9])\1{10}$/.test(digits)) return false;
  const firstTotal = digits.slice(0, 9).split("").reduce((sum, digit, index) => sum + Number(digit) * (10 - index), 0);
  const firstRemainder = (firstTotal * 10) % 11;
  if ((firstRemainder === 10 ? 0 : firstRemainder) !== Number(digits[9])) return false;
  const secondTotal = digits.slice(0, 10).split("").reduce((sum, digit, index) => sum + Number(digit) * (11 - index), 0);
  const secondRemainder = (secondTotal * 10) % 11;
  return (secondRemainder === 10 ? 0 : secondRemainder) === Number(digits[10]);
}

export function formatCnpj(value: string) {
  const digits = normalizeDigits(value).slice(0, 14);
  return digits.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4").replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

export function isValidCnpj(value: string): boolean {
  const digits = normalizeDigits(value);
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;

  const calculateDigit = (base: string, weights: number[]) => {
    const sum = base.split("").reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const first = calculateDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (first !== Number(digits[12])) return false;
  const second = calculateDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return second === Number(digits[13]);
}

export function isValidEmail(value: unknown) {
  const email = String(value ?? "").trim();
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function formatFoundationDate(value: string) {
  const digits = normalizeDigits(value).slice(0, 8);
  return digits.replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
}

export const formatBrazilianDateInput = formatFoundationDate;

export function isValidBrazilianDate(value: string) {
  const match = String(value ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isValidIsoDate(value: string) {
  const match = String(value ?? "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isPastOrTodayIsoDate(value: string) {
  if (!isValidIsoDate(value)) return false;
  return value.slice(0, 10) <= todayDateOnly();
}

export function isPastOrTodayBrazilianDate(value: string) {
  if (!isValidBrazilianDate(value)) return false;
  const iso = foundationDateToIso(value);
  return Boolean(iso && iso <= todayDateOnly());
}

export function foundationDateToIso(value: string) {
  if (!isValidBrazilianDate(value)) return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

export function foundationDateFromIso(value?: string | null) {
  if (!value) return "";
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function formatDateOnly(value?: string | null, fallback = "") {
  if (!value) return fallback;
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function formatDateTime(value?: string | Date | null, fallback = "—") {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function todayDateOnly() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function formatCurrency(value: number | string | null | undefined, fallback = "—") {
  if (value == null || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numeric);
}

export function parseCurrencyInput(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  }
  const normalized = raw
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

export function formatNumber(value: number | string | null | undefined, options?: Intl.NumberFormatOptions, fallback = "—") {
  if (value == null || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return new Intl.NumberFormat("pt-BR", options).format(numeric);
}

export function normalizeIntegerInput(value: unknown, { allowNegative = false }: { allowNegative?: boolean } = {}) {
  const raw = String(value ?? "");
  const sign = allowNegative && raw.trim().startsWith("-") ? "-" : "";
  return sign + normalizeDigits(raw);
}

export function normalizeDecimalInput(value: unknown, { allowNegative = false, decimalPlaces = 2 }: { allowNegative?: boolean; decimalPlaces?: number } = {}) {
  const raw = String(value ?? "").replace(/\s/g, "").replace(",", ".");
  const sign = allowNegative && raw.startsWith("-") ? "-" : "";
  const unsigned = raw.replace(/-/g, "").replace(/[^\d.]/g, "");
  const [integerPart = "", ...decimalParts] = unsigned.split(".");
  const decimals = decimalParts.join("").slice(0, Math.max(0, decimalPlaces));
  if (!integerPart && !decimals) return "";
  return `${sign}${integerPart || "0"}${decimalParts.length ? `.${decimals}` : ""}`;
}
