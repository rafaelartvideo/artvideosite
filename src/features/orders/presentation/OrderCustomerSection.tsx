import type { Dispatch, SetStateAction } from "react";
import { Edit2, MessageCircle, Plus, Search, Users } from "lucide-react";
import { AddressFields } from "@/app/components/AddressFields";
import type { Address } from "@/lib/address";
import {
  BtnPrimary,
  BtnSecondary,
  cn,
  CustomerTypeToggle,
  FInput,
  formatCnpj,
  formatCpf,
  formatFoundationDate,
  formatPhone,
  getWhatsAppUrl,
  INPUT,
  Section,
  todayDateOnly,
  type CustomerForm,
} from "@/shared/admin/AdminPrimitives";
import { InfoRow } from "./OrderDetailsContent";

export function OrderCustomerSection({
  selectedCustomer,
  editingCustomer,
  customerDraft,
  customerAddressDraft,
  saving,
  editingOrder,
  addressExpanded,
  customerSearch,
  customerResults,
  hasPermission,
  setCustomerDraft,
  setCustomerAddressDraft,
  setEditingCustomer,
  setAddressExpanded,
  saveCustomer,
  searchCustomers,
  selectCustomer,
  onClearCustomer,
  onCreateCustomer,
}: {
  selectedCustomer: any;
  editingCustomer: boolean;
  customerDraft: CustomerForm;
  customerAddressDraft: Address;
  saving: boolean;
  editingOrder: boolean;
  addressExpanded: boolean;
  customerSearch: string;
  customerResults: any[];
  hasPermission: (permission: string) => boolean;
  setCustomerDraft: Dispatch<SetStateAction<CustomerForm>>;
  setCustomerAddressDraft: Dispatch<SetStateAction<Address>>;
  setEditingCustomer: Dispatch<SetStateAction<boolean>>;
  setAddressExpanded: Dispatch<SetStateAction<boolean>>;
  saveCustomer: () => void;
  searchCustomers: (query: string) => void;
  selectCustomer: (customer: any) => void;
  onClearCustomer: () => void;
  onCreateCustomer: () => void;
}) {
  const editingOS = editingOrder;
  const setQuickCustomer = (open: boolean) => {
    if (open) onCreateCustomer();
  };
  return (
<Section title="Cliente">
              {selectedCustomer ? (
                <div className="space-y-4">
                  {editingCustomer ? (
                    <div className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <CustomerTypeToggle value={customerDraft.customerType} disabled onChange={customerType => setCustomerDraft({ ...customerDraft, customerType })} />
                        {customerDraft.customerType === "PF" ? <>
                          <FInput label="Nome completo" required value={customerDraft.full_name} onChange={(e: any) => setCustomerDraft({ ...customerDraft, full_name: e.target.value })} />
                          <FInput label="CPF" value={customerDraft.document} disabled />
                          <div><FInput label="Data de nascimento" type="date" required value={customerDraft.birth_date} max={todayDateOnly()} onChange={(e: any) => setCustomerDraft({ ...customerDraft, birth_date: e.target.value })} />{!customerDraft.birth_date && <p className="mt-1 text-xs text-red-600">Informe a data de nascimento.</p>}</div>
                        </> : <>
                          <FInput label="Nome fantasia" required value={customerDraft.trade_name} onChange={(e: any) => setCustomerDraft({ ...customerDraft, trade_name: e.target.value })} />
                          <FInput label="CNPJ" required value={customerDraft.cnpj} disabled />
                          <FInput label="Razão social" value={customerDraft.legal_name} onChange={(e: any) => setCustomerDraft({ ...customerDraft, legal_name: e.target.value })} />
                          <FInput label="Inscrição estadual" value={customerDraft.state_registration} hint="Deixe em branco se não for contribuinte · ISENTO se isento" onChange={(e: any) => setCustomerDraft({ ...customerDraft, state_registration: e.target.value })} />
                          <FInput label="Fundação" value={customerDraft.foundation_date} placeholder="dd/mm/aaaa" maxLength={10} onChange={(e: any) => setCustomerDraft({ ...customerDraft, foundation_date: formatFoundationDate(e.target.value) })} />
                        </>}
                          <FInput label="WhatsApp" value={customerDraft.whatsapp} onChange={(e: any) => setCustomerDraft({ ...customerDraft, whatsapp: formatPhone(e.target.value) })} />
                          <FInput label="Telefone" value={customerDraft.phone} onChange={(e: any) => setCustomerDraft({ ...customerDraft, phone: formatPhone(e.target.value) })} />
                        <div className="sm:col-span-2"><FInput label="E-mail" type="email" value={customerDraft.email} onChange={(e: any) => setCustomerDraft({ ...customerDraft, email: e.target.value })} /></div>
                      </div>
                      <Section title="Endereço do cliente">
                        <AddressFields value={customerAddressDraft} onChange={setCustomerAddressDraft} inputClassName={INPUT} />
                      </Section>
                      {hasPermission("customers.edit") && <BtnPrimary onClick={saveCustomer} disabled={saving}>{saving ? "Salvando..." : "Salvar dados"}</BtnPrimary>}
                    </div>
                  ) : (
                    <>
                      <div className="grid sm:grid-cols-3 gap-3">
                        <InfoRow label="Nome" value={selectedCustomer.full_name} />
                        <InfoRow label="Telefone" value={formatPhone(selectedCustomer.phone)} />
                        <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-0.5">WhatsApp</p><div className="flex items-center gap-2 text-sm font-medium text-[#0d1b2e]">{formatPhone(selectedCustomer.whatsapp) || "—"}{getWhatsAppUrl(selectedCustomer.whatsapp) && <a href={getWhatsAppUrl(selectedCustomer.whatsapp) || "#"} target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp do cliente" className="text-[#25d366] hover:text-[#1da851]"><MessageCircle size={16} /></a>}</div></div>
                        <InfoRow label="E-mail" value={selectedCustomer.email} />
                        <InfoRow label="Documento" value={selectedCustomer.document} />
                      </div>
                      <button type="button" onClick={() => setAddressExpanded(value => !value)} className="text-xs font-bold text-[#0057e7] hover:underline">{addressExpanded ? "Ocultar endereço ▲" : "Mostrar endereço ▼"}</button>
                      {addressExpanded && <div className="border-t border-[#0d1b2e]/8 pt-4"><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-2">Endereço</p><div className="grid sm:grid-cols-3 gap-3">{(() => { const address = (selectedCustomer.addresses || []).find((item: Address) => item.is_default) || selectedCustomer.addresses?.[0]; const labels: Record<string, string> = { zip_code: "CEP", street: "Rua", number: "Número", complement: "Complemento", neighborhood: "Bairro", city: "Cidade", state: "Estado" }; return (["zip_code", "street", "number", "complement", "neighborhood", "city", "state"] as const).map(key => address?.[key] ? <InfoRow key={key} label={labels[key]} value={address[key]} /> : null); })()}</div></div>}
                      <div className="flex flex-wrap gap-2">{!editingOS && <BtnSecondary onClick={onClearCustomer}><Users size={13} /> Trocar cliente</BtnSecondary>}{hasPermission("customers.edit") && <BtnSecondary onClick={() => setEditingCustomer(true)}><Edit2 size={13} /> Editar dados</BtnSecondary>}</div>
                    </>
                  )}
                  {editingCustomer && <button onClick={() => setEditingCustomer(false)} className="text-xs text-[#5a6a82] hover:underline">Cancelar edição</button>}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-end gap-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
                      <input value={customerSearch} onChange={e => searchCustomers(e.target.value)} placeholder="Buscar cliente por nome, CPF ou WhatsApp..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
                    </div>
                    {hasPermission("customers.create") && <BtnPrimary onClick={() => setQuickCustomer(true)}><Plus size={13} /> Criar cliente</BtnPrimary>}
                  </div>
                  {customerResults.length > 0 && (
                    <div className="border border-[#0d1b2e]/10 rounded-lg overflow-hidden">
                      {customerResults.map(c => (
                        <button key={c.id} onClick={() => selectCustomer(c)} className="w-full text-left px-3 py-2 hover:bg-[#e8eef8] border-b last:border-b-0 border-[#0d1b2e]/5">
                          <p className="font-semibold text-sm text-[#0d1b2e]">{c.full_name}</p>
                          <p className="text-xs text-[#5a6a82]">{c.customer_type === "PJ" ? formatCnpj(c.cnpj || "") : formatCpf(c.document || "")} {c.whatsapp && `· ${formatPhone(c.whatsapp)}`}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Section>
  );
}
