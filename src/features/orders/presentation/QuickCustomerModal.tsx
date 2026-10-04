import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { normalizeSharedMapUrl, type Address } from "@/lib/address";
import {
  applyCnpjData,
  customerPayload,
  emptyCustomerForm,
  type CustomerFieldErrors,
  type CustomerForm,
  validateCustomerFormFields,
} from "@/features/customers/domain/customer-form";
import { AdminButton, AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import {
  CustomerTypeToggle,
  FBrazilianDateInput,
  FCnpjInput,
  FCpfInput,
  FEmailInput,
  FInput,
  FPhoneInput,
} from "@/shared/ui/admin/AdminFormControls";
import { fetchCnpjData } from "@/features/customers/infrastructure/cnpj.gateway";
import { ensureCpfAvailable, lookupCpf } from "@/features/customers/infrastructure/cpf.gateway";
import { isValidCnpj, isValidCpf, todayDateOnly } from "@/shared/domain/formatters";
import {
  createQuickCustomer,
  createQuickCustomerAddress,
  findQuickCustomerByTaxId,
  updateOrderCustomer,
} from "../infrastructure/orders-customer.repository";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { supabaseErrorMessage } from "@/shared/infrastructure/media.repository";
import { QuickCustomerAddressesEditor, newQuickCustomerAddress } from "./QuickCustomerAddressesEditor";

const hasAddressData = (address: Address) => Boolean(
  address.zip_code || address.street || address.number || address.complement ||
  address.neighborhood || address.city || address.state || address.reference || address.shared_map_url,
);


function quickCustomerDisplayName(customer: any) {
  return String(customer?.trade_name || customer?.full_name || customer?.legal_name || "").trim();
}

function quickCustomerErrorMessage(error: unknown, fallback: string) {
  const message = supabaseErrorMessage(error).trim();
  return message && message !== "[object Object]" ? message : fallback;
}

function duplicateTaxIdField(error: unknown): "document" | "cnpj" | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { code?: string };
  const message = supabaseErrorMessage(error).toLocaleLowerCase("pt-BR");
  if (value.code !== "23505" && !message.includes("duplicate") && !message.includes("duplicad")) return null;
  if (message.includes("cnpj")) return "cnpj";
  if (message.includes("document")) return "document";
  return null;
}

export function QuickCustomerModal({ onClose, onSaved }: {
  onClose: () => void;
  onSaved: (customer: any) => void;
}) {
  const { hasPermission, activeOrganizationId } = useAuth();
  const [form, setForm] = useState<CustomerForm>({ ...emptyCustomerForm });
  const [addresses, setAddresses] = useState<Address[]>(() => [newQuickCustomerAddress(true)]);
  const [createdCustomer, setCreatedCustomer] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CustomerFieldErrors>({});
  const [cpfLoading, setCpfLoading] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const clearFieldError = (field: keyof CustomerForm) => {
    setFieldErrors(current => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const setFieldError = (field: keyof CustomerForm, message: string) => {
    setFieldErrors(current => ({ ...current, [field]: message }));
  };

  const duplicateMessage = (type: "PF" | "PJ", customer: any) => {
    const label = type === "PF" ? "CPF" : "CNPJ";
    const name = quickCustomerDisplayName(customer);
    return name
      ? `${label} já cadastrado para ${name}. Use o cadastro existente.`
      : `${label} já cadastrado. Use o cadastro existente.`;
  };

  const save = async () => {
    if (!activeOrganizationId) {
      notifyAdmin("Selecione uma empresa ativa antes de cadastrar o cliente.", "error");
      return;
    }

    const validationErrors = validateCustomerFormFields(form);
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    if (form.customerType === "PF") {
      try {
        await ensureCpfAvailable(form.document, activeOrganizationId);
      } catch (error) {
        setFieldError("document", quickCustomerErrorMessage(error, "Não foi possível verificar o CPF."));
        return;
      }
    }

    setSaving(true);
    let savePhase: "customer" | "address" = "customer";

    try {
      const payload = customerPayload(form);
      let customer = createdCustomer;

      if (customer?.id) {
        const updateResult = await updateOrderCustomer(activeOrganizationId, customer.id, payload);
        if (updateResult.error) throw updateResult.error;
        customer = { ...customer, ...payload };
        setCreatedCustomer(customer);
      } else {
        const taxIdValue = form.customerType === "PF" ? form.document : form.cnpj;
        const duplicate = await findQuickCustomerByTaxId(activeOrganizationId, form.customerType, taxIdValue);
        if (duplicate.error) throw duplicate.error;
        if (duplicate.data) {
          const field = form.customerType === "PF" ? "document" : "cnpj";
          setFieldError(field, duplicateMessage(form.customerType, duplicate.data));
          return;
        }

        const { data, error } = await createQuickCustomer(activeOrganizationId, payload);
        if (error || !data) throw error || new Error("Cliente não foi cadastrado.");
        customer = data;
        setCreatedCustomer(data);
      }

      savePhase = "address";
      const meaningfulAddresses = addresses.filter(hasAddressData);
      const defaultAddressId = meaningfulAddresses.find(address => address.is_default)?.id || meaningfulAddresses[0]?.id;
      const savedAddresses: Address[] = [];

      for (const address of meaningfulAddresses) {
        const addressPayload = {
          id: address.id || crypto.randomUUID(),
          customer_id: customer.id,
          zip_code: address.zip_code || null,
          street: address.street || null,
          number: address.number || null,
          complement: address.complement || null,
          neighborhood: address.neighborhood || null,
          city: address.city || null,
          state: address.state || null,
          reference: address.reference || null,
          shared_map_url: normalizeSharedMapUrl(address.shared_map_url) || null,
          is_default: (address.id || null) === defaultAddressId,
        };
        const { data, error } = await createQuickCustomerAddress(activeOrganizationId, addressPayload);
        if (error || !data) throw error || new Error("Não foi possível salvar um dos endereços do cliente.");
        savedAddresses.push(data as Address);
      }

      customer = { ...customer, addresses: savedAddresses };
      onSaved(customer);
      onClose();
    } catch (error) {
      console.error("[ADMIN] quick customer save error:", error);
      const duplicateField = duplicateTaxIdField(error);
      if (duplicateField) {
        setFieldError(
          duplicateField,
          duplicateField === "document"
            ? "CPF já cadastrado. Use o cadastro existente."
            : "CNPJ já cadastrado. Use o cadastro existente.",
        );
      } else {
        const fallback = savePhase === "address"
          ? "Cliente cadastrado, mas não foi possível salvar um dos endereços."
          : "Não foi possível cadastrar o cliente.";
        notifyAdmin(quickCustomerErrorMessage(error, fallback), "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const lookupCpfName = async () => {
    if (!activeOrganizationId) {
      notifyAdmin("Selecione uma empresa ativa antes de consultar o CPF.", "error");
      return;
    }
    if (form.customerType !== "PF" || !isValidCpf(form.document)) {
      setFieldError("document", "CPF inválido. Verifique os números informados.");
      return;
    }

    const requestedCpf = form.document.replace(/\D/g, "");
    setCpfLoading(true);
    clearFieldError("document");

    try {
      const result = await lookupCpf(requestedCpf, activeOrganizationId);
      setForm(current => {
        if (current.customerType !== "PF" || current.document.replace(/\D/g, "") !== requestedCpf) return current;
        return { ...current, full_name: result.name, birth_date: result.birthDate || current.birth_date };
      });
      clearFieldError("full_name");
      clearFieldError("birth_date");
      notifyAdmin(
        result.source === "local"
          ? "CPF encontrado no cadastro interno. Nome e nascimento foram reaproveitados."
          : result.birthDate
            ? "Nome e data de nascimento preenchidos pela consulta de CPF."
            : "Nome preenchido pela consulta de CPF.",
        "success",
      );
    } catch (error) {
      const message = quickCustomerErrorMessage(error, "Não foi possível consultar o CPF.");
      if (/cadastro já existente|cpf já cadastrado|cpf inválido|cpf não encontrado/i.test(message)) {
        setFieldError("document", message.replace(/^Cadastro já existente:\s*/i, "CPF já cadastrado: "));
      } else {
        notifyAdmin(message, "error");
      }
    } finally {
      setCpfLoading(false);
    }
  };

  const lookupCnpj = async (value: string, baseForm = form) => {
    const digits = value.replace(/\D/g, "");
    if (baseForm.customerType !== "PJ" || digits.length !== 14) return;

    if (!isValidCnpj(value)) {
      setFieldError("cnpj", "CNPJ inválido. Verifique os números informados.");
      return;
    }
    if (!activeOrganizationId) {
      notifyAdmin("Selecione uma empresa ativa antes de consultar o CNPJ.", "error");
      return;
    }

    setCnpjLoading(true);
    clearFieldError("cnpj");

    try {
      const duplicate = await findQuickCustomerByTaxId(activeOrganizationId, "PJ", digits);
      if (duplicate.error) throw duplicate.error;
      if (duplicate.data) {
        setFieldError("cnpj", duplicateMessage("PJ", duplicate.data));
        return;
      }

      const defaultIndex = Math.max(0, addresses.findIndex(address => address.is_default));
      const baseAddress = addresses[defaultIndex] || newQuickCustomerAddress(true);
      const data = await fetchCnpjData(digits);
      const result = applyCnpjData(baseForm, baseAddress, data);
      setForm(result.form);
      setAddresses(current => {
        const next = current.length ? [...current] : [newQuickCustomerAddress(true)];
        const index = Math.max(0, next.findIndex(address => address.is_default));
        next[index] = { ...next[index], ...result.address, id: next[index].id, is_default: true };
        return next;
      });
      setFieldErrors(current => {
        const next = { ...current };
        delete next.trade_name;
        delete next.foundation_date;
        delete next.email;
        delete next.phone;
        delete next.whatsapp;
        return next;
      });
    } catch (error) {
      const message = quickCustomerErrorMessage(error, "Não foi possível consultar o CNPJ.");
      if (/cnpj não encontrado|cnpj inválido|cnpj já cadastrado|cadastro já existente/i.test(message)) {
        setFieldError("cnpj", message);
      } else {
        notifyAdmin(message, "error");
      }
    } finally {
      setCnpjLoading(false);
    }
  };

  const minimizedDescription = [
    form.customerType === "PF" ? form.full_name : form.trade_name || form.legal_name,
    form.customerType === "PF" ? form.document : form.cnpj,
    form.whatsapp || form.phone,
  ].map(value => String(value || "").trim()).filter(Boolean).join(" · ") || "Cadastro em andamento";

  return <AdminDialog
    open
    onClose={() => { if (!saving) onClose(); }}
    title="Criar cliente"
    description="Cadastre o cliente sem sair da Nova OS."
    minimizedDescription={minimizedDescription}
    minimizable={!saving}
    className="max-w-4xl"
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <BtnSecondary className="w-full sm:w-auto" onClick={onClose} disabled={saving}>Cancelar</BtnSecondary>
      {hasPermission("customers.create") && <BtnPrimary className="w-full sm:w-auto" onClick={save} loading={saving} loadingText="Salvando...">Criar</BtnPrimary>}
    </div>}
  >
    <div className="space-y-4">
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <CustomerTypeToggle value={form.customerType} onChange={customerType => { setFieldErrors({}); setForm({ ...form, customerType }); }} />

              {form.customerType === "PF" ? <>
                <div className="min-w-0">
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                    <FCpfInput label="CPF" required error={fieldErrors.document} value={form.document} onChange={(e: any) => { clearFieldError("document"); setForm({ ...form, document: e.target.value }); }} />
                    <AdminButton variant="secondary" size="sm" loading={cpfLoading} loadingText="Consultar" onClick={() => void lookupCpfName()} disabled={saving || !isValidCpf(form.document)} className="h-[42px] shrink-0 border-primary/30 px-4 text-primary hover:bg-primary/5" aria-label="Consultar CPF" title="Consultar CPF">Consultar</AdminButton>
                  </div>
                </div>
                <FInput label="Nome completo" required error={fieldErrors.full_name} value={form.full_name} onChange={(e: any) => { clearFieldError("full_name"); setForm({ ...form, full_name: e.target.value }); }} />
                <FInput label="Data de nascimento" type="date" required error={fieldErrors.birth_date} value={form.birth_date} max={todayDateOnly()} onChange={(e: any) => { clearFieldError("birth_date"); setForm({ ...form, birth_date: e.target.value }); }} />
              </> : <>
                <FCnpjInput label="CNPJ" required error={fieldErrors.cnpj} value={form.cnpj} onBlur={(e: any) => void lookupCnpj(e.target.value)} onChange={(e: any) => { const nextCnpj = e.target.value; clearFieldError("cnpj"); setForm({ ...form, cnpj: nextCnpj }); if (nextCnpj.replace(/\D/g, "").length === 14) void lookupCnpj(nextCnpj, { ...form, cnpj: nextCnpj }); }} hint={cnpjLoading ? "Consultando CNPJ..." : undefined} />
                <FInput label="Nome fantasia" required error={fieldErrors.trade_name} value={form.trade_name} onChange={(e: any) => { clearFieldError("trade_name"); setForm({ ...form, trade_name: e.target.value }); }} />
                <FInput label="Razão social" value={form.legal_name} onChange={(e: any) => setForm({ ...form, legal_name: e.target.value })} />
                <FInput label="Inscrição estadual" value={form.state_registration} hint="Deixe em branco se não for contribuinte · ISENTO se isento" onChange={(e: any) => setForm({ ...form, state_registration: e.target.value })} />
                <FBrazilianDateInput label="Fundação" error={fieldErrors.foundation_date} value={form.foundation_date} onChange={(e: any) => { clearFieldError("foundation_date"); setForm({ ...form, foundation_date: e.target.value }); }} />
              </>}

              <FEmailInput label="E-mail" error={fieldErrors.email} value={form.email} onChange={(e: any) => { clearFieldError("email"); setForm({ ...form, email: e.target.value }); }} />
              <FPhoneInput label="Telefone" error={fieldErrors.phone} value={form.phone} onChange={(e: any) => { clearFieldError("phone"); clearFieldError("whatsapp"); setForm({ ...form, phone: e.target.value }); }} />
              <FPhoneInput label="WhatsApp" required mobile error={fieldErrors.whatsapp} value={form.whatsapp} onChange={(e: any) => { clearFieldError("whatsapp"); setForm({ ...form, whatsapp: e.target.value }); }} />
            </div>

            <QuickCustomerAddressesEditor value={addresses} onChange={setAddresses} disabled={saving} />
    </div>
  </AdminDialog>;
}
