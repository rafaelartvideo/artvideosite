import type { Address } from "@/lib/address";
import {
  formatPhone,
  foundationDateFromIso,
  foundationDateToIso,
  isPastOrTodayBrazilianDate,
  isValidBrazilianMobile,
  isValidBrazilianPhone,
  isValidCnpj,
  isValidCpf,
  isValidEmail,
  normalizeDigits,
} from "@/shared/domain/formatters";
import type { Registration, RegistrationRole } from "../infrastructure/registrations.repository";

export type RegistrationFormState = {
  person_type: "PF" | "PJ";
  name: string;
  legal_name: string;
  trade_name: string;
  document: string;
  state_registration: string;
  municipal_registration: string;
  birth_date: string;
  foundation_date: string;
  phone: string;
  whatsapp: string;
  email: string;
  is_active: boolean;
  roles: RegistrationRole[];
  job_title: string;
  team_name: string;
  admission_date: string;
};

export type RegistrationAddressForm = Address & {
  id?: string;
  type: string;
  is_primary: boolean;
};

export const emptyRegistrationForm = (): RegistrationFormState => ({
  person_type: "PF",
  name: "",
  legal_name: "",
  trade_name: "",
  document: "",
  state_registration: "",
  municipal_registration: "",
  birth_date: "",
  foundation_date: "",
  phone: "",
  whatsapp: "",
  email: "",
  is_active: true,
  roles: ["customer"],
  job_title: "",
  team_name: "",
  admission_date: "",
});

export const emptyRegistrationAddress = (primary = false): RegistrationAddressForm => ({
  zip_code: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  reference: "",
  shared_map_url: "",
  is_default: primary,
  type: primary ? "Principal" : "Outro",
  is_primary: primary,
});

export function activeRegistrationRoles(registration: Registration) {
  return (registration.roles || []).filter(item => item.is_active).map(item => item.role);
}

export function primaryRegistrationAddress(registration: Registration) {
  return (registration.addresses || []).find(address => address.is_primary && address.is_active !== false)
    || (registration.addresses || []).find(address => address.is_active !== false)
    || null;
}

export function registrationFormFromRecord(registration: Registration): RegistrationFormState {
  const employee = registration.employee_details?.[0];
  return {
    person_type: registration.person_type,
    name: registration.person_type === "PJ"
      ? registration.trade_name || registration.name || ""
      : registration.name || "",
    legal_name: registration.legal_name || "",
    trade_name: registration.trade_name || registration.name || "",
    document: registration.document || "",
    state_registration: registration.state_registration || "",
    municipal_registration: registration.municipal_registration || "",
    birth_date: foundationDateFromIso(registration.birth_date),
    foundation_date: foundationDateFromIso(registration.foundation_date),
    phone: formatPhone(registration.phone),
    whatsapp: formatPhone(registration.whatsapp),
    email: registration.email || "",
    is_active: registration.is_active !== false,
    roles: activeRegistrationRoles(registration),
    job_title: employee?.job_title || "",
    team_name: employee?.team_name || "",
    admission_date: employee?.admission_date || "",
  };
}

export function registrationAddressesFromRecord(registration: Registration): RegistrationAddressForm[] {
  const active = (registration.addresses || [])
    .filter(address => address.is_active !== false)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));

  if (!active.length) return [emptyRegistrationAddress(true)];

  return active.map(address => ({
    id: address.id,
    type: address.type || (address.is_primary ? "Principal" : "Outro"),
    zip_code: address.zip_code || "",
    street: address.street || "",
    number: address.number || "",
    complement: address.complement || "",
    neighborhood: address.neighborhood || "",
    city: address.city || "",
    state: address.state || "",
    reference: address.reference || "",
    shared_map_url: address.location_url || "",
    is_default: address.is_primary !== false,
    is_primary: address.is_primary !== false,
  }));
}

export function registrationDisplayName(form: RegistrationFormState) {
  return form.person_type === "PJ"
    ? form.trade_name.trim() || form.legal_name.trim()
    : form.name.trim();
}

export function registrationEntityPayload(form: RegistrationFormState) {
  return {
    person_type: form.person_type,
    name: registrationDisplayName(form),
    legal_name: form.person_type === "PJ" ? form.legal_name.trim() : "",
    trade_name: form.person_type === "PJ" ? form.trade_name.trim() : "",
    document: normalizeDigits(form.document),
    state_registration: form.person_type === "PJ" ? form.state_registration.trim() : "",
    municipal_registration: form.person_type === "PJ" ? form.municipal_registration.trim() : "",
    birth_date: form.person_type === "PF" ? foundationDateToIso(form.birth_date) : "",
    foundation_date: form.person_type === "PJ" ? foundationDateToIso(form.foundation_date) : "",
    phone: normalizeDigits(form.phone),
    whatsapp: normalizeDigits(form.whatsapp),
    email: form.email.trim().toLowerCase(),
    is_active: form.is_active,
  };
}

export function registrationAddressPayload(address: RegistrationAddressForm) {
  return {
    id: address.id || null,
    type: address.is_primary ? "Principal" : (address.type?.trim() || "Outro"),
    zip_code: normalizeDigits(address.zip_code),
    state: address.state.trim().toUpperCase(),
    city: address.city.trim(),
    neighborhood: address.neighborhood.trim(),
    street: address.street.trim(),
    number: address.number.trim(),
    complement: address.complement.trim(),
    reference: address.reference?.trim() || "",
    location_url: address.shared_map_url?.trim() || "",
    is_primary: address.is_primary,
  };
}

export function validateRegistrationForm(form: RegistrationFormState) {
  if (!form.roles.length) return "Selecione ao menos um vínculo.";
  if (!form.phone.trim() && !form.whatsapp.trim()) return "Telefone ou WhatsApp é obrigatório.";
  if (form.phone && !isValidBrazilianPhone(form.phone)) return "Telefone inválido. Informe DDD e número válidos.";
  if (form.whatsapp && !isValidBrazilianMobile(form.whatsapp)) return "WhatsApp inválido. Informe um celular com DDD válido.";
  if (form.email && !isValidEmail(form.email)) return "E-mail inválido. Verifique o endereço informado.";

  if (form.person_type === "PF") {
    if (!form.name.trim()) return "Nome completo é obrigatório.";
    if (!isValidCpf(form.document)) return "CPF inválido. Verifique os números informados.";
    if (!form.birth_date) return "Data de nascimento é obrigatória.";
    if (!isPastOrTodayBrazilianDate(form.birth_date)) return "Data de nascimento inválida ou futura.";
  } else {
    if (!form.trade_name.trim()) return "Nome fantasia é obrigatório.";
    if (!isValidCnpj(form.document)) return "CNPJ inválido. Verifique os números informados.";
    if (form.foundation_date && !isPastOrTodayBrazilianDate(form.foundation_date)) return "Data de fundação inválida ou futura.";
  }

  if (form.roles.includes("employee") && form.person_type !== "PF") return "Funcionário deve ser Pessoa Física.";
  if (form.roles.includes("employee") && !isValidCpf(form.document)) return "Informe um CPF válido para o funcionário.";
  return null;
}
