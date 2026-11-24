import { useMemo, useRef, useState } from "react";
import type { RuleSet } from "../domain/order-rules";
import { Plus, Tag, ScanLine } from "lucide-react";
import { AdminButton, AdminDialog, BtnPrimary, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { readSerialCodes } from "../domain/read-serial-code";
import { CatalogCombobox } from "./OrderQuickCreateModals";
import type { EquipmentTypeTechnicalField, ServiceOrderTechnicalValue } from "@/features/equipment/domain/equipment";
import { NewOrderEntryChecklist } from "@/features/checklists/presentation/NewOrderEntryChecklist";
import { DeviceCaptureBridge } from "./DeviceCaptureBridge";
import { isMobileDeviceType, OrderDeviceUnlockEditor } from "./OrderDeviceUnlockField";
import { OrderImageDownloadMenu, OrderImagesField, type OrderImage } from "./OrderImages";
import type { OrderImageKind } from "../domain/order-image";

export function OrderEquipmentSection({
  intakeMode = false,
  disposalMode = false,
  form,
  rules,
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
  canAddImages,
  canRemoveImages,
  showImages,
  unlockCanManage,
  unlockCanView,
  onUnlockUpdate,
  orderId,
}: {
  intakeMode?: boolean;
  disposalMode?: boolean;
  form: any;
  rules: RuleSet;
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
  onAddImages: (files: FileList | File[] | null, kind?: Exclude<OrderImageKind, "solution">) => void;
  onRemoveImage: (key: string) => void;
  onViewImage?: (image: OrderImage) => void;
  canAddImages: boolean;
  canRemoveImages: boolean | ((image: OrderImage) => boolean);
  showImages: boolean;
  unlockCanManage: boolean;
  unlockCanView: boolean;
  onUnlockUpdate: (patch: Record<string, unknown>) => void;
  orderId?: string;
}) {
  const scannerInput = useRef<HTMLInputElement>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanValues, setScanValues] = useState<string[]>([]);
  const [scanValue, setScanValue] = useState("");
  const scanGeneration = useRef(0);

  const closeScanner = () => {
    scanGeneration.current += 1;
    setScanOpen(false);
    setScanBusy(false);
  };

  const readSerialCode = async (file?: File) => {
    if (!file || editing) return;
    const generation = ++scanGeneration.current;
    setScanOpen(true);
    setScanBusy(true);
    setScanError("");
    setScanValues([]);
    setScanValue("");
    try {
      const values = await readSerialCodes(file);
      if (generation !== scanGeneration.current) return;
      setScanValues(values);
      setScanValue(values[0]);
    } catch (error) {
      if (generation === scanGeneration.current) setScanError(error instanceof Error ? error.message : "Não foi possível ler o código.");
    } finally {
      if (generation === scanGeneration.current) setScanBusy(false);
    }
  };

  const editingOS = editing;
  const hasPermission = (permission: string) => permission === "equipment.create" && canCreate;
  const setQuickEquipment = (open: boolean) => {
    if (open) onCreateEquipment();
  };
  const upF = (field:string,value:any)=>{onFieldChange(field,value);if(field==="serial_number"){const relation=technicalFields.find(r=>r.technical_field?.field_key==="numero_serie");if(relation)onTechnicalValueChange(relation.technical_field_id,String(value||""));}};
  // All options are already loaded by the order editor; typing only filters memory.
  const typeOptions = useMemo(() => equipmentTypes.map(type => ({ id: type.id, name: type.name })), [equipmentTypes]);
  const brandOptions = useMemo(() => equipmentBrands.filter(brand => brand.equipment_type_id === form.equipment_type_id)
    .map(brand => ({ id: brand.id, name: brand.name })), [equipmentBrands, form.equipment_type_id]);
  const modelOptions = useMemo(() => equipmentModels.filter(model => model.equipment_brand_id === form.equipment_brand_id)
    .map(model => ({ id: model.id, name: model.name })), [equipmentModels, form.equipment_brand_id]);
  const historicalFields = technicalHistory
    .filter(value => !technicalFields.some(field => field.technical_field_id === value.technical_field_id))
    .map(value => ({
      technical_field_id: value.technical_field_id,
      required: false,
      sort_order: 0,
      technical_field: {
        id: value.technical_field_id,
        field_key: value.field_key_snapshot,
        label: value.label_snapshot,
        field_type: value.field_type_snapshot,
        is_active: false,
        sort_order: 0,
      },
    }));
  const displayedTechnicalFields = (disposalMode ? [] : [...technicalFields, ...historicalFields])
    .filter(relation => relation.technical_field?.field_key !== "numero_serie")
    .sort((first, second) => first.sort_order - second.sort_order);
  // Mostrar a série apenas para equipamentos com campo extra; preservar dados históricos.
  const showSerial = intakeMode || disposalMode || (technicalFields.some(relation =>
    relation.technical_field?.field_key === "numero_serie"
      && relation.technical_field?.is_active !== false
  ) || Boolean(editingOS && String(form.serial_number || "").trim()))
    && (rules.fields.serial_number?.mode !== "hidden" || Boolean(editingOS && form.serial_number));
  const showDeviceUnlock = !disposalMode && isMobileDeviceType(equipmentTypes.find(type => type.id === form.equipment_type_id)?.name)
    && (unlockCanManage || unlockCanView);
  const extraFieldCount = (showSerial ? 1 : 0) + displayedTechnicalFields.length;
  // Um campo sozinho, ou o último sem par, deve ocupar toda a largura da linha.
  const extraFieldSpanClass = (index: number) => extraFieldCount % 2 === 1 && index === extraFieldCount - 1 ? "sm:col-span-2" : "";
  const labelImages = images.filter(image => image.kind === "label");
  const otherImages = images.filter(image => image.kind !== "label");

  return (
    <Section
      title="Equipamento"
      actions={!editingOS && showImages && canAddImages ? (
        <div className="hidden md:block">
          <DeviceCaptureBridge
            onSerial={value => { if (showSerial) upF("serial_number", value); }}
            onPhoto={(file, kind) => onAddImages([file], kind)}
          />
        </div>
      ) : undefined}
    >
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={(!disposalMode&&rules.fields.equipment_type_id?.mode==="hidden"&&!editingOS?"hidden ":"")+"flex min-w-0 items-end gap-2 sm:col-span-2"}>
          <div className="min-w-0 flex-1">
            <CatalogCombobox
              label="Tipo de equipamento"
              required={intakeMode||disposalMode}
              selectionOnly
              allowCreate={false}
              value={typeOptions.find(type => type.id === form.equipment_type_id)?.name || ""}
              selectedId={form.equipment_type_id || ""}
              options={typeOptions}
              placeholder="Digite ou selecione o equipamento..."
              emptyText="Nenhum equipamento encontrado."
              onChange={() => {}}
              onSelect={option => {
                const id = option?.id || "";
                if (id === (form.equipment_type_id || "")) return;
                upF("equipment_type_id", id);
                upF("equipment_brand_id", "");
                upF("equipment_model_id", "");
                upF("technicalValues", {});
                onUnlockUpdate({ unlock_type: "none", unlock_value: "", unlock_dirty: false, unlock_has_existing: false });
              }}
            />
          </div>

          {!editingOS && hasPermission("equipment.create") && (
            <BtnPrimary
              className="h-[42px] w-[42px] shrink-0 justify-center !p-0 sm:w-auto sm:!px-4"
              onClick={() => setQuickEquipment(true)}
              aria-label="Criar equipamento"
              title="Criar equipamento"
            >
              <Plus size={22} className="!h-[22px] !w-[22px] shrink-0" />
              <span className="hidden sm:inline">Criar equipamento</span>
            </BtnPrimary>
          )}
        </div>

        <div className={(!disposalMode&&rules.fields.equipment_brand_id?.mode==="hidden"&&!editingOS?"hidden ":"")+"min-w-0"}>
          <CatalogCombobox
            key={form.equipment_type_id || "no-type"}
            label="Marca"
            required={intakeMode||!editingOS&&rules.fields.equipment_brand_id?.mode==="required"&&rules.fields.equipment_brand_id?.stage==="create"}
            selectionOnly
            allowCreate={false}
            value={brandOptions.find(brand => brand.id === form.equipment_brand_id)?.name || ""}
            selectedId={form.equipment_brand_id || ""}
            options={brandOptions}
            disabled={!form.equipment_type_id}
            placeholder={form.equipment_type_id ? "Digite ou selecione a marca..." : "Selecione o tipo primeiro"}
            emptyText="Nenhuma marca encontrada para este equipamento."
            onChange={() => {}}
            onSelect={option => {
              const id = option?.id || "";
              if (id === (form.equipment_brand_id || "")) return;
              upF("equipment_brand_id", id);
              upF("equipment_model_id", "");
            }}
          />
        </div>

        <div className={(!disposalMode&&rules.fields.equipment_model_id?.mode==="hidden"&&!editingOS?"hidden ":"")+"min-w-0"}>
          <CatalogCombobox
            key={form.equipment_brand_id || "no-brand"}
            label="Modelo"
            required={intakeMode||!editingOS&&rules.fields.equipment_model_id?.mode==="required"&&rules.fields.equipment_model_id?.stage==="create"}
            selectionOnly
            allowCreate={false}
            value={modelOptions.find(model => model.id === form.equipment_model_id)?.name || ""}
            selectedId={form.equipment_model_id || ""}
            options={modelOptions}
            disabled={!form.equipment_brand_id}
            placeholder={form.equipment_brand_id ? "Digite ou selecione o modelo..." : "Selecione a marca primeiro"}
            emptyText="Nenhum modelo encontrado para esta marca."
            onChange={() => {}}
            onSelect={option => upF("equipment_model_id", option?.id || "")}
          />
        </div>

        {extraFieldCount > 0 && <div className="grid min-w-0 w-full grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
        {showSerial && <div className={`flex min-w-0 w-full items-end gap-2 ${extraFieldSpanClass(0)}`}>
          <div className="min-w-0 w-full flex-1">
            <FInput
              label="NÚMERO DE SÉRIE"
              required={intakeMode||!disposalMode&&!editingOS&&rules.fields.serial_number?.mode==="required"&&rules.fields.serial_number?.stage==="create"}
              className="w-full"
              type="text"
              value={form.serial_number || ""}
              disabled={editingOS}
              onChange={(e: any) => upF("serial_number", e.target.value)}
              placeholder="Digite o número de série do equipamento"
            />
          </div>

          {!editingOS && (
            <AdminButton
              variant="secondary"
              onClick={() => scannerInput.current?.click()}
              aria-label="Escanear número de série"
              title="Escanear número de série"
              className="h-[42px] w-[42px] shrink-0 !p-0"
            >
              <ScanLine size={22} className="!h-[22px] !w-[22px] shrink-0" />
            </AdminButton>
          )}

          <input
            ref={scannerInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              void readSerialCode(file);
            }}
          />

          <AdminDialog
            open={scanOpen}
            onClose={closeScanner}
            title="Escanear número de série"
            description="Confira se o código corresponde à série, e não ao modelo ou a um endereço da etiqueta."
          >
            {scanBusy && <p role="status">Lendo código da foto...</p>}
            {scanError && <p role="alert" className="text-sm text-red-700">{scanError}</p>}
            {!scanBusy && scanValues.length > 1 && (
              <FSelect
                label="Códigos encontrados"
                value={scanValue}
                onChange={(event: any) => setScanValue(event.target.value)}
                options={scanValues.map(value => ({ value, label: value }))}
              />
            )}
            {!scanBusy && scanValues.length > 0 && (
              <FInput
                label="Número de série lido"
                value={scanValue}
                onChange={(event: any) => setScanValue(event.target.value)}
              />
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <AdminButton variant="secondary" onClick={closeScanner}>Cancelar</AdminButton>
              <AdminButton variant="secondary" disabled={scanBusy} onClick={() => scannerInput.current?.click()}>Outra foto</AdminButton>
              <AdminButton
                disabled={scanBusy || !scanValue.trim() || editingOS}
                onClick={() => {
                  upF("serial_number", scanValue.trim());
                  closeScanner();
                }}
              >
                Usar número
              </AdminButton>
            </div>
          </AdminDialog>
        </div>}
        {displayedTechnicalFields.map((relation, index) => {
          const field = relation.technical_field;
          if (!field) return null;
          const isCurrentField = technicalFields.some(item => item.technical_field_id === relation.technical_field_id);
          return (
            <div key={relation.technical_field_id} className={`min-w-0 w-full ${extraFieldSpanClass((showSerial ? 1 : 0) + index)}`}>
              <FInput
                label={field.label}
                className="w-full"
                required={intakeMode||relation.required}
                type="text"
                inputMode={field.field_type==="number"?"decimal":undefined}
                value={technicalValues[relation.technical_field_id] || ""}
                disabled={!isCurrentField}
                onChange={(e: any) => onTechnicalValueChange(relation.technical_field_id, e.target.value)}
              />
            </div>
          );
        })}
        </div>}

        {showDeviceUnlock && (
          <div className="min-w-0 w-full sm:col-span-2">
            <OrderDeviceUnlockEditor
              type={form.unlock_type || "none"}
              value={form.unlock_value || ""}
              existing={Boolean(form.unlock_has_existing)}
              editing={editing}
              orderId={editing ? orderId : undefined}
              canManage={unlockCanManage}
              canView={unlockCanView}
              onUpdate={onUnlockUpdate}
            />
          </div>
        )}

        {showImages && (
          <div className="min-w-0 border-t border-border pt-4 sm:col-span-2">
            <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-[#0d1b2e]">{intakeMode?"Fotos":"Fotos do equipamento"}</p>

            <div className="grid min-w-0 grid-cols-1 items-stretch gap-3 md:grid-cols-2">
              <div className={(rules.photos.label?.mode==="hidden"&&!labelImages.length?"hidden ":"")+"h-full min-w-0 overflow-hidden rounded-xl border border-[#0057e7]/30 bg-primary-soft/70 p-3 shadow-sm shadow-[#0057e7]/5"}>
                <div className="mb-3 flex items-start justify-between gap-2 md:min-h-[74px]">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0057e7] text-white"><Tag size={16} /></span>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-[#0057e7]">Foto da etiqueta{!editingOS&&rules.photos.label?.mode==="required"&&rules.photos.label?.stage==="create"&&<span className="ml-1 text-red-600">*</span>}</p>
                      <p className="mt-0.5 text-xs leading-5 text-[#5a6a82]">{editingOS?"Priorize uma foto nítida da etiqueta de identificação do equipamento.":rules.photos.label?.mode==="required"?(rules.photos.label.stage==="create"?"Obrigatória para criar a OS.":"Obrigatória ao "+(rules.photos.label.stage==="start"?"iniciar":"concluir")+" a OS."):"Opcional para esta empresa."}</p>
                    </div>
                  </div>
                  <OrderImageDownloadMenu images={labelImages} label="foto da etiqueta" />
                </div>
                <OrderImagesField
                  embedded
                  images={labelImages}
                  totalCount={images.length}
                  onAdd={files => onAddImages(files, "label")}
                  onRemove={onRemoveImage}
                  onView={onViewImage}
                  canAdd={canAddImages}
                  canRemove={canRemoveImages}
                />
              </div>

              <div className={(rules.photos.equipment?.mode==="hidden"&&!otherImages.length?"hidden ":"")+"h-full min-w-0 overflow-hidden rounded-xl border border-border bg-white p-3"}>
                <div className="mb-3 flex items-start justify-between gap-2 md:min-h-[74px]">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-[#0d1b2e]">{intakeMode?"Fotos do defeito":"Fotos do equipamento"}</p>
                    <p className="mt-0.5 text-xs leading-5 text-[#5a6a82]">{intakeMode?"Confira as fotos do defeito ou da parte afetada enviadas pelo cliente.":"Registre o estado geral, detalhes, avarias e outros pontos importantes."}</p>
                  </div>
                  <OrderImageDownloadMenu images={otherImages} label={intakeMode?"fotos do defeito":"fotos do equipamento"} />
                </div>
                <OrderImagesField
                  embedded
                  images={otherImages}
                  totalCount={images.length}
                  onAdd={files => onAddImages(files, "equipment")}
                  onRemove={onRemoveImage}
                  onView={onViewImage}
                  canAdd={canAddImages}
                  canRemove={canRemoveImages}
                />
              </div>
            </div>
          </div>
        )}

        {!editingOS && <NewOrderEntryChecklist equipmentTypeId={form.equipment_type_id} />}
      </div>
    </Section>
  );
}
