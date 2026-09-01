export type PublicQuoteForm = {
  customerType: "PF" | "PJ";
  servico: string;
  marca: string;
  outraMarca: string;
  modelo: string;
  descricao: string;
  nome: string;
  cpf: string;
  tradeName: string;
  legalName: string;
  cnpj: string;
  stateRegistration: string;
  foundationDate: string;
  whatsapp: string;
  phone: string;
  birthDate: string;
  email: string;
};

export const EMPTY_PUBLIC_QUOTE_FORM: PublicQuoteForm = {
  customerType: "PF", servico: "", marca: "", outraMarca: "", modelo: "",
  descricao: "", nome: "", cpf: "", tradeName: "", legalName: "", cnpj: "",
  stateRegistration: "", foundationDate: "", whatsapp: "", phone: "",
  birthDate: "", email: "",
};

export const normalizeDocument = (value: string) => value.replace(/\D/g, "");

export function formatCpf(value: string): string {
  const digits = normalizeDocument(value).slice(0, 11);
  return digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

export function formatCnpj(value: string): string {
  const digits = normalizeDocument(value).slice(0, 14);
  return digits.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4").replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

export function formatPublicDate(value: string): string {
  const digits = normalizeDocument(value).slice(0, 8);
  return digits.replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
}

export function publicDateToIso(value: string): string | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

export function isValidPastOrCurrentDate(value: string): boolean {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && date <= today;
}

export function isValidCpf(value: string): boolean {
  const digits = normalizeDocument(value);
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let index = 0; index < 9; index++) sum += Number(digits[index]) * (10 - index);
  let remainder = (sum * 10) % 11;
  if (remainder >= 10) remainder = 0;
  if (remainder !== Number(digits[9])) return false;
  sum = 0;
  for (let index = 0; index < 10; index++) sum += Number(digits[index]) * (11 - index);
  remainder = (sum * 10) % 11;
  if (remainder >= 10) remainder = 0;
  return remainder === Number(digits[10]);
}

export function generateQuoteProtocol(): string {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `ORC-${date}-${Math.floor(Math.random() * 9000) + 1000}`;
}
