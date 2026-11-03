import type { Address } from "@/lib/address";
import {
  formatPhone,
  foundationDateFromIso,
  foundationDateToIso,
  isPastOrTodayBrazilianDate,
  isValidBrazilianPhone,
  isValidCnpj,
  isValidCpf,
  isValidEmail,
  normalizeDigits,
} from "@/shared/domain/formatters";
import type { Registration, RegistrationRole } from "../infrastructure/registrations.repository";

export type ProviderServiceForm = {
  id?: string;
  draft_key?: string;
  name: string;
  description: string;
  reference_price: string;
};

export function parseProviderReferencePrice(value: string): number | null {
  const raw = value.trim().replace(/^R\$\s*/, "").replace(/\s/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 && amount <= 9999999999.99 ? amount : null;
}

export function validateProviderServices(form: RegistrationFormState): string | null {
  if (!form.roles.includes("service_provider")) return null;
  if (!form.provider_services.length) return "Adicione pelo menos um serviço prestado.";
  if (form.provider_services.length > 30) return "Cadastre no máximo 30 serviços para cada prestador.";
  const names = new Set<string>();
  for (const service of form.provider_services) {
    const name = service.name.trim();
    if (!name || name.length > 120) return "Informe o nome de cada serviço (até 120 caracteres).";
    if (service.description.trim().length > 500) return "A descrição de cada serviço deve ter no máximo 500 caracteres.";
    const key = name.toLocaleLowerCase("pt-BR");
    if (names.has(key)) return "Não repita o mesmo serviço neste prestador.";
    names.add(key);
    if (service.reference_price.trim() && parseProviderReferencePrice(service.reference_price) === null) {
      return "Informe um valor de referência válido em reais, com até duas casas decimais.";
    }
  }
  return null;
}

export type RegistrationFormState = {
  person_type: "PF" | "PJ";
  name: string;
  legal_name: string;
  trade_name: string;
  document: string;
  state_registration: string;
  municipal_registration: string;
  birth_date: string;
  gender: "M" | "F" | "I" | "";
  foundation_date: string;
  phone: string;
  whatsapp: string;
  email: string;
  is_active: boolean;
  roles: RegistrationRole[];
  provider_services: ProviderServiceForm[];
  job_title: string;
  team_name: string;
  admission_date: string;
  field_tracking_prompt_on_login: boolean;
  disable_inactivity_logout: boolean;
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
  gender: "",
  foundation_date: "",
  phone: "",
  whatsapp: "",
  email: "",
  is_active: true,
  roles: ["customer"],
  provider_services: [],
  job_title: "",
  team_name: "",
  admission_date: "",
  field_tracking_prompt_on_login: false,
  disable_inactivity_logout: false,
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
    gender: ["M","F","I"].includes(registration.gender || "") ? registration.gender as "M"|"F"|"I" : "",
    foundation_date: foundationDateFromIso(registration.foundation_date),
    phone: formatPhone(registration.phone),
    whatsapp: formatPhone(registration.whatsapp),
    email: registration.email || "",
    is_active: registration.is_active !== false,
    roles: activeRegistrationRoles(registration),
    provider_services: (registration.provider_services || []).map(service => ({
      id: service.id,
      name: service.name,
      description: service.description || "",
      reference_price: service.reference_price == null ? "" : Number(service.reference_price).toFixed(2).replace(".", ","),
    })),
    job_title: employee?.job_title || "",
    team_name: employee?.team_name || "",
    admission_date: employee?.admission_date || "",
    field_tracking_prompt_on_login: registration.legacy_employee?.field_tracking_prompt_on_login === true,
    disable_inactivity_logout: registration.legacy_employee?.disable_inactivity_logout === true,
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
    gender: form.person_type === "PF" ? form.gender : "",
    foundation_date: form.person_type === "PJ" ? foundationDateToIso(form.foundation_date) : "",
    phone: normalizeDigits(form.phone),
    whatsapp: normalizeDigits(form.whatsapp),
    email: form.email.trim().toLowerCase(),
    is_active: form.is_active,
    provider_services: form.roles.includes("service_provider") ? form.provider_services.map(service => ({
      ...(service.id ? { id: service.id } : {}),
      name: service.name.trim(),
      description: service.description.trim(),
      reference_price: parseProviderReferencePrice(service.reference_price),
    })) : [],
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

export type RegistrationFieldErrors = Partial<Record<
  "roles" | "name" | "trade_name" | "document" | "birth_date" | "foundation_date" | "phone" | "whatsapp" | "email",
  string
>>;

export function validateRegistrationFormFields(form: RegistrationFormState, { requireCustomerPhone = false }: { requireCustomerPhone?: boolean } = {}): RegistrationFieldErrors {
  const errors: RegistrationFieldErrors = {};

  if (!form.roles.length) errors.roles = "Selecione ao menos um vínculo.";
  if (requireCustomerPhone && form.roles.includes("customer") && !form.phone.trim()) errors.phone = "Telefone é obrigatório para cadastrar um cliente.";
  else if (!form.phone.trim() && !form.whatsapp.trim()) errors.whatsapp = "Informe um telefone ou WhatsApp.";
  if (form.phone && !isValidBrazilianPhone(form.phone)) errors.phone = "Telefone inválido. Informe DDD e número válidos.";
  if (form.whatsapp && !isValidBrazilianPhone(form.whatsapp)) errors.whatsapp = "WhatsApp inválido. Informe um telefone fixo ou celular com DDD válido.";
  if (form.email && !isValidEmail(form.email)) errors.email = "E-mail inválido. Verifique o endereço informado.";

  if (form.person_type === "PF") {
    if (!form.name.trim()) errors.name = "Nome completo é obrigatório.";
    if (!isValidCpf(form.document)) errors.document = "CPF inválido. Verifique os números informados.";
    if (!form.birth_date) errors.birth_date = "Data de nascimento é obrigatória.";
    else if (!isPastOrTodayBrazilianDate(form.birth_date)) errors.birth_date = "Data de nascimento inválida ou futura.";
  } else {
    if (!form.trade_name.trim()) errors.trade_name = "Nome fantasia é obrigatório.";
    if (!isValidCnpj(form.document)) errors.document = "CNPJ inválido. Verifique os números informados.";
    if (form.foundation_date && !isPastOrTodayBrazilianDate(form.foundation_date)) errors.foundation_date = "Data de fundação inválida ou futura.";
  }

  return errors;
}

export function validateRegistrationForm(form: RegistrationFormState) {
  return Object.values(validateRegistrationFormFields(form))[0] || null;
}
