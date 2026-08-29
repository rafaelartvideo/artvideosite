import { Plus } from "lucide-react";
import {
  BtnPrimary,
  FInput,
  FSelect,
  FTextarea,
  Section,
} from "@/app/admin/shared";

export function OrderEquipmentSection({
  form,
  equipmentTypes,
  equipmentBrands,
  equipmentModels,
  editing,
  canCreate,
  onFieldChange,
  onCreateEquipment,
}: {
  form: any;
  equipmentTypes: any[];
  equipmentBrands: any[];
  equipmentModels: any[];
  editing: boolean;
  canCreate: boolean;
  onFieldChange: (field: string, value: any) => void;
  onCreateEquipment: () => void;
}) {
  const editingOS = editing;
  const hasPermission = (permission: string) =>
    permission === "equipment.create" && canCreate;
  const setQuickEquipment = (open: boolean) => {
    if (open) onCreateEquipment();
  };
  const upF = onFieldChange;
  return (
<Section title="Equipamento">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 flex items-end gap-2"><div className="flex-1"><FSelect label="Tipo de equipamento" value={form.equipment_type_id} onChange={(e: any) => { upF("equipment_type_id", e.target.value); upF("equipment_brand_id", ""); upF("equipment_model_id", ""); }} options={[{ value: "", label: "Selecionar equipamento..." }, ...equipmentTypes.map(type => ({ value: type.id, label: type.name }))]} /></div>{!editingOS && hasPermission("equipment.create") && <BtnPrimary className="h-[42px]" onClick={() => setQuickEquipment(true)}><Plus size={15} /> Criar equipamento</BtnPrimary>}</div>
                <FSelect label="Marca técnica" value={form.equipment_brand_id} disabled={!form.equipment_type_id} onChange={(e: any) => { upF("equipment_brand_id", e.target.value); upF("equipment_model_id", ""); }} options={[{ value: "", label: form.equipment_type_id ? "Selecionar marca..." : "Selecione o tipo primeiro" }, ...equipmentBrands.filter(brand => brand.equipment_type_id === form.equipment_type_id).map(brand => ({ value: brand.id, label: brand.name }))]} />
                <FSelect label="Modelo" value={form.equipment_model_id} disabled={!form.equipment_brand_id} onChange={(e: any) => upF("equipment_model_id", e.target.value)} options={[{ value: "", label: form.equipment_brand_id ? "Selecionar modelo..." : "Selecione a marca primeiro" }, ...equipmentModels.filter(model => model.equipment_brand_id === form.equipment_brand_id).map(model => ({ value: model.id, label: model.name }))]} />
                <FInput label="Versão" value={form.model} onChange={(e: any) => upF("model", e.target.value)} />
                <FInput label="Nº de série" value={form.serial_number} disabled={Boolean(editingOS)} onChange={(e: any) => upF("serial_number", e.target.value)} />
                <FInput label="Lacre / garantia" value={form.accessories} onChange={(e: any) => upF("accessories", e.target.value)} />
                <div className="sm:col-span-2"><FTextarea label="Observações do equipamento" value={form.equipment_condition} onChange={(e: any) => upF("equipment_condition", e.target.value)} rows={3} /></div>
              </div>
            </Section>
  );
}
