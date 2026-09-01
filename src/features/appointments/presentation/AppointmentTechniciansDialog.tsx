import { useState } from "react";
import { X } from "lucide-react";
import { BtnPrimary } from "@/shared/ui/admin/AdminLayout";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/primitives/dialog";

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

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent showClose={false} className="max-w-lg gap-0 rounded-xl bg-white p-5 shadow-2xl">
      <DialogTitle className="sr-only">Selecionar técnicos</DialogTitle>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-black text-[#0d1b2e]">Selecionar Técnicos</h3>
        <button type="button" aria-label="Fechar técnicos" onClick={onClose} className="rounded-full p-2 hover:bg-[#f5f7fa]"><X size={17} /></button>
      </div>
      <FInput label="Buscar" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome do técnico" />
      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
        {filteredTechnicians.map(technician => <label key={technician.id} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-[#f8fafc]">
          <Checkbox checked={selectedIds.includes(technician.id)} onCheckedChange={() => toggleTechnician(technician.id)} />
          {technician.full_name}
        </label>)}
      </div>
      <div className="mt-4 flex justify-end"><BtnPrimary onClick={onClose}>Confirmar</BtnPrimary></div>
    </DialogContent>
  </Dialog>;
}
