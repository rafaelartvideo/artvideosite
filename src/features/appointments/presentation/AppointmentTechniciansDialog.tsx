import { useState } from "react";
import { AdminDialog, BtnPrimary } from "@/shared/ui/admin/AdminLayout";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { Checkbox } from "@/shared/ui/primitives/checkbox";

type Technician = { id: string; full_name: string };

type Props = {
  technicians: Technician[];
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  onClose: () => void;
};

export function AppointmentTechniciansDialog({ technicians, selectedIds, onSelectedIdsChange, onClose }: Props) {
  const [search, setSearch] = useState("");
  const filteredTechnicians = technicians.filter(technician =>
    technician.full_name.toLowerCase().includes(search.toLowerCase()),
  );
  const toggleTechnician = (id: string) => {
    onSelectedIdsChange(selectedIds.includes(id) ? selectedIds.filter(item => item !== id) : [...selectedIds, id]);
  };

  return <AdminDialog
    open
    onClose={onClose}
    title="Selecionar técnicos"
    description="Escolha os técnicos responsáveis pelo atendimento."
    minimizedDescription={selectedIds.length ? `${selectedIds.length} técnico${selectedIds.length === 1 ? "" : "s"} selecionado${selectedIds.length === 1 ? "" : "s"}` : "Nenhum técnico selecionado"}
    className="max-w-lg"
    footer={<div className="flex justify-end"><BtnPrimary onClick={onClose}>Confirmar</BtnPrimary></div>}
  >
    <FInput label="Buscar" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome do técnico" />
    <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
      {filteredTechnicians.map(technician => <label key={technician.id} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-[#f8fafc]">
        <Checkbox checked={selectedIds.includes(technician.id)} onCheckedChange={() => toggleTechnician(technician.id)} />
        {technician.full_name}
      </label>)}
    </div>

  </AdminDialog>;
}
