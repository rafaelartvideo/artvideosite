import { useAuth } from "@/lib/auth";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { TechnicianAvailabilityCalendar } from "@/features/appointments/presentation/TechnicianAvailabilityCalendar";
import { dayKey } from "@/features/appointments/application/agenda-calendar";

export function OrderTechnicianAgenda({ form, employees, technicianIds, onTechniciansChange, onFieldChange, canAssign, editingOrderId }: {
  form: any;
  employees: any[];
  technicianIds: string[];
  onTechniciansChange: (ids: string[]) => void;
  onFieldChange: (field: string, value: any) => void;
  canAssign: boolean;
  editingOrderId?: string | null;
}) {
  const { activeOrganizationId } = useAuth();
  const selectedTechnicianId = technicianIds[0] || "";
  const selectedNames = technicianIds.map(id => employees.find(item => item.id === id)?.full_name || "Técnico");
  const date = String(form.scheduled_at || "").slice(0, 10) || dayKey(new Date());
  const start = String(form.scheduled_at || "").slice(11, 16);
  const end = String(form.scheduled_end_at || "").slice(11, 16);

  return <div className="col-span-full min-w-0 space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-sm font-bold text-foreground">Agendamento da OS</p>
        <p className="text-xs text-muted-foreground">Selecione um horário e marque todos os técnicos que trabalharão juntos na mesma OS.</p>
      </div>
      <div className="w-full sm:w-[190px]">
        <FInput label="Ir para a data" type="date" min={dayKey(new Date())} value={date}
          onChange={(event: any) => {
            const nextDate = event.target.value;
            if (!nextDate) return;
            onFieldChange("scheduled_at", nextDate + "T");
            onFieldChange("scheduled_end_at", "");
            if (canAssign) onTechniciansChange([]);
          }} />
      </div>
    </div>
    <TechnicianAvailabilityCalendar
      organizationId={activeOrganizationId || ""}
      technicians={employees}
      date={date}
      selectedStart={start}
      selectedEnd={end}
      selectedTechnicianId={selectedTechnicianId}
      selectedTechnicianIds={technicianIds}
      onToggleTechnician={canAssign ? employeeId => {
        onTechniciansChange(technicianIds.includes(employeeId)
          ? technicianIds.filter(id => id !== employeeId)
          : [...technicianIds, employeeId]);
      } : undefined}
      exceptOrderId={editingOrderId}
      onChooseStart={canAssign ? (nextDate, time, employeeId) => {
        onTechniciansChange([employeeId]);
        onFieldChange("scheduled_at", nextDate + "T" + time);
        onFieldChange("scheduled_end_at", "");
      } : undefined}
      onChooseEnd={canAssign ? (nextDate, time) => {
        onFieldChange("scheduled_end_at", nextDate + "T" + time);
      } : undefined}
    />
    {start && technicianIds.length > 0 && <div className="space-y-1 text-xs text-primary">
      <p className="font-semibold">
        {technicianIds.length} técnico{technicianIds.length === 1 ? "" : "s"} · {date.split("-").reverse().join("/")} · {start}{end ? " às " + end : " — escolha o término"}
      </p>
      <p className="break-words text-muted-foreground">{selectedNames.join(", ")}</p>
    </div>}
    {!canAssign && <p className="text-xs text-amber-700">Sem permissão para alterar o técnico responsável.</p>}
  </div>;
}
