import { useRef, useState } from "react";
import { Plus, Tag, ScanLine } from "lucide-react";
import { AdminButton, AdminDialog, BtnPrimary, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import type { EquipmentTypeTechnicalField, ServiceOrderTechnicalValue } from "@/features/equipment/domain/equipment";
import { NewOrderEntryChecklist } from "@/features/checklists/presentation/NewOrderEntryChecklist";
import { DeviceCaptureBridge } from "./DeviceCaptureBridge";
import { OrderImagesField, type OrderImage } from "./OrderImages";
import type { OrderImageKind } from "../domain/order-image";

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
  canAddImages,
  canRemoveImages,
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
  onAddImages: (files: FileList | File[] | null, kind?: Exclude<OrderImageKind, "solution">) => void;
  onRemoveImage: (key: string) => void;
  onViewImage?: (image: OrderImage) => void;
  canAddImages: boolean;
  canRemoveImages: boolean | ((image: OrderImage) => boolean);
  showImages: boolean;
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
    let bitmap: ImageBitmap | undefined;

    try {
      const Detector = (window as unknown as {
        BarcodeDetector?: new () => { detect: (image: ImageBitmap) => Promise<Array<{ rawValue: string }>> };
      }).BarcodeDetector;
      if (!Detector) throw new Error("Este navegador não oferece leitura de códigos. Use um aplicativo de scanner e cole o número no campo de série.");
      bitmap = await createImageBitmap(file);
      const codes = await new Detector().detect(bitmap);
      if (generation !== scanGeneration.current) return;
      const values = [...new Set(codes.map(code => code.rawValue.trim()).filter(Boolean))];
      if (!values.length) throw new Error("Código não encontrado. Tire uma foto mais próxima e nítida do código de barras ou QR da série. Texto sem código deve ser digitado.");
      setScanValues(values);
      setScanValue(values[0]);
    } catch (error) {
      if (generation === scanGeneration.current) setScanError(error instanceof Error ? error.message : "Não foi possível ler o código.");
    } finally {
      bitmap?.close();
      if (generation === scanGeneration.current) setScanBusy(false);
    }
  };

  const editingOS = editing;
  const hasPermission = (permission: string) => permission === "equipment.create" && canCreate;
  const setQuickEquipment = (open: boolean) => {
    if (open) onCreateEquipment();
  };
  const upF = onFieldChange;
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
  const displayedTechnicalFields = [...technicalFields, ...historicalFields].sort((first, second) => first.sort_order - second.sort_order);
  const labelImages = images.filter(image => image.kind === "label");
  const otherImages = images.filter(image => image.kind !== "label");

  return (
    <Section
      title="Equipamento"
      actions={!editingOS && showImages && canAddImages ? (
        <div className="hidden md:block">
          <DeviceCaptureBridge
            onSerial={value => upF("serial_number", value)}
            onPhoto={(file, kind) => onAddImages([file], kind)}
          />
        </div>
      ) : undefined}
    >
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

        <div className="flex min-w-0 items-end gap-2 sm:col-span-2">
          <div className="min-w-0 flex-1">
            <FInput
              label="Número de série"
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
              className="h-[42px] w-[42px] shrink-0 !p-0 md:hidden"
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

            <div className="grid min-w-0 grid-cols-1 items-stretch gap-3 md:grid-cols-2">
              <div className="h-full min-w-0 overflow-hidden rounded-xl border border-[#0057e7]/30 bg-[#eef5ff]/70 p-3 shadow-sm shadow-[#0057e7]/5">
                <div className="mb-3 flex items-start gap-2 md:min-h-[74px]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0057e7] text-white"><Tag size={16} /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-[#0057e7]">Etiqueta{!editingOS && <span className="ml-1 text-red-600">*</span>}</p>
                    <p className="mt-0.5 text-xs leading-5 text-[#5a6a82]">{editingOS ? "Priorize uma foto nítida da etiqueta de identificação do equipamento." : "Obrigatória para criar a OS. Envie uma foto nítida da etiqueta de identificação do equipamento."}</p>
                  </div>
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

              <div className="h-full min-w-0 overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white p-3">
                <div className="mb-3 md:min-h-[74px]">
                  <p className="text-sm font-black text-[#0d1b2e]">Outras fotos</p>
                  <p className="mt-0.5 text-xs leading-5 text-[#5a6a82]">Registre o estado geral, detalhes, avarias e outros pontos importantes.</p>
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
