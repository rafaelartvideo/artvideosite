import { useState, type Dispatch, type SetStateAction } from "react";
import { FInput, FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminSegmentedControl, Section } from "@/shared/ui/admin/AdminLayout";
import { EmployeeMultiSelect } from "./OrderFormControls";
import { OrderServiceScheduleDraftDialog, type ServiceScheduleDraft } from "./OrderServiceScheduleDraftDialog";
import { useAuth } from "@/lib/auth";

function localOrderTimeToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return "";
  const date = new Date(value + ":00-03:00");
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function isoToLocalOrderTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (part: string) => parts.find(item => item.type === part)?.value || "";
  return get("year") + "-" + get("month") + "-" + get("day")
    + "T" + get("hour") + ":" + get("minute");
}

export function OrderInformationSection({
  form,
  editingOrder,
  serviceTypes,
  serviceTypeSituations,
  employees,
  employeesLoading = false,
  selectedTechnicianIds,
  selectedSellerIds,
  canAssign,
  situations,
  needsScheduling,
  setNeedsScheduling,
  hasAccessories,
  setHasAccessories,
  onFieldChange,
  onTechniciansChange,
  onSellersChange,
  getSituations,
  getSla,
}: {
  form: any;
  editingOrder: any;
  serviceTypes: any[];
  serviceTypeSituations: any[];
  employees: any[];
  employeesLoading?: boolean;
  selectedTechnicianIds: string[];
  selectedSellerIds: string[];
  canAssign: boolean;
  situations: any[];
  needsScheduling: boolean;
  setNeedsScheduling: Dispatch<SetStateAction<boolean>>;
  hasAccessories: boolean;
  setHasAccessories: Dispatch<SetStateAction<boolean>>;
  onFieldChange: (field: string, value: any) => void;
  onTechniciansChange: Dispatch<SetStateAction<string[]>>;
  onSellersChange: Dispatch<SetStateAction<string[]>>;
  getSituations: (
    serviceTypeId: string,
    situationId?: string,
    situation?: any,
  ) => any[];
  getSla: (
    serviceTypeId?: string,
    situationId?: string,
  ) => { hours: number; isDefault: boolean } | null;
}) {
  const editingOS = editingOrder;
  const { activeOrganizationId } = useAuth();
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const scheduleStart = String(form.scheduled_at || "");
  const scheduleEnd = String(form.scheduled_end_at || "");
  const validSchedule = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduleStart)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduleEnd)
    && scheduleEnd > scheduleStart
    && scheduleStart.slice(0, 10) === scheduleEnd.slice(0, 10);
  const draftStart = validSchedule ? localOrderTimeToIso(scheduleStart) : "";
  const draftEnd = validSchedule ? localOrderTimeToIso(scheduleEnd) : "";
  const existingSchedule: ServiceScheduleDraft | null = draftStart && draftEnd
    ? { startAt: draftStart, endAt: draftEnd, technicianIds: selectedTechnicianIds }
    : null;
  const closeSchedule = () => {
    setScheduleDialogOpen(false);
    // Cancelar a primeira seleção não deve deixar o formulário exigindo um horário inexistente.
    if (!validSchedule) setNeedsScheduling(false);
  };
  const confirmSchedule = (selection: ServiceScheduleDraft) => {
    onTechniciansChange(selection.technicianIds);
    onFieldChange("scheduled_at", isoToLocalOrderTime(selection.startAt));
    onFieldChange("scheduled_end_at", isoToLocalOrderTime(selection.endAt));
    setNeedsScheduling(true);
    setScheduleDialogOpen(false);
  };
  const upF = onFieldChange;
  const setSelectedTechnicianIds = onTechniciansChange;
  const setSelectedSellerIds = onSellersChange;
  const getSituationsForType = getSituations;
  const getSlaForOrder = getSla;
  const hasPermission = (permission: string) =>
    permission === "orders.assign" && canAssign;
  return (
<Section title="Informações da OS">
              <div className="grid sm:grid-cols-2 gap-4">
                <FSelect label="Tipo de atendimento" required={!editingOS} value={form.service_type_id} onChange={(e: any) => { const serviceTypeId = e.target.value; upF("service_type_id", serviceTypeId); const links = serviceTypeSituations.filter(link => link.service_type_id === serviceTypeId); if (form.situation_id && links.length > 0 && !links.some(link => link.situation_id === form.situation_id)) upF("situation_id", ""); }} options={[{ value: "", label: "Selecionar tipo..." }, ...serviceTypes.map(type => ({ value: type.id, label: type.title }))]} />
                <div><FSelect label="Situação" required value={form.situation_id} onChange={(e: any) => upF("situation_id", e.target.value)} options={[{ value: "", label: "Selecionar situação..." }, ...getSituationsForType(form.service_type_id, editingOS?.situation_id, editingOS?.situation).map(s => ({ value: s.id, label: s.name }))]} />{(() => { const sla = getSlaForOrder(form.service_type_id, form.situation_id); return sla ? <p className="mt-1 text-xs font-semibold text-[#5a6a82]">SLA desta situação: {sla.hours} horas ({sla.isDefault ? "padrão" : "personalizado"})</p> : null; })()}</div>
                {!editingOS && !needsScheduling && <EmployeeMultiSelect label="Técnicos" employees={employees} loading={employeesLoading} selectedIds={selectedTechnicianIds} onChange={setSelectedTechnicianIds} disabled={!hasPermission("orders.assign")} placeholder="Selecionar técnicos" clearLabel="Limpar Técnicos" />}
                <EmployeeMultiSelect label="Vendedores" employees={employees} loading={employeesLoading} selectedIds={selectedSellerIds} onChange={setSelectedSellerIds} disabled={!hasPermission("orders.assign")} placeholder="Selecionar vendedores" clearLabel="Limpar Vendedores" />
                <FSelect label="Prioridade" value={form.priority} onChange={(e: any) => upF("priority", e.target.value)} options={[{ value: "baixa", label: "Baixa" }, { value: "normal", label: "Normal" }, { value: "alta", label: "Alta" }, { value: "urgente", label: "Urgente" }]} />
                <FInput label="OS Externa" type="text" value={form.external_os_number} onChange={(e: any) => upF("external_os_number", e.target.value)} placeholder="Digite o número da OS externa" />
                <div className="col-span-full space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">Necessita agendamento</label>
                    <AdminSegmentedControl
                      value={needsScheduling ? "yes" : "no"}
                      onChange={value => {
                        const scheduling = value === "yes";
                        setNeedsScheduling(scheduling);
                        if (scheduling) {
                          if (canAssign) setScheduleDialogOpen(true);
                        } else {
                          setScheduleDialogOpen(false);
                          upF("scheduled_at", "");
                          upF("scheduled_end_at", "");
                        }
                      }}
                      options={[{ value: "yes", label: "Sim" }, { value: "no", label: "Não" }]}
                      className="w-fit grid-cols-2"
                    />
                  </div>
                  {needsScheduling && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-3">
                    <div className="min-w-0">
                      {validSchedule
                        ? <>
                            <p className="text-sm font-semibold text-foreground">
                              {scheduleStart.slice(8, 10)}/{scheduleStart.slice(5, 7)}/{scheduleStart.slice(0, 4)} · {scheduleStart.slice(11, 16)} às {scheduleEnd.slice(11, 16)}
                            </p>
                            <p className="mt-1 break-words text-xs text-muted-foreground">
                              {selectedTechnicianIds.length} técnico{selectedTechnicianIds.length === 1 ? "" : "s"} · {selectedTechnicianIds.map(id => employees.find(person => person.id === id)?.full_name || "Técnico").join(", ")}
                            </p>
                          </>
                        : <>
                            <p className="text-sm font-semibold text-foreground">Horário ainda não escolhido</p>
                            <p className="mt-1 text-xs text-muted-foreground">Selecione uma data e os técnicos disponíveis.</p>
                          </>}
                    </div>
                    <button type="button"
                      disabled={!canAssign || employeesLoading}
                      onClick={() => setScheduleDialogOpen(true)}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50">
                      {validSchedule ? "Reagendar" : "Escolher horário"}
                    </button>
                  </div>}
                  <OrderServiceScheduleDraftDialog
                    open={scheduleDialogOpen && needsScheduling && canAssign}
                    organizationId={activeOrganizationId || ""}
                    orderId={editingOS?.id || ""}
                    title={editingOS ? "OS #" + (editingOS.os_number || "") : "Nova ordem de serviço"}
                    dialogTitle={validSchedule ? "Reagendar OS" : "Agendar OS"}
                    technicians={employees.filter(person => person.is_active !== false).map(person => ({ id: person.id, name: String(person.full_name || "Técnico") }))}
                    loadingTechnicians={employeesLoading}
                    initial={existingSchedule}
                    lockedTechnicianIds={editingOS ? selectedTechnicianIds : undefined}
                    onConfirm={confirmSchedule}
                    onClose={closeSchedule}
                  />
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">Possui acessórios?</label>
                    <AdminSegmentedControl
                      value={hasAccessories ? "yes" : "no"}
                      onChange={value => { const nextHasAccessories = value === "yes"; setHasAccessories(nextHasAccessories); if (!nextHasAccessories) upF("accessories", ""); }}
                      options={[{ value: "yes", label: "Sim" }, { value: "no", label: "Não" }]}
                      className="w-fit grid-cols-2"
                    />
                  </div>
                  {hasAccessories && (
                    <FInput
                      label="Acessórios"
                      type="text"
                      required
                      value={form.accessories}
                      onChange={(e: any) => upF("accessories", e.target.value)}
                      placeholder="Descreva os acessórios"
                    />
                  )}
                </div>
              </div>
              <div className="mt-4 space-y-4">
                <FTextarea label="Descrição do problema" value={form.customer_notes} onChange={(e: any) => upF("customer_notes", e.target.value)} rows={4} />
                <FTextarea label="Observações internas" value={form.internal_notes} onChange={(e: any) => upF("internal_notes", e.target.value)} rows={3} />
              </div>
            </Section>
  );
}
