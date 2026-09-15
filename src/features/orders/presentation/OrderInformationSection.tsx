import type { Dispatch, SetStateAction } from "react";
import { FInput, FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminSegmentedControl, Section } from "@/shared/ui/admin/AdminLayout";
import { EmployeeMultiSelect } from "./OrderFormControls";

export function OrderInformationSection({
  form,
  editingOrder,
  serviceTypes,
  serviceTypeSituations,
  generalServices,
  employees,
  selectedTechnicianIds,
  selectedSellerIds,
  canAssign,
  situations,
  needsScheduling,
  setNeedsScheduling,
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
  generalServices: any[];
  employees: any[];
  selectedTechnicianIds: string[];
  selectedSellerIds: string[];
  canAssign: boolean;
  situations: any[];
  needsScheduling: boolean;
  setNeedsScheduling: Dispatch<SetStateAction<boolean>>;
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
                <FSelect label="Serviço" value={form.general_service_id} onChange={(e: any) => upF("general_service_id", e.target.value)} options={[{ value: "", label: "Selecionar serviço..." }, ...generalServices.map(service => ({ value: service.id, label: service.name }))]} />
                <div><FSelect label="Situação" value={form.situation_id} onChange={(e: any) => upF("situation_id", e.target.value)} options={[{ value: "", label: "Selecionar situação..." }, ...getSituationsForType(form.service_type_id, editingOS?.situation_id, editingOS?.situation).map(s => ({ value: s.id, label: s.name }))]} />{(() => { const sla = getSlaForOrder(form.service_type_id, form.situation_id); return sla ? <p className="mt-1 text-xs font-semibold text-[#5a6a82]">SLA desta situação: {sla.hours} horas ({sla.isDefault ? "padrão" : "personalizado"})</p> : null; })()}</div>
                <EmployeeMultiSelect label="Técnicos" employees={employees} selectedIds={selectedTechnicianIds} onChange={setSelectedTechnicianIds} disabled={!hasPermission("orders.assign")} placeholder="Selecionar técnicos" clearLabel="Limpar Técnicos" />
                <EmployeeMultiSelect label="Vendedores" employees={employees} selectedIds={selectedSellerIds} onChange={setSelectedSellerIds} disabled={!hasPermission("orders.assign")} placeholder="Selecionar vendedores" clearLabel="Limpar Vendedores" />
                <FSelect label="Prioridade" value={form.priority} onChange={(e: any) => upF("priority", e.target.value)} options={[{ value: "baixa", label: "Baixa" }, { value: "normal", label: "Normal" }, { value: "alta", label: "Alta" }, { value: "urgente", label: "Urgente" }]} />
                <FInput label="OS Externa" type="text" value={form.external_os_number} onChange={(e: any) => upF("external_os_number", e.target.value)} placeholder="Digite o número da OS externa" />
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">Necessita agendamento</label>
                  <AdminSegmentedControl
                    value={needsScheduling ? "yes" : "no"}
                    onChange={value => { const scheduling = value === "yes"; setNeedsScheduling(scheduling); if (!scheduling) upF("scheduled_at", ""); }}
                    options={[{ value: "yes", label: "Sim" }, { value: "no", label: "Não" }]}
                    className="w-fit grid-cols-2"
                  />
                </div>
                {needsScheduling && <>
                  <FInput label="Data agendada" type="date" required value={form.scheduled_at.slice(0, 10)} onChange={(e: any) => upF("scheduled_at", `${e.target.value}${form.scheduled_at.slice(10) || "T"}`)} />
                  <FInput label="Hora agendada" type="time" required value={form.scheduled_at.slice(11, 16)} onChange={(e: any) => upF("scheduled_at", `${form.scheduled_at.slice(0, 10)}T${e.target.value}`)} />
                </>}
              </div>
              <div className="mt-4 space-y-4">
                <FTextarea label="Descrição do problema" value={form.customer_notes} onChange={(e: any) => upF("customer_notes", e.target.value)} rows={4} />
                <FTextarea label="Observações internas" value={form.internal_notes} onChange={(e: any) => upF("internal_notes", e.target.value)} rows={3} />
              </div>
            </Section>
  );
}
