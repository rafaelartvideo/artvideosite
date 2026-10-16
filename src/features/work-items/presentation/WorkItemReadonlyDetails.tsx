import { CalendarClock, CheckCircle2, ClipboardList, Flag, UserRound, Users } from "lucide-react";
import { formatCnpj, formatCpf, formatPhone } from "@/shared/domain/formatters";
import type { WorkEmployee, WorkItem } from "../infrastructure/work-items.repository";

const statusLabel: Record<WorkItem["status"], string> = {
  pending: "Pendente", in_progress: "Em andamento", waiting: "Aguardando",
  completed: "Concluída", cancelled: "Cancelada",
};
const priorityLabel: Record<WorkItem["priority"], string> = {
  low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente",
};
const outcomeLabel: Record<NonNullable<WorkItem["outcome"]>, string> = {
  fulfilled: "Cumprido", not_fulfilled: "Não cumprido", no_show: "Não compareceu", cancelled: "Cancelado",
};
const dateText = (value: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Não definido";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0 space-y-1">
    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
    <div className="break-words text-sm font-semibold text-foreground">{children}</div>
  </div>;
}

export function WorkItemReadonlyDetails({ item, employees }: { item: WorkItem; employees: WorkEmployee[] }) {
  const customer = item.customer;
  const document = customer?.cnpj ? formatCnpj(customer.cnpj) : customer?.document ? formatCpf(customer.document) : "";
  const phone = customer?.whatsapp || customer?.phone;
  const owners = (item.assigned_employee_ids || []).map(id => employees.find(employee => employee.id === id)?.full_name)
    .filter(Boolean) as string[];
  return <div className="space-y-4">
    <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
      <CheckCircle2 size={21} className="mt-0.5 shrink-0 text-emerald-600" />
      <div>
        <p className="text-sm font-bold text-foreground">{item.status === "completed" ? "Atividade concluída" : "Atividade encerrada"}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Este registro está finalizado. Os detalhes, o checklist e o histórico permanecem disponíveis para consulta.</p>
      </div>
    </div>
    {customer && <div className="rounded-lg border border-border p-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-bold text-primary"><UserRound size={15} /> Cliente vinculado</p>
      <div className="text-sm font-semibold">{customer.trade_name || customer.full_name}</div>
      {(document || phone) && <p className="mt-1 break-words text-xs text-muted-foreground">{[document, phone ? formatPhone(phone) : ""].filter(Boolean).join(" · ")}</p>}
    </div>}
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{item.kind === "commitment" ? "Compromisso" : "Tarefa"}</p>
      <h3 className="text-lg font-black leading-snug text-foreground">{item.title}</h3>
      {item.description && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{item.description}</p>}
    </div>
    <div className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
      <Detail label="Andamento"><span className="inline-flex items-center gap-1.5"><ClipboardList size={14} className="text-primary" />{statusLabel[item.status]}</span></Detail>
      <Detail label="Prioridade"><span className="inline-flex items-center gap-1.5"><Flag size={14} className="text-primary" />{priorityLabel[item.priority]}</span></Detail>
      <Detail label="Data de início"><span className="inline-flex items-center gap-1.5"><CalendarClock size={14} className="text-muted-foreground" />{dateText(item.starts_at)}</span></Detail>
      <Detail label="Prazo / término"><span className="inline-flex items-center gap-1.5"><CalendarClock size={14} className="text-muted-foreground" />{dateText(item.due_at)}</span></Detail>
      {item.kind === "commitment" && <Detail label="Resultado">{item.outcome ? outcomeLabel[item.outcome] : "Não informado"}</Detail>}
      {item.category && <Detail label="Categoria">{item.category}</Detail>}
      {item.service_order && <Detail label="OS vinculada">OS {item.service_order.os_number}</Detail>}
      <Detail label="Finalizada em">{dateText(item.completed_at)}</Detail>
    </div>
    <div className="rounded-lg border border-border p-3">
      <p className="flex items-center gap-2 text-xs font-bold text-primary"><Users size={15} /> Responsáveis</p>
      <p className="mt-2 text-sm text-foreground">{owners.length ? owners.join(", ") : "Nenhum responsável designado"}</p>
    </div>
  </div>;
}
