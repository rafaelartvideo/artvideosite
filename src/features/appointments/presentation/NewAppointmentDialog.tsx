import type { Dispatch, SetStateAction } from "react";
import { Check, UserPlus, X } from "lucide-react";
import type { AppointmentPeriod, AppointmentSituation } from "@/lib/database.types";
import type { AppointmentFormState } from "../application/appointment-form";
import { formatCnpj, formatCpf, formatPhone } from "@/shared/domain/formatters";
import { BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { FInput, FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/primitives/dialog";
import { AppointmentAddressDialog } from "./AppointmentAddressDialog";
import { AppointmentTechniciansDialog } from "./AppointmentTechniciansDialog";

type Technician = { id: string; full_name: string };
type AppointmentSubmodal = "address" | "technicians" | null;

type Props = {
  open: boolean;
  onClose: () => void;
  saving: boolean;
  form: AppointmentFormState;
  setForm: Dispatch<SetStateAction<AppointmentFormState>>;
  customer: any;
  setCustomer: Dispatch<SetStateAction<any>>;
  changingCustomer: boolean;
  setChangingCustomer: Dispatch<SetStateAction<boolean>>;
  customerSearch: string;
  setCustomerSearch: Dispatch<SetStateAction<string>>;
  customerSearchLoading: boolean;
  customers: any[];
  setCustomers: Dispatch<SetStateAction<any[]>>;
  searchCustomers: (value: string) => Promise<void>;
  selectCustomer: (customer: any) => Promise<void>;
  orders: any[];
  setOrders: Dispatch<SetStateAction<any[]>>;
  situations: AppointmentSituation[];
  situationsLoading: boolean;
  technicians: Technician[];
  selectedTechnicianIds: string[];
  setSelectedTechnicianIds: Dispatch<SetStateAction<string[]>>;
  submodal: AppointmentSubmodal;
  setSubmodal: Dispatch<SetStateAction<AppointmentSubmodal>>;
  onZipLookup: () => void;
  onSave: () => Promise<void>;
};

export function NewAppointmentDialog({
  open: appointmentModalOpen,
  onClose,
  saving: appointmentSaving,
  form: appointmentForm,
  setForm: setAppointmentForm,
  customer: appointmentCustomer,
  setCustomer: setAppointmentCustomer,
  changingCustomer: changingAppointmentCustomer,
  setChangingCustomer: setChangingAppointmentCustomer,
  customerSearch: appointmentCustomerSearch,
  setCustomerSearch: setAppointmentCustomerSearch,
  customerSearchLoading: appointmentCustomerSearchLoading,
  customers: appointmentCustomers,
  setCustomers: setAppointmentCustomers,
  searchCustomers: searchAppointmentCustomers,
  selectCustomer: selectAppointmentCustomer,
  orders: appointmentOrders,
  setOrders: setAppointmentOrders,
  situations: appointmentSituations,
  situationsLoading: appointmentSituationsLoading,
  technicians: appointmentTechnicians,
  selectedTechnicianIds: selectedAppointmentTechnicians,
  setSelectedTechnicianIds: setSelectedAppointmentTechnicians,
  submodal: appointmentSubmodal,
  setSubmodal: setAppointmentSubmodal,
  onZipLookup: lookupAppointmentZip,
  onSave: saveAppointment,
}: Props) {
  return <Dialog open={open} onOpenChange={(open) => { if (!open && !appointmentSubmodal) onClose(); }}>
      <DialogContent showClose={false} className="flex max-h-[calc(100vh-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-xl border-[#0d1b2e]/10 bg-white p-0 shadow-2xl">
        <DialogTitle className="sr-only">Novo agendamento</DialogTitle>
        <div className="flex items-center justify-between border-b border-[#0d1b2e]/10 px-5 py-4"><h2 className="font-black text-[#0d1b2e]">Novo agendamento</h2><button type="button" aria-label="Fechar" onClick={() => onClose()} className="rounded-full p-2 text-[#5a6a82] hover:bg-[#f5f7fa]"><X size={18} /></button></div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {appointmentCustomer && !changingAppointmentCustomer ? <div className="rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-[#0d1b2e]">{appointmentCustomer.customer_type === "PJ" ? (appointmentCustomer.trade_name || appointmentCustomer.legal_name || appointmentCustomer.full_name) : appointmentCustomer.full_name}</p><p className="text-xs font-semibold text-[#5a6a82]">{appointmentCustomer.customer_type === "PJ" ? "Pessoa jurídica" : "Pessoa física"}</p><p className="mt-1 text-xs text-[#5a6a82]">{appointmentCustomer.customer_type === "PJ" ? `CNPJ: ${formatCnpj(appointmentCustomer.cnpj || "")}` : `CPF: ${formatCpf(appointmentCustomer.document || "")}`}</p>{(appointmentCustomer.whatsapp || appointmentCustomer.phone) && <p className="text-xs text-[#5a6a82]">{appointmentCustomer.whatsapp ? `WhatsApp: ${formatPhone(appointmentCustomer.whatsapp)}` : `Telefone: ${formatPhone(appointmentCustomer.phone)}`}</p>}{appointmentCustomer.email && <p className="text-xs text-[#5a6a82]">E-mail: {appointmentCustomer.email}</p>}</div><div className="flex shrink-0 flex-col gap-1"><button type="button" onClick={() => { setChangingAppointmentCustomer(true); setAppointmentCustomerSearch(""); setAppointmentCustomers([]); }} className="text-xs font-bold text-[#0057e7] hover:underline">Trocar cliente</button><button type="button" onClick={() => { setAppointmentCustomer(null); setAppointmentOrders([]); setAppointmentCustomers([]); setAppointmentCustomerSearch(""); setAppointmentForm(current => ({ ...current, customer_id: "", service_order_id: "", address_source: null, customer_address_id: "", zip_code: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" })); setChangingAppointmentCustomer(false); }} className="flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700"><X size={13} /> Remover</button></div></div></div> : <div className="relative"><FInput label="Cliente" required value={appointmentCustomerSearch} placeholder="Buscar por nome, CPF, CNPJ ou telefone" onChange={event => void searchAppointmentCustomers(event.target.value)} />{appointmentCustomer && <button type="button" onClick={() => { setChangingAppointmentCustomer(false); setAppointmentCustomerSearch(""); setAppointmentCustomers([]); }} className="mt-1 text-xs font-bold text-[#5a6a82] hover:text-[#0057e7]">Cancelar troca</button>}{appointmentCustomerSearchLoading && <p className="mt-1 text-xs text-[#5a6a82]">Buscando clientes...</p>}{!appointmentCustomerSearchLoading && appointmentCustomerSearch.trim().length >= 2 && appointmentCustomers.length === 0 && <p className="mt-1 text-xs text-[#5a6a82]">Nenhum cliente encontrado.</p>}{appointmentCustomers.length > 0 && <div className="absolute left-0 right-0 top-[4.5rem] z-10 overflow-hidden rounded-lg border border-[#0d1b2e]/10 bg-white shadow-lg">{appointmentCustomers.map(customer => <button type="button" key={customer.id} onClick={() => void selectAppointmentCustomer(customer)} className="block w-full border-b border-[#0d1b2e]/5 px-3 py-2 text-left hover:bg-[#eef5ff]"><p className="text-sm font-bold text-[#0d1b2e]">{customer.full_name || customer.trade_name}</p><p className="text-xs text-[#5a6a82]">{customer.customer_type === "PJ" ? formatCnpj(customer.cnpj || "") : formatCpf(customer.document || "")} · {formatPhone(customer.phone || customer.whatsapp)}</p></button>)}</div>}</div>}
          <FSelect label="OS relacionada (opcional)" disabled={!appointmentCustomer} value={appointmentForm.service_order_id} onChange={event => setAppointmentForm(current => ({ ...current, service_order_id: event.target.value }))} options={[{ value: "", label: appointmentCustomer ? "Nenhuma OS relacionada" : "Selecione um cliente primeiro" }, ...appointmentOrders.map(order => ({ value: order.id, label: `OS ${order.os_number || order.id.slice(0, 8)} — ${(order.service as any)?.title || (order.general_service as any)?.name || order.model || "Atendimento"}` }))]} />
          <div className="grid gap-3 sm:grid-cols-2"><FInput label="Data" required type="date" value={appointmentForm.appointment_date} onChange={event => setAppointmentForm(current => ({ ...current, appointment_date: event.target.value }))} /><FSelect label="Horário/Período" value={appointmentForm.period} onChange={event => setAppointmentForm(current => ({ ...current, period: event.target.value as AppointmentPeriod }))} options={[{ value: "no_time", label: "Sem horário" }, { value: "morning", label: "Manhã" }, { value: "afternoon", label: "Tarde" }, { value: "evening", label: "Noite" }, { value: "custom", label: "Horário personalizado" }]} />{appointmentForm.period === "custom" && <><FInput label="Hora inicial" required type="time" value={appointmentForm.start_time} onChange={event => setAppointmentForm(current => ({ ...current, start_time: event.target.value }))} /><FInput label="Hora final" required type="time" value={appointmentForm.end_time} onChange={event => setAppointmentForm(current => ({ ...current, end_time: event.target.value }))} /></>}</div>
          <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={!appointmentCustomer} onClick={() => setAppointmentSubmodal("address")} className="rounded-lg border border-[#0057e7]/30 px-3 py-2 text-xs font-bold text-[#0057e7] disabled:opacity-50">{appointmentForm.address_source ? "Editar endereço" : "Adicionar endereço"}</button>{appointmentForm.address_source && <span className="text-xs text-[#5a6a82]">{[appointmentForm.street, appointmentForm.number, appointmentForm.city, appointmentForm.state].filter(Boolean).join(", ")}</span>}</div>
          <div><div className="flex flex-wrap items-center gap-2">{selectedAppointmentTechnicians.map(id => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[#e8eef8] px-2.5 py-1 text-xs font-bold text-[#0057e7]">{appointmentTechnicians.find(item => item.id === id)?.full_name}<button type="button" onClick={() => setSelectedAppointmentTechnicians(current => current.filter(item => item !== id))} aria-label="Remover técnico"><X size={12} /></button></span>)}<button type="button" onClick={() => setAppointmentSubmodal("technicians")} className="rounded-lg border border-[#0057e7]/30 px-3 py-2 text-xs font-bold text-[#0057e7]"><UserPlus size={13} className="mr-1 inline" />Selecionar técnicos</button></div></div>
          <div className="grid gap-3 sm:grid-cols-2"><FInput label="Setor/Local" placeholder="Ex.: Sala 5" value={appointmentForm.sector_location} onChange={event => setAppointmentForm(current => ({ ...current, sector_location: event.target.value }))} /><FSelect label="Situação" required disabled={appointmentSituationsLoading} value={appointmentForm.situation_id} onChange={event => setAppointmentForm(current => ({ ...current, situation_id: event.target.value }))} options={appointmentSituations.map(situation => ({ value: situation.id, label: situation.name }))} /></div>
          <FTextarea label="Descrição" placeholder="O que será feito neste atendimento..." value={appointmentForm.description} onChange={event => setAppointmentForm(current => ({ ...current, description: event.target.value }))} rows={4} /><label className="flex items-center gap-2 text-sm font-semibold text-[#0d1b2e]"><Checkbox checked={appointmentForm.is_return} onCheckedChange={checked => setAppointmentForm(current => ({ ...current, is_return: checked === true }))} /> É retorno</label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#0d1b2e]/10 px-5 py-4"><BtnSecondary onClick={() => onClose()}>Cancelar</BtnSecondary><BtnPrimary onClick={() => void saveAppointment()} disabled={appointmentSaving || appointmentSituationsLoading}>{appointmentSaving ? "Agendando..." : <><Check size={15} /> Agendar</>}</BtnPrimary></div>
        {appointmentSubmodal === "address" && <AppointmentAddressDialog
          form={appointmentForm}
          customer={appointmentCustomer}
          setForm={setAppointmentForm}
          onClose={() => setAppointmentSubmodal(null)}
          onZipBlur={() => void lookupAppointmentZip()}
        />}
        {appointmentSubmodal === "technicians" && <AppointmentTechniciansDialog
          technicians={appointmentTechnicians}
          selectedIds={selectedAppointmentTechnicians}
          onSelectedIdsChange={setSelectedAppointmentTechnicians}
          onClose={() => setAppointmentSubmodal(null)}
        />}
      </DialogContent>
    </Dialog>;
}
