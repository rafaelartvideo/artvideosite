import { useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { Link2, Search } from "lucide-react";
import type { Address } from "@/lib/address";
import type { CustomerForm } from "../domain/customer-form";
import { AddressFields } from "@/shared/ui/address/AddressFields";
import { AdminButton, AdminPage, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { CustomerTypeToggle, FBrazilianDateInput, FCnpjInput, FEmailInput, FInput, FPhoneInput, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { cn, formatCpf, isValidCpf, todayDateOnly } from "@/shared/domain/formatters";

type Props = {
  open: boolean;
  form: CustomerForm;
  setForm: Dispatch<SetStateAction<CustomerForm>>;
  address: Address;
  setAddress: Dispatch<SetStateAction<Address>>;
  saving: boolean;
  canCreate: boolean;
  cpfLoading: boolean;
  cpfError: string;
  setCpfError: Dispatch<SetStateAction<string>>;
  cpfInputRef: RefObject<HTMLInputElement | null>;
  onLookupCpf: (value?: string) => Promise<void>;
  cnpjLoading: boolean;
  cnpjMessage: string;
  setCnpjMessage: Dispatch<SetStateAction<string>>;
  onLookupCnpj: (value: string, baseForm?: CustomerForm) => Promise<void>;
  onCreate: () => void;
  onClose: () => void;
};

export function CreateCustomerPage(props: Props) {
  const [sharedAddressOpen, setSharedAddressOpen] = useState(false);
  const {
    open: createOpen, form: createForm, setForm: setCreateForm,
    address: createAddress, setAddress: setCreateAddress, saving, canCreate,
    cpfLoading, cpfError, setCpfError, cpfInputRef, onLookupCpf: lookupCreateCpf,
    cnpjLoading, cnpjMessage, setCnpjMessage,
    onLookupCnpj: lookupCreateCnpj, onCreate, onClose,
  } = props;
  return <>
{createOpen && (
        <AdminPage open={true} onClose={onClose} breadcrumb="Clientes" title="Novo cliente" subtitle="Preencha os dados do cliente" maxW="max-w-5xl">
          <div className="p-5 space-y-5">
            <Section title="Dados do cliente">
              <div className="grid sm:grid-cols-2 gap-4">
                <CustomerTypeToggle value={createForm.customerType} onChange={customerType => { setCpfError(""); setCreateForm({ ...createForm, customerType }); }} />
                {createForm.customerType === "PF" ? <>
                  <div>
                    <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">CPF<span className="text-red-400">*</span></label>
                    <div className="flex min-w-0 items-center gap-2">
                      <input ref={cpfInputRef} inputMode="numeric" maxLength={14} autoComplete="off" aria-invalid={Boolean(cpfError)} aria-describedby={cpfError ? "create-cpf-error" : undefined} required value={formatCpf(createForm.document)} placeholder="000.000.000-00" onBlur={() => { if (createForm.document.trim() && !isValidCpf(createForm.document)) setCpfError("CPF inválido. Verifique os números informados."); }} onChange={e => { const nextValue = formatCpf(e.target.value); setCreateForm({ ...createForm, document: nextValue }); if (!nextValue || isValidCpf(nextValue)) setCpfError(""); }} className={cn(INPUT, "min-w-0 flex-1", cpfError && "border-red-500 focus:border-red-500 focus:ring-red-500/50")} />
                      <AdminButton variant="secondary" size="sm" onClick={() => void lookupCreateCpf(createForm.document)} disabled={saving || cpfLoading || !isValidCpf(createForm.document)} className="h-[42px] shrink-0 gap-1.5 border-[#0057e7]/30 px-3 text-[#0057e7] hover:bg-[#0057e7]/5" aria-label="Consultar CPF" title="Consultar CPF">
                        <Search size={16} className="shrink-0" /><span className="hidden sm:inline">{cpfLoading ? "Consultando..." : "Consultar"}</span>
                      </AdminButton>
                    </div>
                    {cpfError && <p id="create-cpf-error" className="mt-1 text-xs text-red-600">{cpfError}</p>}
                  </div>
                  <FInput label="Nome completo" required value={createForm.full_name} onChange={(e: any) => setCreateForm({ ...createForm, full_name: e.target.value })} />
                  <FInput label="Data de nascimento" type="date" required value={createForm.birth_date} max={todayDateOnly()} onChange={(e: any) => setCreateForm({ ...createForm, birth_date: e.target.value })} />
                </> : <>
                  <FCnpjInput label="CNPJ" required value={createForm.cnpj} onBlur={(e: any) => lookupCreateCnpj(e.target.value)} onChange={(e: any) => { const nextCnpj = e.target.value; setCnpjMessage(""); setCreateForm({ ...createForm, cnpj: nextCnpj }); if (nextCnpj.replace(/\D/g, "").length === 14) void lookupCreateCnpj(nextCnpj, { ...createForm, cnpj: nextCnpj }); }} hint={cnpjLoading ? "Consultando CNPJ..." : cnpjMessage || undefined} />
                  <FInput label="Nome fantasia" required value={createForm.trade_name} onChange={(e: any) => setCreateForm({ ...createForm, trade_name: e.target.value })} />
                  <FInput label="Razão social" value={createForm.legal_name} onChange={(e: any) => setCreateForm({ ...createForm, legal_name: e.target.value })} />
                  <FInput label="Inscrição estadual" value={createForm.state_registration} hint="Deixe em branco se não for contribuinte · ISENTO se isento" onChange={(e: any) => setCreateForm({ ...createForm, state_registration: e.target.value })} />
                  <FBrazilianDateInput label="Fundação" value={createForm.foundation_date} onChange={(e: any) => setCreateForm({ ...createForm, foundation_date: e.target.value })} />
                </>}
                <FEmailInput label="E-mail" value={createForm.email} onChange={(e: any) => setCreateForm({ ...createForm, email: e.target.value })} />
                <FPhoneInput label="Telefone" required value={createForm.phone} onChange={(e: any) => setCreateForm({ ...createForm, phone: e.target.value })} />
                <FPhoneInput label="WhatsApp" mobile value={createForm.whatsapp} onChange={(e: any) => setCreateForm({ ...createForm, whatsapp: e.target.value })} />
              </div>
            </Section>
            <Section
              title="Dados de endereço"
              actions={
                <AdminButton
                  variant="secondary"
                  size="sm"
                  onClick={() => setSharedAddressOpen(value => !value)}
                  disabled={saving}
                  className="border-[#0057e7]/30 text-[#0057e7] hover:bg-[#0057e7]/5"
                >
                  <Link2 size={13} /> Endereço enviado pelo cliente
                </AdminButton>
              }
            >
              <div className="space-y-4">
                {(sharedAddressOpen || createAddress.shared_map_url) && (
                  <FInput
                    label="Link compartilhado do endereço"
                    type="url"
                    placeholder="Cole o link do Google Maps, Waze, Apple Maps..."
                    value={createAddress.shared_map_url || ""}
                    onChange={(e: any) => setCreateAddress({ ...createAddress, shared_map_url: e.target.value })}
                    hint="O link ficará vinculado ao endereço principal do cliente."
                  />
                )}
                <AddressFields value={createAddress} onChange={setCreateAddress} inputClassName={INPUT} />
              </div>
            </Section>
          </div>
          <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
            <BtnSecondary onClick={onClose} disabled={saving}>Cancelar</BtnSecondary>
            {canCreate && <BtnPrimary onClick={onCreate} loading={saving} loadingText="Salvando...">Cadastrar Cliente</BtnPrimary>}
          </div>
        </AdminPage>
      )}
  </>;
}
