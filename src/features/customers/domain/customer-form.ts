import type { Address } from "@/lib/address";
import {
  formatCnpj,
  formatCpf,
  formatFoundationDate,
  formatPhone,
  foundationDateFromIso,
  foundationDateToIso,
  todayDateOnly,
} from "@/shared/domain/formatters";

export type CustomerType = "PF" | "PJ";

export type CustomerForm = {
  customerType: CustomerType;
  full_name: string;
  email: string;
  phone: string;
  whatsapp: string;
  document: string;
  trade_name: string;
  legal_name: string;
  cnpj: string;
  state_registration: string;
  foundation_date: string;
  birth_date: string;
};

export const emptyCustomerForm: CustomerForm = {
  customerType: "PF", full_name: "", email: "", phone: "", whatsapp: "", document: "",
  trade_name: "", legal_name: "", cnpj: "", state_registration: "", foundation_date: "", birth_date: "",
};

export function customerFormFromCustomer(customer: any): CustomerForm {
  return {
    customerType: customer.customer_type === "PJ" ? "PJ" : "PF",
    full_name: customer.full_name || "", email: customer.email || "",
    phone: formatPhone(customer.phone), whatsapp: formatPhone(customer.whatsapp),
    document: formatCpf(customer.document || ""), trade_name: customer.trade_name || "",
    legal_name: customer.legal_name || "", cnpj: formatCnpj(customer.cnpj || ""),
    state_registration: customer.state_registration || "",
    foundation_date: foundationDateFromIso(customer.foundation_date), birth_date: customer.birth_date || "",
  };
}

export function customerPayload(form: CustomerForm) {
  return {
    customer_type: form.customerType,
    full_name: (form.customerType === "PJ" ? form.trade_name : form.full_name).trim(),
    email: form.email.trim() || null, phone: form.phone.replace(/\D/g, "") || null,
    whatsapp: form.whatsapp.replace(/\D/g, "") || null,
    document: form.customerType === "PF" ? form.document.replace(/\D/g, "") || null : null,
    trade_name: form.customerType === "PJ" ? form.trade_name.trim() || null : null,
    legal_name: form.customerType === "PJ" ? form.legal_name.trim() || null : null,
    cnpj: form.customerType === "PJ" ? form.cnpj.replace(/\D/g, "") || null : null,
    state_registration: form.customerType === "PJ" ? form.state_registration.trim() || null : null,
    foundation_date: form.customerType === "PJ" ? foundationDateToIso(form.foundation_date) : null,
    birth_date: form.customerType === "PF" ? form.birth_date || null : null,
  };
}

export function customerUpdatePayload(form: CustomerForm) {
  const { customer_type: _type, document: _document, cnpj: _cnpj, ...editable } = customerPayload(form);
  return editable;
}

export function validateCustomerForm(form: CustomerForm) {
  if (!form.whatsapp.trim() && !form.phone.trim()) return "Telefone ou WhatsApp é obrigatório.";
  if (form.customerType === "PF" && !form.full_name.trim()) return "Nome completo é obrigatório.";
  if (form.customerType === "PF" && form.document.replace(/\D/g, "").length !== 11) return "CPF é obrigatório e deve estar completo.";
  if (form.customerType === "PF" && !form.birth_date) return "Data de nascimento é obrigatória.";
  if (form.customerType === "PF" && form.birth_date > todayDateOnly()) return "A data de nascimento não pode ser futura.";
  if (form.customerType === "PJ" && !form.trade_name.trim()) return "Nome fantasia é obrigatório.";
  if (form.customerType === "PJ" && form.cnpj.replace(/\D/g, "").length !== 14) return "CNPJ é obrigatório e deve estar completo.";
  return null;
}

export function applyCnpjData(form: CustomerForm, address: Address, data: any) {
  return {
    form: {
      ...form,
      full_name: form.full_name || data.nome_fantasia || data.razao_social || "",
      trade_name: form.trade_name || data.nome_fantasia || "",
      legal_name: form.legal_name || data.razao_social || "",
      state_registration: form.state_registration || data.inscricao_estadual || "",
      foundation_date: form.foundation_date || (data.data_inicio_atividade ? formatFoundationDate(data.data_inicio_atividade.split("-").reverse().join("/")) : ""),
      email: form.email || data.email || "", phone: formatPhone(form.phone || data.ddd_telefone_1 || ""),
      whatsapp: formatPhone(form.whatsapp || data.ddd_telefone_1 || ""),
    },
    address: {
      ...address, zip_code: address.zip_code || data.cep || "", street: address.street || data.logradouro || "",
      number: address.number || data.numero || "", complement: address.complement || data.complemento || "",
      neighborhood: address.neighborhood || data.bairro || "", city: address.city || data.municipio || "",
      state: address.state || data.uf || "",
    },
  };
}
