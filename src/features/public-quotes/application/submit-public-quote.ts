import type { Address } from "@/lib/address";
import {
  generateQuoteProtocol,
  isValidCpf,
  isValidPastOrCurrentDate,
  normalizeDocument,
  publicDateToIso,
  type PublicQuoteForm,
} from "../domain/public-quote";
import { createPublicQuote } from "../infrastructure/public-quotes.repository";

export async function submitPublicQuote(form: PublicQuoteForm, address: Address): Promise<string> {
  const cpf = normalizeDocument(form.cpf);
  const cnpj = normalizeDocument(form.cnpj);
  if (form.customerType === "PF" && !cpf) throw new Error("Informe o CPF.");
  if (form.customerType === "PF" && !isValidCpf(cpf)) throw new Error("CPF inválido. Verifique o número informado.");
  if (form.customerType === "PJ" && !form.tradeName.trim()) throw new Error("Informe o nome fantasia.");
  if (form.customerType === "PJ" && cnpj.length !== 14) throw new Error("Informe um CNPJ válido.");
  if (!form.whatsapp.trim()) throw new Error("Informe o telefone ou WhatsApp principal.");
  if (form.customerType === "PF" && !isValidPastOrCurrentDate(form.birthDate)) throw new Error("Informe uma data de nascimento válida e que não seja futura.");

  const protocol = generateQuoteProtocol();
  const brandNote = form.marca === "Outra marca" && form.outraMarca ? `Marca: ${form.outraMarca}` : null;
  const modelNote = form.modelo ? `Modelo: ${form.modelo}` : null;
  const extraNotes = [brandNote, modelNote].filter(Boolean).join(" | ");
  const customerMessage = [form.descricao, extraNotes].filter(Boolean).join("\n") || null;

  const { data, error } = await createPublicQuote({
    p_customer_type: form.customerType,
    p_full_name: (form.customerType === "PJ" ? form.tradeName : form.nome).trim(),
    p_whatsapp: normalizeDocument(form.whatsapp) || null,
    p_phone: normalizeDocument(form.phone) || null,
    p_birth_date: form.customerType === "PF" ? publicDateToIso(form.birthDate) : null,
    p_email: form.email || null,
    p_document: form.customerType === "PF" && cpf.length === 11 ? cpf : null,
    p_trade_name: form.customerType === "PJ" ? form.tradeName.trim() : null,
    p_legal_name: form.customerType === "PJ" ? form.legalName.trim() || null : null,
    p_cnpj: form.customerType === "PJ" ? cnpj : null,
    p_state_registration: form.customerType === "PJ" ? form.stateRegistration.trim() || null : null,
    p_foundation_date: form.customerType === "PJ" ? publicDateToIso(form.foundationDate) : null,
    p_service_id: form.servico || null,
    p_brand_id: form.marca && form.marca !== "Outra marca" ? form.marca : null,
    p_customer_message: customerMessage,
    p_protocol: protocol,
    p_zip_code: address.zip_code || null,
    p_street: address.street || null,
    p_number: address.number || null,
    p_complement: address.complement || null,
    p_neighborhood: address.neighborhood || null,
    p_city: address.city || null,
    p_state: address.state || null,
  });
  if (error) throw new Error(`Erro ao enviar solicitação: ${error.message}`);
  const result = data as { success: boolean; error?: string };
  if (!result.success) throw new Error(result.error || "Erro ao processar solicitação.");
  return protocol;
}
