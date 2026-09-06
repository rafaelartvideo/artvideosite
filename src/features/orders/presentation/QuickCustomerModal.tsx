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
import { todayDateOnly } from "@/shared/domain/formatters";
import {
  createQuickCustomer,
  createQuickCustomerAddress,
} from "../infrastructure/orders-customer.repository";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/primitives/dialog";

export function QuickCustomerModal({ onClose, onSaved }: {
  onClose: () => void;
  onSaved: (customer: any) => void;
}) {
  const { hasPermission } = useAuth();
  const [form, setForm] = useState<CustomerForm>({ ...emptyCustomerForm });
  const [address, setAddress] = useState<Address>({ ...emptyAddress });
  const [saving, setSaving] = useState(false);
  const [sharedAddressOpen, setSharedAddressOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjMessage, setCnpjMessage] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: position.x, y: position.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPosition({ x: dragRef.current.x + event.clientX - dragRef.current.startX, y: dragRef.current.y + event.clientY - dragRef.current.startY });
  };
  const endDrag = () => { dragRef.current = null; };
  const save = async () => {
    const validationError = validateCustomerForm(form);
    if (validationError) { setErrorMessage(validationError); return; }
    setSaving(true);
    setErrorMessage("");
    try {
      const { data: customer, error } = await createQuickCustomer(customerPayload(form));
      if (error || !customer) throw error || new Error("Cliente não foi cadastrado.");
      if (Object.values(address).some(Boolean)) {
        const addressResult = await createQuickCustomerAddress({
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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showClose={false} className="max-w-2xl border-0 bg-transparent p-0 shadow-none">
      <DialogTitle className="sr-only">Criar cliente</DialogTitle>
      <div style={{ transform: `translate(${position.x}px, ${position.y}px)` }} className="relative w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-white shadow-2xl border border-[#0d1b2e]/10">
        <div onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} className="sticky top-0 z-10 flex cursor-move items-center justify-between border-b border-[#0d1b2e]/10 bg-white px-4 py-3 select-none">
          <div><h3 className="text-sm font-bold text-[#0d1b2e]">Criar cliente</h3><p className="text-[11px] text-[#5a6a82] mt-0.5">Cadastre o cliente sem sair da Nova OS</p></div>
          <AdminIconButton ariaLabel="Fechar" onClick={onClose} variant="ghost"><X size={16} /></AdminIconButton>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <CustomerTypeToggle value={form.customerType} onChange={customerType => setForm({ ...form, customerType })} />
            {form.customerType === "PF" ? <>
              <FInput label="Nome completo" required value={form.full_name} onChange={(e: any) => setForm({ ...form, full_name: e.target.value })} />
              <FCpfInput label="CPF" required value={form.document} onChange={(e: any) => setForm({ ...form, document: e.target.value })} />
              <div><FInput label="Data de nascimento" type="date" required value={form.birth_date} max={todayDateOnly()} onChange={(e: any) => setForm({ ...form, birth_date: e.target.value })} />{!form.birth_date && <p className="mt-1 text-xs text-red-600">Informe a data de nascimento.</p>}</div>
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
            actions={<AdminButton variant="secondary" size="sm" onClick={() => setSharedAddressOpen(value => !value)}><Link2 size={13} /> Endereço enviado pelo cliente</AdminButton>}
          >
            <div className="space-y-3">
              {(sharedAddressOpen || address.shared_map_url) && <FInput label="Link compartilhado do endereço" type="url" placeholder="Cole o link enviado pelo cliente" value={address.shared_map_url || ""} onChange={(e: any) => setAddress({ ...address, shared_map_url: e.target.value })} />}
              <AddressFields value={address} onChange={setAddress} inputClassName={INPUT} />
            </div>
          </Section>
          {errorMessage && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errorMessage}</p>}
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#0d1b2e]/10 bg-white px-4 py-3"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>{hasPermission("customers.create") && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Criar cliente"}</BtnPrimary>}</div>
      </div>
      </DialogContent>
    </Dialog>
  );
}
