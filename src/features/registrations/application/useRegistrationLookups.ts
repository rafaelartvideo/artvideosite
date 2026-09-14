import { useState, type Dispatch, type SetStateAction } from "react";
import type { Address } from "@/lib/address";
import { lookupCpf } from "@/features/customers/infrastructure/cpf.gateway";
import { fetchCnpjData } from "@/features/customers/infrastructure/cnpj.gateway";
import { applyCnpjData, type CustomerForm } from "@/features/customers/domain/customer-form";
import { foundationDateFromIso, isValidCnpj, isValidCpf } from "@/shared/domain/formatters";
import type { RegistrationFormState } from "../domain/registration-form";

export function useRegistrationLookups({
  organizationId,
  registrationId,
  form,
  address,
  setForm,
  setAddress,
}: {
  organizationId: string | null;
  registrationId?: string | null;
  form: RegistrationFormState;
  address: Address;
  setForm: Dispatch<SetStateAction<RegistrationFormState>>;
  setAddress: Dispatch<SetStateAction<Address>>;
}) {
  const [cpfLoading, setCpfLoading] = useState(false);
  const [cpfError, setCpfError] = useState("");
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjMessage, setCnpjMessage] = useState("");

  const lookupCpfName = async (value = form.document) => {
    if (!organizationId) return;
    if (!isValidCpf(value)) {
      setCpfError("CPF inválido. Verifique os números informados.");
      return;
    }
    setCpfLoading(true);
    setCpfError("");
    try {
      const result = await lookupCpf(value, organizationId, registrationId);
      setForm(current => ({
        ...current,
        name: result.name || current.name,
        birth_date: result.birthDate ? foundationDateFromIso(result.birthDate) : current.birth_date,
      }));
    } catch (error) {
      setCpfError(error instanceof Error ? error.message : "Não foi possível consultar o CPF.");
    } finally {
      setCpfLoading(false);
    }
  };

  const lookupCnpj = async (value = form.document) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 14) return;
    if (!isValidCnpj(digits)) {
      setCnpjMessage("CNPJ inválido. Verifique os números informados.");
      return;
    }
    setCnpjLoading(true);
    setCnpjMessage("");
    try {
      const data = await fetchCnpjData(digits);
      const customerForm: CustomerForm = {
        customerType: "PJ",
        full_name: form.trade_name || form.name,
        email: form.email,
        phone: form.phone,
        whatsapp: form.whatsapp,
        document: "",
        trade_name: form.trade_name,
        legal_name: form.legal_name,
        cnpj: form.document,
        state_registration: form.state_registration,
        foundation_date: form.foundation_date,
        birth_date: "",
      };
      const result = applyCnpjData(customerForm, address, data);
      setForm(current => ({
        ...current,
        name: result.form.trade_name || result.form.legal_name || current.name,
        trade_name: result.form.trade_name,
        legal_name: result.form.legal_name,
        state_registration: result.form.state_registration,
        foundation_date: result.form.foundation_date,
        email: result.form.email,
        phone: result.form.phone,
        whatsapp: result.form.whatsapp,
      }));
      setAddress(result.address);
      setCnpjMessage("Dados localizados e preenchidos.");
    } catch (error) {
      setCnpjMessage(error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.");
    } finally {
      setCnpjLoading(false);
    }
  };

  return {
    cpfLoading,
    cpfError,
    setCpfError,
    lookupCpfName,
    cnpjLoading,
    cnpjMessage,
    setCnpjMessage,
    lookupCnpj,
  };
}
