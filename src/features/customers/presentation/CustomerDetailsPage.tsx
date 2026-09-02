import type { Dispatch, SetStateAction } from "react";
import { Edit2 } from "lucide-react";
import type { Address } from "@/lib/address";
import { emptyAddress } from "@/lib/address";
import type { CustomerForm } from "../domain/customer-form";
import { customerFormFromCustomer } from "../domain/customer-form";
import { AddressFields } from "@/shared/ui/address/AddressFields";
import { AdminButton, AdminPage, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { CustomerTypeToggle, FInput, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { formatCnpj, formatCpf, formatDateOnly, formatFoundationDate, formatPhone, todayDateOnly } from "@/shared/domain/formatters";

type Props = {
  detail: any;
  detailQuotes: any[];
  detailOrders: any[];
  detailLoading: boolean;
  editForm: CustomerForm;
  setEditForm: Dispatch<SetStateAction<CustomerForm>>;
  editAddress: Address;
  setEditAddress: Dispatch<SetStateAction<Address>>;
  editingCustomerData: boolean;
  setEditingCustomerData: Dispatch<SetStateAction<boolean>>;
  editingCustomerAddress: boolean;
  setEditingCustomerAddress: Dispatch<SetStateAction<boolean>>;
  savingCustomer: boolean;
  savingAddress: boolean;
  canEdit: boolean;
  onSaveCustomer: () => void;
  onEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveAddress: () => void;
  onOpenOrder?: (id: string, customerId?: string) => void;
  onClose: () => void;
};

const fmtDate = (value?: string) => value
  ? new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
  : "—";

export function CustomerDetailsPage(props: Props) {
  const {
    detail, detailQuotes, detailOrders, detailLoading, editForm, setEditForm,
    editAddress, setEditAddress, editingCustomerData, setEditingCustomerData,
    editingCustomerAddress, setEditingCustomerAddress, savingCustomer,
    savingAddress, canEdit, onSaveCustomer: handleSaveCustomerData,
    onSaveAddress: handleSaveCustomerAddress, onOpenOrder, onClose, onEdit, onCancelEdit,
  } = props;
  return <>
{detail && (
        <AdminPage open={true} onClose={() => onClose()} breadcrumb="Clientes" title={detail.full_name} subtitle={detail.customer_type === "PJ" ? (detail.cnpj ? formatCnpj(detail.cnpj) : "Pessoa Jurídica") : (detail.document ? formatCpf(detail.document) : "Pessoa Física")} maxW="max-w-5xl">
          <div className="p-5 space-y-5">
            {/* Customer info */}
            <Section title="Informações do cliente">
              {editingCustomerData ? (
                <div className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <CustomerTypeToggle value={editForm.customerType} disabled onChange={customerType => setEditForm({ ...editForm, customerType })} />
                    {editForm.customerType === "PF" ? <>
                    <FInput label="Nome completo" value={editForm.full_name} required onChange={(e: any) => setEditForm({ ...editForm, full_name: e.target.value })} />
                    <FInput label="CPF" value={editForm.document} disabled />
                    <div><FInput label="Data de nascimento" type="date" required value={editForm.birth_date} max={todayDateOnly()} onChange={(e: any) => setEditForm({ ...editForm, birth_date: e.target.value })} />{!editForm.birth_date && <p className="mt-1 text-xs text-red-600">Informe a data de nascimento.</p>}{editForm.birth_date > todayDateOnly() && <p className="mt-1 text-xs text-red-600">A data não pode ser futura.</p>}</div>
                    </> : <>
                    <FInput label="Nome fantasia" value={editForm.trade_name} required onChange={(e: any) => setEditForm({ ...editForm, trade_name: e.target.value })} />
                    <FInput label="CNPJ" value={editForm.cnpj} required disabled placeholder="00.000.000/0000-00" />
                    <FInput label="Razão social" value={editForm.legal_name} onChange={(e: any) => setEditForm({ ...editForm, legal_name: e.target.value })} />
                    <FInput label="Inscrição estadual" value={editForm.state_registration} hint="Deixe em branco se não for contribuinte · ISENTO se isento" onChange={(e: any) => setEditForm({ ...editForm, state_registration: e.target.value })} />
                    <FInput label="Fundação" value={editForm.foundation_date} placeholder="dd/mm/aaaa" maxLength={10} onChange={(e: any) => setEditForm({ ...editForm, foundation_date: formatFoundationDate(e.target.value) })} />
                    </>}
                    <FInput label="WhatsApp" value={editForm.whatsapp} onChange={(e: any) => setEditForm({ ...editForm, whatsapp: formatPhone(e.target.value) })} />
                    <FInput label="Telefone" value={editForm.phone} onChange={(e: any) => setEditForm({ ...editForm, phone: formatPhone(e.target.value) })} />
                    <div className="sm:col-span-2"><FInput label="E-mail" type="email" value={editForm.email} onChange={(e: any) => setEditForm({ ...editForm, email: e.target.value })} /></div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    {canEdit && <BtnPrimary onClick={() => void handleSaveCustomerData()} disabled={savingCustomer}>{savingCustomer ? "Salvando..." : "Salvar alterações"}</BtnPrimary>}
                    <BtnSecondary onClick={() => { setEditForm(customerFormFromCustomer(detail)); setEditingCustomerData(false); onCancelEdit?.(); }}>Cancelar</BtnSecondary>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm mb-3">
                    <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Nome</p><p className="font-bold text-[#0d1b2e]">{detail.full_name}</p></div>
                    {detail.customer_type === "PJ" ? <>
                      <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Tipo</p><p className="font-medium text-[#0d1b2e]">Pessoa Jurídica</p></div>
                      <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">CNPJ</p><p className="font-medium text-[#0d1b2e]">{detail.cnpj ? formatCnpj(detail.cnpj) : "—"}</p></div>
                      <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Nome fantasia</p><p className="font-medium text-[#0d1b2e]">{detail.trade_name || detail.full_name || "—"}</p></div>
                      <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Razão social</p><p className="font-medium text-[#0d1b2e]">{detail.legal_name || "—"}</p></div>
                    </> : <>
                      <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">CPF</p><p className="font-medium text-[#0d1b2e]">{detail.document ? formatCpf(detail.document) : "—"}</p></div>
                      {detail.birth_date && <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Data de nascimento</p><p className="font-medium text-[#0d1b2e]">{formatDateOnly(detail.birth_date)}</p></div>}
                    </>}
                    <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">WhatsApp</p><p className="font-medium text-[#0d1b2e]">{formatPhone(detail.whatsapp) || "—"}</p></div>
                    <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Telefone</p><p className="font-medium text-[#0d1b2e]">{formatPhone(detail.phone) || "—"}</p></div>
                    <div className="sm:col-span-2"><p className="text-[10px] text-[#5a6a82] font-bold uppercase">E-mail</p><p className="font-medium text-[#0d1b2e]">{detail.email || "—"}</p></div>
                    <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Cadastrado em</p><p className="font-medium text-[#0d1b2e]">{fmtDate(detail.created_at)}</p></div>
                  </div>
                  {canEdit && <AdminButton variant="secondary" size="sm" onClick={() => { setEditingCustomerData(true); onEdit?.(); }} className="border-[#0057e7]/30 text-[#0057e7] hover:bg-[#0057e7]/5">
                    <Edit2 size={12} /> Editar dados
                  </AdminButton>}
                </div>
              )}
            </Section>

            <Section title="Endereço">
              {editingCustomerAddress ? (
                <div className="space-y-3">
                  <AddressFields value={editAddress} onChange={setEditAddress} inputClassName={INPUT} />
                  <div className="flex gap-2 pt-1">
                    {canEdit && <BtnPrimary onClick={() => void handleSaveCustomerAddress()} disabled={savingAddress}>{savingAddress ? "Salvando..." : "Salvar endereço"}</BtnPrimary>}
                    <BtnSecondary onClick={() => { setEditingCustomerAddress(false); setEditAddress({ ...emptyAddress, ...((detail.addresses || []).find((address: Address) => address.is_default) || detail.addresses?.[0] || {}) }); }}>Cancelar</BtnSecondary>
                  </div>
                </div>
              ) : (
                <>
                  {((detail.addresses || []).length > 0) ? (
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      {(["zip_code", "street", "number", "complement", "neighborhood", "city", "state"] as const).map((key) => {
                        const labels: Record<string, string> = { zip_code: "CEP", street: "Rua", number: "Número", complement: "Complemento", neighborhood: "Bairro", city: "Cidade", state: "Estado" };
                        const address = (detail.addresses || []).find((item: Address) => item.is_default) || detail.addresses?.[0];
                        return address?.[key] ? <div key={key}><p className="text-[10px] text-[#5a6a82] font-bold uppercase">{labels[key]}</p><p className="font-medium text-[#0d1b2e]">{address[key]}</p></div> : null;
                      })}
                    </div>
                  ) : <p className="text-sm text-[#5a6a82]">Nenhum endereço cadastrado.</p>}
                  {canEdit && <AdminButton variant="secondary" size="sm" onClick={() => setEditingCustomerAddress(true)} className="mt-3 border-[#0057e7]/30 text-[#0057e7] hover:bg-[#0057e7]/5">
                    <Edit2 size={12} /> Editar endereço
                  </AdminButton>}
                </>
              )}
            </Section>

            {detailLoading ? <LoadingState text="Carregando histórico..." /> : (
              <>
                {/* Quotes */}
                <Section title={`Orçamentos (${detailQuotes.length})`}>
                  {detailQuotes.length === 0 ? (
                    <p className="text-xs text-[#5a6a82]">Nenhum orçamento para este cliente.</p>
                  ) : (
                    <div className="space-y-2">
                      {detailQuotes.map(q => (
                        <div key={q.id} className="bg-[#f8fafc] border border-[#0d1b2e]/8 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs font-bold text-[#0057e7]">{q.protocol || q.id.slice(0, 8)}</span>
                            <StatusBadge status={(q.request_status as any)?.name || "—"} />
                          </div>
                          <p className="text-xs text-[#5a6a82]">{(q.service as any)?.title || "Serviço não informado"}{(q.brand as any)?.name ? ` — ${(q.brand as any).name}` : ""}</p>
                          {q.customer_message && <p className="text-xs text-[#0d1b2e] mt-1 italic">&quot;{q.customer_message}&quot;</p>}
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-[#5a6a82]">
                            <span>{fmtDate(q.created_at)}</span>
                            {q.estimated_price && <span>Est: R$ {Number(q.estimated_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>}
                            {q.final_price && <span>Final: R$ {Number(q.final_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Orders */}
                <Section title={`Ordens de Serviço (${detailOrders.length})`}>
                  {detailOrders.length === 0 ? (
                    <p className="text-xs text-[#5a6a82]">Nenhuma OS para este cliente.</p>
                  ) : (
                    <div className="space-y-2">
                      {detailOrders.map(o => (
                        <button key={o.id} type="button" onClick={() => onOpenOrder?.(o.id, detail.id)} className="w-full text-left bg-[#f8fafc] border border-[#0d1b2e]/8 rounded-lg p-3 hover:bg-[#eef5ff] transition-colors">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-black text-xs text-[#0057e7]">#{o.os_number || o.id.slice(0, 8)}</span>
                            <StatusBadge status={(o.order_status as any)?.name || "—"} color={(o.order_status as any)?.color} />
                          </div>
                          <p className="text-xs font-semibold text-[#0d1b2e]">{(o.service as any)?.title || "Ordem de Serviço"}</p>
                          {o.customer_notes && <p className="text-xs text-[#5a6a82] mt-0.5">{o.customer_notes}</p>}
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-[#5a6a82]">
                            <span>Criada: {fmtDate(o.created_at)}</span>
                            {o.scheduled_at && <span>Agendado: {fmtDate(o.scheduled_at)}</span>}
                            {o.completed_at && <span>Concluído: {fmtDate(o.completed_at)}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </Section>
              </>
            )}
          </div>

          <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-6 py-4 text-right">
            <BtnSecondary onClick={() => onClose()}>Fechar</BtnSecondary>
          </div>
        </AdminPage>
      )}
  </>;
}
