import type { AppointmentWithRelations } from "../application/agenda-calendar";
import { formatCnpj, formatCpf, formatPhone } from "@/shared/domain/formatters";
import { AdminButton, AdminDialog, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";

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
  const customerName = appointment?.customer?.customer_type === "PJ"
    ? (appointment?.customer?.trade_name || appointment?.customer?.legal_name || appointment?.customer?.full_name || "Cliente")
    : (appointment?.customer?.full_name || "Cliente");

  return <AdminDialog
    open={Boolean(appointment)}
    onClose={onClose}
    title="Detalhes do agendamento"
    description={appointment?.situation?.name || "Agendamento"}
    minimizedDescription={appointment ? `${customerName} · ${formatDate(appointment.appointment_date)} · ${periodLabel(appointment)}` : "Agendamento"}
    className="max-w-2xl"
    footer={<div className="flex justify-end"><BtnSecondary onClick={onClose}>Fechar</BtnSecondary></div>}
  >
    {appointment && <div className="space-y-4">
      <Section title="Cliente">
        <p className="font-bold text-[#0d1b2e]">{customerName}</p>
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
        {appointment.appointment_technicians?.length ? <div className="flex flex-wrap gap-2">{appointment.appointment_technicians.map(technician => <span key={technician.employee_id} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-primary">{technician.employee?.full_name || "Técnico"}</span>)}</div> : <p className="text-sm text-[#5a6a82]">Nenhum técnico selecionado</p>}
      </Section>
      <Section title="Endereço">
        {appointment.street || appointment.city || appointment.zip_code ? <p className="whitespace-pre-wrap text-sm text-[#0d1b2e]">{[appointment.zip_code, [appointment.street, appointment.number].filter(Boolean).join(", "), appointment.complement, appointment.neighborhood, [appointment.city, appointment.state].filter(Boolean).join(" - ")].filter(Boolean).join("\n")}</p> : <p className="text-sm text-[#5a6a82]">Endereço não informado</p>}
      </Section>
      {appointment.service_order_id && <Section title="OS relacionada">
        <p className="text-sm font-bold text-primary">{appointment.service_order?.os_number ? `OS ${appointment.service_order.os_number}` : "OS relacionada"}</p>
        <AdminButton variant="secondary" size="sm" onClick={() => { onClose(); onOpenOrder(appointment.service_order_id as string); }} className="mt-2 border-primary/30 text-primary">Abrir OS</AdminButton>
      </Section>}
    </div>}
  </AdminDialog>;
}
