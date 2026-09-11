import React, { useRef, useState } from "react";
import { Link2, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AddressFields } from "@/shared/ui/address/AddressFields";
import { emptyAddress, normalizeSharedMapUrl, type Address } from "@/lib/address";
import {
  applyCnpjData,
  customerPayload,
  emptyCustomerForm,
  type CustomerForm,
  validateCustomerForm,
} from "@/features/customers/domain/customer-form";
import { AdminButton, AdminIconButton, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import {
  CustomerTypeToggle,
  FBrazilianDateInput,
  FCnpjInput,
  FCpfInput,
  FEmailInput,
  FInput,
  FPhoneInput,
  INPUT,
} from "@/shared/ui/admin/AdminFormControls";
import { fetchCnpjData } from "@/features/customers/infrastructure/cnpj.gateway";
import { lookupCpf } from "@/features/customers/infrastructure/cpf.gateway";
import { isValidCpf, todayDateOnly } from "@/shared/domain/formatters";
import {
  createQuickCustomer,
  createQuickCustomerAddress,
} from "../infrastructure/orders-customer.repository";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/primitives/dialog";

export function QuickCustomerModal({ onClose, onSaved }: {
  onClose: () => void;
  onSaved: (customer: any) => void;
}) {
  const { hasPermission, activeOrganizationId } = useAuth();
  const [form, setForm] = useState<CustomerForm>({ ...emptyCustomerForm });
  const [address, setAddress] = useState<Address>({ ...emptyAddress });
  const [saving, setSaving] = useState(false);
  const [sharedAddressOpen, setSharedAddressOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [cpfLoading, setCpfLoading] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjMessage, setCnpjMessage] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (window.innerWidth < 640) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, [role='button']")) return;
    dragRef.current = { x: position.x, y: position.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPosition({ x: dragRef.current.x + event.clientX - dragRef.current.startX, y: dragRef.current.y + event.clientY - dragRef.current.startY });
  };
  const endDrag = () => { dragRef.current = null; };

  const save = async () => {
    if (!activeOrganizationId) { setErrorMessage("Selecione uma empresa ativa antes de cadastrar o cliente."); return; }
    const validationError = validateCustomerForm(form);
    if (validationError) { setErrorMessage(validationError); return; }
    setSaving(true);
    setErrorMessage("");
    try {
      const { data: customer, error } = await createQuickCustomer(activeOrganizationId, customerPayload(form));
      if (error || !customer) throw error || new Error("Cliente não foi cadastrado.");
      if (Object.values(address).some(Boolean)) {
        const addressResult = await createQuickCustomerAddress(activeOrganizationId, {
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
          is_default: true,
        });
        if (addressResult.error) throw addressResult.error;
        customer.addresses = [address];
      }
      onSaved(customer);
      onClose();
    } catch (error) {
      console.error("[ADMIN] quick customer save error:", error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally { setSaving(false); }
  };

  const lookupCpfName = async () => {
    if (!activeOrganizationId) {
      setErrorMessage("Selecione uma empresa ativa antes de consultar o CPF.");
      return;
    }
    if (form.customerType !== "PF" || !isValidCpf(form.document)) {
      setErrorMessage("Informe um CPF válido antes de consultar.");
      return;
    }
    const requestedCpf = form.document.replace(/\D/g, "");
    setCpfLoading(true);
    setErrorMessage("");
    try {
      const result = await lookupCpf(requestedCpf, activeOrganizationId);
      setForm(current => {
        if (current.customerType !== "PF" || current.document.replace(/\D/g, "") !== requestedCpf) return current;
        return {
          ...current,
          full_name: result.name,
          birth_date: result.birthDate || current.birth_date,
        };
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível consultar o CPF.");
    } finally {
      setCpfLoading(false);
    }
  };

  const lookupCnpj = async (value: string, baseForm = form) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 14 || form.customerType !== "PJ") return;
    setCnpjLoading(true); setCnpjMessage("");
    try {
      const data = await fetchCnpjData(digits);
      const result = applyCnpjData(baseForm, address, data);
      setForm(result.form); setAddress(result.address);
    } catch (error) {
      setCnpjMessage(error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.");
    } finally { setCnpjLoading(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent showClose={false} className="w-[calc(100vw-1rem)] max-w-4xl gap-0 border-0 bg-transparent p-0 shadow-none sm:max-w-4xl">
        <DialogTitle className="sr-only">Criar cliente</DialogTitle>
        <div
          style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
          className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white shadow-2xl"
        >
          <div
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="z-10 flex shrink-0 cursor-default items-center justify-between border-b border-[#0d1b2e]/10 bg-white px-4 py-3 select-none sm:cursor-move sm:px-5"
          >
            <div className="min-w-0 pr-2">
              <h3 className="text-sm font-bold text-[#0d1b2e]">Criar cliente</h3>
              <p className="mt-0.5 text-[11px] text-[#5a6a82]">Cadastre o cliente sem sair da Nova OS</p>
            </div>
            <AdminIconButton ariaLabel="Fechar" onClick={onClose} disabled={saving} variant="ghost"><X size={16} /></AdminIconButton>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <CustomerTypeToggle value={form.customerType} onChange={customerType => { setErrorMessage(""); setForm({ ...form, customerType }); }} />

              {form.customerType === "PF" ? <>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                  <FCpfInput
                    label="CPF"
                    required
                    value={form.document}
                    onChange={(e: any) => { setErrorMessage(""); setForm({ ...form, document: e.target.value }); }}
                  />
                  <AdminButton
                    variant="secondary"
                    size="sm"
                    loading={cpfLoading}
                    loadingText="Consultar"
                    onClick={() => void lookupCpfName()}
                    disabled={saving || !isValidCpf(form.document)}
                    className="h-[42px] shrink-0 border-[#0057e7]/30 px-4 text-[#0057e7] hover:bg-[#0057e7]/5"
                    aria-label="Consultar CPF"
                    title="Consultar CPF"
                  >
                    Consultar
                  </AdminButton>
                </div>
                <FInput label="Nome completo" required value={form.full_name} onChange={(e: any) => setForm({ ...form, full_name: e.target.value })} />
                <FInput label="Data de nascimento" type="date" required value={form.birth_date} max={todayDateOnly()} onChange={(e: any) => setForm({ ...form, birth_date: e.target.value })} />
              </> : <>
                <FInput label="Nome fantasia" required value={form.trade_name} onChange={(e: any) => setForm({ ...form, trade_name: e.target.value })} />
                <FCnpjInput label="CNPJ" required value={form.cnpj} onBlur={(e: any) => lookupCnpj(e.target.value)} onChange={(e: any) => { const nextCnpj = e.target.value; setCnpjMessage(""); setForm({ ...form, cnpj: nextCnpj }); if (nextCnpj.replace(/\D/g, "").length === 14) void lookupCnpj(nextCnpj, { ...form, cnpj: nextCnpj }); }} hint={cnpjLoading ? "Consultando CNPJ..." : cnpjMessage || undefined} />
                <FInput label="Razão social" value={form.legal_name} onChange={(e: any) => setForm({ ...form, legal_name: e.target.value })} />
                <FInput label="Inscrição estadual" value={form.state_registration} hint="Deixe em branco se não for contribuinte · ISENTO se isento" onChange={(e: any) => setForm({ ...form, state_registration: e.target.value })} />
                <FBrazilianDateInput label="Fundação" value={form.foundation_date} onChange={(e: any) => setForm({ ...form, foundation_date: e.target.value })} />
              </>}

              <FEmailInput label="E-mail" value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })} />
              <FPhoneInput label="Telefone" value={form.phone} onChange={(e: any) => setForm({ ...form, phone: e.target.value })} />
              <FPhoneInput label="WhatsApp" required mobile value={form.whatsapp} onChange={(e: any) => setForm({ ...form, whatsapp: e.target.value })} />
            </div>

            <Section
              title="Endereço do cliente"
              actions={
                <AdminButton
                  variant="secondary"
                  size="sm"
                  onClick={() => setSharedAddressOpen(value => !value)}
                  disabled={saving}
                  className="max-w-[12rem] sm:max-w-none"
                >
                  <Link2 size={13} /> <span className="truncate">Endereço enviado pelo cliente</span>
                </AdminButton>
              }
            >
              <div className="space-y-3">
                {(sharedAddressOpen || address.shared_map_url) && <FInput label="Link compartilhado do endereço" type="url" placeholder="Cole o link enviado pelo cliente" value={address.shared_map_url || ""} onChange={(e: any) => setAddress({ ...address, shared_map_url: e.target.value })} />}
                <AddressFields value={address} onChange={setAddress} inputClassName={INPUT} />
              </div>
            </Section>

            {errorMessage && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{errorMessage}</p>}
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#0d1b2e]/10 bg-white px-3 py-3 sm:flex-row sm:justify-end sm:px-5">
            <BtnSecondary className="w-full sm:w-auto" onClick={onClose} disabled={saving}>Cancelar</BtnSecondary>
            {hasPermission("customers.create") && <BtnPrimary className="w-full sm:w-auto" onClick={save} loading={saving} loadingText="Salvando...">Criar cliente</BtnPrimary>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
