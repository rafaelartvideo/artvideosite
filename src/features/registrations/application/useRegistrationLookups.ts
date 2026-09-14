import { useState, type Dispatch, type SetStateAction } from "react";
import { lookupCpf } from "@/features/customers/infrastructure/cpf.gateway";
import { fetchCnpjData } from "@/features/customers/infrastructure/cnpj.gateway";
import { applyCnpjData, type CustomerForm } from "@/features/customers/domain/customer-form";
import { foundationDateFromIso, isValidCnpj, isValidCpf } from "@/shared/domain/formatters";
import {
  emptyRegistrationAddress,
  type RegistrationAddressForm,
  type RegistrationFormState,
} from "../domain/registration-form";
import { findRegistrationByDocument } from "../infrastructure/registrations.repository";

export function useRegistrationLookups({
  organizationId,
  registrationId,
  form,
  addresses,
  setForm,
  setAddresses,
}: {
  organizationId: string | null;
  registrationId?: string | null;
  form: RegistrationFormState;
  addresses: RegistrationAddressForm[];
  setForm: Dispatch<SetStateAction<RegistrationFormState>>;
  setAddresses: Dispatch<SetStateAction<RegistrationAddressForm[]>>;
}) {
  const [cpfLoading, setCpfLoading] = useState(false);
  const [cpfError, setCpfError] = useState("");
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjError, setCnpjError] = useState("");

  const findDuplicate = async (value: string) => {
    if (!organizationId) return null;
    const existing = await findRegistrationByDocument(organizationId, value, registrationId);
    if (existing.error) throw existing.error;
    return existing.data;
  };

  const lookupCpfName = async (value = form.document) => {
    if (!organizationId) return;
    if (!isValidCpf(value)) {
      setCpfError("CPF inválido. Verifique os números informados.");
      return;
    }
    setCpfLoading(true);
    setCpfError("");
    try {
      const duplicate = await findDuplicate(value);
      if (duplicate) {
        setCpfError(`Cadastro já existente: ${duplicate.name}.`);
        return;
      }
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
    if (!isValidCnpj(digits)) {
      setCnpjError("CNPJ inválido. Verifique os números informados.");
      return;
    }
    setCnpjLoading(true);
    setCnpjError("");
    try {
      const duplicate = await findDuplicate(digits);
      if (duplicate) {
        setCnpjError(`Cadastro já existente: ${duplicate.name}.`);
        return;
      }

      const data = await fetchCnpjData(digits);
      const primaryIndex = Math.max(0, addresses.findIndex(address => address.is_primary));
      const currentAddress = addresses[primaryIndex] || emptyRegistrationAddress(true);
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
      const result = applyCnpjData(customerForm, currentAddress, data);
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
      setAddresses(current => {
        const next = current.length ? [...current] : [emptyRegistrationAddress(true)];
        const index = Math.max(0, next.findIndex(address => address.is_primary));
        next[index] = {
          ...next[index],
          ...result.address,
          id: next[index]?.id,
          type: next[index]?.type || "Principal",
          is_primary: true,
          is_default: true,
        };
        return next;
      });
    } catch (error) {
      setCnpjError(error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.");
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
    cnpjError,
    setCnpjError,
    lookupCnpj,
  };
}
