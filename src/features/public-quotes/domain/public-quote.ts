import {
  formatBrazilianDateInput,
  formatCnpj as sharedFormatCnpj,
  formatCpf as sharedFormatCpf,
  foundationDateToIso,
  isPastOrTodayBrazilianDate,
  isValidCpf as sharedIsValidCpf,
  normalizeDigits,
} from "@/shared/domain/formatters";

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

export const normalizeDocument = (value: string) => normalizeDigits(value);
export const formatCpf = sharedFormatCpf;
export const formatCnpj = sharedFormatCnpj;
export const formatPublicDate = formatBrazilianDateInput;
export const publicDateToIso = foundationDateToIso;
export const isValidPastOrCurrentDate = isPastOrTodayBrazilianDate;
export const isValidCpf = sharedIsValidCpf;

export function generateQuoteProtocol(): string {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `ORC-${date}-${Math.floor(Math.random() * 9000) + 1000}`;
}
