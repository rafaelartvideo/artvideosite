import { systemErrorMessage } from "@/shared/domain/error-message";
import { useRef, useState } from "react";
import { emptyAddress, normalizeSharedMapUrl, type Address } from "@/lib/address";
import { isValidCpf } from "@/shared/domain/formatters";
import {
  applyCnpjData,
  customerPayload,
  emptyCustomerForm,
  validateCustomerFormFields,
  type CustomerFieldErrors,
  type CustomerForm,
} from "../domain/customer-form";
import {
  createCustomer,
  createCustomerAddress,
  fetchCnpjData,
} from "../infrastructure/customers.repository";
import { lookupCpf } from "../infrastructure/cpf.gateway";

type Options = {
  organizationId: string | null;
  canCreate: boolean;
  onRefresh: () => Promise<unknown>;
  onToast: (message: string, type: "success" | "error") => void;
};

export function useCreateCustomer({ organizationId, canCreate, onRefresh, onToast }: Options) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CustomerForm>({ ...emptyCustomerForm });
  const [address, setAddress] = useState<Address>({ ...emptyAddress });
  const [fieldErrors, setFieldErrors] = useState<CustomerFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjMessage, setCnpjMessage] = useState("");
  const [cpfLoading, setCpfLoading] = useState(false);
  const [cpfError, setCpfError] = useState("");
  const cpfInputRef = useRef<HTMLInputElement>(null);

  const openPage = () => {
    setCpfError("");
    setFieldErrors({});
    setOpen(true);
  };
  const closePage = () => {
    setCpfError("");
    setFieldErrors({});
    setOpen(false);
  };

  const lookupCpfName = async (value = form.document) => {
    if (form.customerType !== "PF") return;
    if (!organizationId) {
      onToast("Selecione uma empresa ativa antes de consultar o CPF.", "error");
      return;
    }
    if (!isValidCpf(value)) {
      setCpfError("CPF inválido. Verifique os números informados.");
      cpfInputRef.current?.focus();
      return;
    }

    const requestedCpf = value.replace(/\D/g, "");
    setCpfError("");
    setCpfLoading(true);
    try {
      const result = await lookupCpf(requestedCpf, organizationId);
      setForm(current => {
        if (current.customerType !== "PF" || current.document.replace(/\D/g, "") !== requestedCpf) return current;
        return {
          ...current,
          full_name: result.name,
          birth_date: result.birthDate || current.birth_date,
        };
      });
      onToast(result.birthDate ? "Nome e data de nascimento preenchidos pela consulta de CPF." : "Nome preenchido pela consulta de CPF.", "success");
    } catch (error) {
      onToast(systemErrorMessage(error, "Não foi possível consultar o CPF."), "error");
    } finally {
      setCpfLoading(false);
    }
  };

  const lookupCnpj = async (value: string, baseForm = form) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 14 || baseForm.customerType !== "PJ") return;
    setCnpjLoading(true);
    setCnpjMessage("");
    try {
      const data = await fetchCnpjData(digits);
      const result = applyCnpjData(baseForm, address, data);
      setForm(result.form);
      setAddress(result.address);
    } catch (error) {
      const message = systemErrorMessage(error, "Não foi possível consultar o CNPJ.");
      if (/cnpj.*(inválido|nao encontrado|não encontrado)/i.test(message)) {
        setFieldErrors(current => ({ ...current, cnpj: message }));
      } else {
        onToast(message, "error");
      }
    } finally {
      setCnpjLoading(false);
    }
  };

  const create = async () => {
    if (!organizationId) {
      onToast("Selecione uma empresa ativa antes de cadastrar o cliente.", "error");
      return false;
    }
    if (!canCreate) {
      onToast("Você não possui permissão para cadastrar clientes.", "error");
      return false;
    }
    if (form.customerType === "PF" && !isValidCpf(form.document)) {
      setCpfError("CPF inválido. Verifique os números informados.");
      cpfInputRef.current?.focus();
      return false;
    }
    const validationErrors = validateCustomerFormFields(form);
    setFieldErrors(validationErrors);
    if (validationErrors.document) setCpfError(validationErrors.document);
    if (Object.keys(validationErrors).length) return false;

    setSaving(true);
    let customer;
    try {
      customer = await createCustomer(organizationId, customerPayload(form));
    } catch (error) {
      onToast(`Erro ao cadastrar: ${systemErrorMessage(error, "Cliente não criado.")}`, "error");
      setSaving(false);
      return false;
    }

    if (Object.values(address).some(Boolean)) {
      try {
        await createCustomerAddress(organizationId, {
          customer_id: customer.id,
          zip_code: address.zip_code || null,
          street: address.street || null,
          number: address.number || null,
          complement: address.complement || null,
          neighborhood: address.neighborhood || null,
          city: address.city || null,
          state: address.state || null,
          shared_map_url: normalizeSharedMapUrl(address.shared_map_url) || null,
          is_default: true,
        });
      } catch (error) {
        onToast(
          `Cliente criado, mas erro no endereço: ${systemErrorMessage(error)}`,
          "error",
        );
        setSaving(false);
        await onRefresh();
        return false;
      }
    }

    onToast("Cliente cadastrado com sucesso!", "success");
    setOpen(false);
    setForm({ ...emptyCustomerForm });
    setAddress({ ...emptyAddress });
    setFieldErrors({});
    setCpfError("");
    setSaving(false);
    await onRefresh();
    return true;
  };

  return {
    open,
    form,
    setForm,
    address,
    setAddress,
    fieldErrors,
    setFieldErrors,
    saving,
    cnpjLoading,
    cnpjMessage,
    setCnpjMessage,
    cpfLoading,
    cpfError,
    setCpfError,
    cpfInputRef,
    openPage,
    closePage,
    lookupCpfName,
    lookupCnpj,
    create,
  };
}
