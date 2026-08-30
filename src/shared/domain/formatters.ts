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

export function getWhatsAppUrl(value?: string | null) {
  const digits = (value || "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export function formatPhone(value: string | number | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function formatCpf(value: string) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 11);
  return digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

export function isValidCpf(value: string): boolean {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 11 || /^([0-9])\1{10}$/.test(digits)) return false;
  const firstTotal = digits.slice(0, 9).split("").reduce((sum, digit, index) => sum + Number(digit) * (10 - index), 0);
  const firstRemainder = (firstTotal * 10) % 11;
  if ((firstRemainder === 10 ? 0 : firstRemainder) !== Number(digits[9])) return false;
  const secondTotal = digits.slice(0, 10).split("").reduce((sum, digit, index) => sum + Number(digit) * (11 - index), 0);
  const secondRemainder = (secondTotal * 10) % 11;
  return (secondRemainder === 10 ? 0 : secondRemainder) === Number(digits[10]);
}

export function formatCnpj(value: string) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 14);
  return digits.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4").replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

export function formatFoundationDate(value: string) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 8);
  return digits.replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
}

export function foundationDateToIso(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

export function foundationDateFromIso(value?: string | null) {
  if (!value) return "";
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function formatDateOnly(value?: string | null) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function todayDateOnly() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
