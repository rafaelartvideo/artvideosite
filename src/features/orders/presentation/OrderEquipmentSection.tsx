import { Plus } from "lucide-react";
import { BtnPrimary, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import type { EquipmentTypeTechnicalField, ServiceOrderTechnicalValue } from "@/features/equipment/domain/equipment";
import { OrderImagesField, type OrderImage } from "./OrderImages";

export function OrderEquipmentSection({
  form,
  equipmentTypes,
  equipmentBrands,
  equipmentModels,
  editing,
  canCreate,
  onFieldChange,
  onCreateEquipment,
  technicalFields,
  technicalValues,
  technicalHistory,
  onTechnicalValueChange,
  images,
  onAddImages,
  onRemoveImage,
  onViewImage,
  canEditImages,
  showImages,
}: {
  form: any;
  equipmentTypes: any[];
  equipmentBrands: any[];
  equipmentModels: any[];
  editing: boolean;
  canCreate: boolean;
  onFieldChange: (field: string, value: any) => void;
  onCreateEquipment: () => void;
  technicalFields: EquipmentTypeTechnicalField[];
  technicalValues: Record<string, string>;
  technicalHistory: ServiceOrderTechnicalValue[];
  onTechnicalValueChange: (fieldId: string, value: string) => void;
  images: OrderImage[];
  onAddImages: (files: FileList | null) => void;
  onRemoveImage: (key: string) => void;
  onViewImage?: (image: OrderImage) => void;
  canEditImages: boolean;
  showImages: boolean;
}) {
  const editingOS = editing;
  const hasPermission = (permission: string) =>
    permission === "equipment.create" && canCreate;
  const setQuickEquipment = (open: boolean) => {
    if (open) onCreateEquipment();
  };
  const upF = onFieldChange;
  const historicalFields = technicalHistory
    .filter(value => !technicalFields.some(field => field.technical_field_id === value.technical_field_id))
    .map(value => ({ technical_field_id: value.technical_field_id, required: false, sort_order: 0, technical_field: { id: value.technical_field_id, field_key: value.field_key_snapshot, label: value.label_snapshot, field_type: value.field_type_snapshot, is_active: false, sort_order: 0 } }));
  const displayedTechnicalFields = [...technicalFields, ...historicalFields].sort((first, second) => first.sort_order - second.sort_order);
  return (
    <Section title="Equipamento">
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 items-end gap-2 sm:col-span-2">
          <div className="min-w-0 flex-1">
            <FSelect
              label="Tipo de equipamento"
              value={form.equipment_type_id}
              onChange={(e: any) => {
                upF("equipment_type_id", e.target.value);
                upF("equipment_brand_id", "");
                upF("equipment_model_id", "");
                upF("technicalValues", {});
              }}
              options={[{ value: "", label: "Selecionar equipamento..." }, ...equipmentTypes.map(type => ({ value: type.id, label: type.name }))]}
            />
          </div>
          {!editingOS && hasPermission("equipment.create") && (
            <BtnPrimary
              className="h-[42px] w-[42px] shrink-0 justify-center p-0 sm:w-auto sm:px-4"
              onClick={() => setQuickEquipment(true)}
              aria-label="Criar equipamento"
              title="Criar equipamento"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Criar equipamento</span>
            </BtnPrimary>
          )}
        </div>

        <div className="min-w-0">
          <FSelect
            label="Marca técnica"
            value={form.equipment_brand_id}
            disabled={!form.equipment_type_id}
            onChange={(e: any) => {
              upF("equipment_brand_id", e.target.value);
              upF("equipment_model_id", "");
            }}
            options={[{ value: "", label: form.equipment_type_id ? "Selecionar marca..." : "Selecione o tipo primeiro" }, ...equipmentBrands.filter(brand => brand.equipment_type_id === form.equipment_type_id).map(brand => ({ value: brand.id, label: brand.name }))]}
          />
        </div>

        <div className="min-w-0">
          <FSelect
            label="Modelo"
            value={form.equipment_model_id}
            disabled={!form.equipment_brand_id}
            onChange={(e: any) => upF("equipment_model_id", e.target.value)}
            options={[{ value: "", label: form.equipment_brand_id ? "Selecionar modelo..." : "Selecione a marca primeiro" }, ...equipmentModels.filter(model => model.equipment_brand_id === form.equipment_brand_id).map(model => ({ value: model.id, label: model.name }))]}
          />
        </div>

        {displayedTechnicalFields.map(relation => {
          const field = relation.technical_field;
          if (!field) return null;
          const isCurrentField = technicalFields.some(item => item.technical_field_id === relation.technical_field_id);
          return (
            <div key={relation.technical_field_id} className="min-w-0">
              <FInput
                label={field.label}
                required={relation.required}
                type={field.field_type === "number" ? "number" : "text"}
                value={technicalValues[relation.technical_field_id] || ""}
                disabled={!isCurrentField}
                onChange={(e: any) => onTechnicalValueChange(relation.technical_field_id, e.target.value)}
              />
            </div>
          );
        })}

        {showImages && (
          <div className="min-w-0 border-t border-[#0d1b2e]/8 pt-4 sm:col-span-2">
            <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-[#0d1b2e]">Fotos do equipamento</p>
            <OrderImagesField
              embedded
              images={images}
              onAdd={onAddImages}
              onRemove={onRemoveImage}
              onView={onViewImage}
              canEdit={canEditImages}
            />
          </div>
        )}
      </div>
    </Section>
  );
}
