import { X } from "lucide-react";
import type { AppointmentWithRelations } from "../application/agenda-calendar";
import { formatCnpj, formatCpf, formatPhone } from "@/shared/domain/formatters";
import { BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/primitives/dialog";

type Props = {
  appointment: AppointmentWithRelations | null;
  onClose: () => void;
  onOpenOrder: (orderId: string) => void;
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function periodLabel(appointment: AppointmentWithRelations) {
  if (appointment.period === "no_time") return "Sem horário";
  if (appointment.period === "morning") return "Manhã";
  if (appointment.period === "afternoon") return "Tarde";
  if (appointment.period === "evening") return "Noite";
  return `${appointment.start_time || ""} às ${appointment.end_time || ""}`;
}

export function AppointmentDetailsDialog({ appointment, onClose, onOpenOrder }: Props) {
  return <Dialog open={Boolean(appointment)} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent showClose={false} className="max-h-[calc(100vh-2rem)] max-w-2xl gap-0 overflow-y-auto rounded-xl border-[#0d1b2e]/10 bg-white p-0 shadow-2xl">
      <DialogTitle className="sr-only">Detalhes do agendamento</DialogTitle>
      {appointment && <>
        <div className="flex items-center justify-between border-b border-[#0d1b2e]/10 px-5 py-4">
          <div><h2 className="font-black text-[#0d1b2e]">Detalhes do agendamento</h2><span className="mt-1 inline-block rounded-full px-2 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: appointment.situation?.color || "#0057e7" }}>{appointment.situation?.name || "Agendamento"}</span></div>
          <button type="button" aria-label="Fechar detalhes" onClick={onClose} className="rounded-full p-2 text-[#5a6a82] hover:bg-[#f5f7fa]"><X size={18} /></button>
        </div>
        <div className="space-y-4 p-5">
          <Section title="Cliente">
            <p className="font-bold text-[#0d1b2e]">{appointment.customer?.customer_type === "PJ" ? (appointment.customer.trade_name || appointment.customer.legal_name || appointment.customer.full_name) : appointment.customer?.full_name || "Cliente"}</p>
            <p className="text-sm text-[#5a6a82]">{appointment.customer?.customer_type === "PJ" ? "Pessoa jurídica" : "Pessoa física"}</p>
            <p className="text-sm text-[#5a6a82]">{appointment.customer?.customer_type === "PJ" ? `CNPJ: ${formatCnpj(appointment.customer?.cnpj || "")}` : `CPF: ${formatCpf(appointment.customer?.document || "")}`}</p>
            {(appointment.customer?.whatsapp || appointment.customer?.phone) && <p className="text-sm text-[#5a6a82]">{appointment.customer.whatsapp ? `WhatsApp: ${formatPhone(appointment.customer.whatsapp)}` : `Telefone: ${formatPhone(appointment.customer.phone)}`}</p>}
            {appointment.customer?.email && <p className="text-sm text-[#5a6a82]">E-mail: {appointment.customer.email}</p>}
          </Section>
          <Section title="Agendamento">
            <p className="text-sm text-[#0d1b2e]">Data: {formatDate(appointment.appointment_date)}</p>
            <p className="text-sm text-[#0d1b2e]">Horário/Período: {periodLabel(appointment)}</p>
            {appointment.sector_location && <p className="text-sm text-[#0d1b2e]">Setor/Local: {appointment.sector_location}</p>}
            {appointment.description && <p className="whitespace-pre-wrap text-sm text-[#0d1b2e]">{appointment.description}</p>}
            <p className="text-sm text-[#0d1b2e]">É retorno: {appointment.is_return ? "Sim" : "Não"}</p>
          </Section>
          <Section title="Técnicos">
            {appointment.appointment_technicians?.length ? <div className="flex flex-wrap gap-2">{appointment.appointment_technicians.map(technician => <span key={technician.employee_id} className="rounded-full bg-[#e8eef8] px-2.5 py-1 text-xs font-bold text-[#0057e7]">{technician.employee?.full_name || "Técnico"}</span>)}</div> : <p className="text-sm text-[#5a6a82]">Nenhum técnico selecionado</p>}
          </Section>
          <Section title="Endereço">
            {appointment.street || appointment.city || appointment.zip_code ? <p className="whitespace-pre-wrap text-sm text-[#0d1b2e]">{[appointment.zip_code, [appointment.street, appointment.number].filter(Boolean).join(", "), appointment.complement, appointment.neighborhood, [appointment.city, appointment.state].filter(Boolean).join(" - ")].filter(Boolean).join("\n")}</p> : <p className="text-sm text-[#5a6a82]">Endereço não informado</p>}
          </Section>
          {appointment.service_order_id && <Section title="OS relacionada">
            <p className="text-sm font-bold text-[#0057e7]">{appointment.service_order?.os_number ? `OS ${appointment.service_order.os_number}` : "OS relacionada"}</p>
            <button type="button" onClick={() => { onClose(); onOpenOrder(appointment.service_order_id as string); }} className="mt-2 rounded-lg border border-[#0057e7]/30 px-3 py-2 text-xs font-bold text-[#0057e7]">Abrir OS</button>
          </Section>}
        </div>
        <div className="flex justify-end border-t border-[#0d1b2e]/10 px-5 py-4"><BtnSecondary onClick={onClose}>Fechar</BtnSecondary></div>
      </>}
    </DialogContent>
  </Dialog>;
}
