import React, { useRef, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminIconButton, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { FInput, FTextarea, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
import {
  createEquipmentBrand,
  createEquipmentModel,
  createEquipmentType,
  createServiceType,
  findEquipmentBrandByName,
  findEquipmentModelByName,
  findEquipmentTypeByName,
} from "../infrastructure/orders-catalog.repository";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/primitives/dialog";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { saveEquipmentTypeTechnicalFields } from "@/features/equipment/infrastructure/equipment.repository";

export function QuickEquipmentModal({ onClose, onSaved, technicalFields, technicalFieldLinks }: {
  onClose: () => void;
  onSaved: (items: { type: any; brand: any; model: any }) => void;
  technicalFields: any[];
  technicalFieldLinks: any[];
}) {
  const { hasPermission } = useAuth();
  const [typeName, setTypeName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [modelName, setModelName] = useState("");
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: position.x, y: position.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPosition({ x: dragRef.current.x + event.clientX - dragRef.current.startX, y: dragRef.current.y + event.clientY - dragRef.current.startY });
  };
  const endDrag = () => { dragRef.current = null; };
  const save = async () => {
    if (!typeName.trim() || !brandName.trim() || !modelName.trim()) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const { data: existingType, error: typeLookupError } = await findEquipmentTypeByName(typeName.trim());
      if (typeLookupError) throw typeLookupError;
      const typeResult = existingType
        ? { data: existingType, error: null }
        : await createEquipmentType({ name: typeName.trim(), slug: await generateUniqueSlug("equipment_types", typeName), is_active: true, sort_order: 0 });
      const { data: type, error: typeError } = typeResult;
      if (typeError || !type) throw typeError || new Error("Equipamento não foi cadastrado.");

      const { data: existingBrand, error: brandLookupError } = await findEquipmentBrandByName(type.id, brandName.trim());
      if (brandLookupError) throw brandLookupError;
      const brandResult = existingBrand
        ? { data: existingBrand, error: null }
        : await createEquipmentBrand({ name: brandName.trim(), slug: await generateUniqueSlug("equipment_brands", brandName), equipment_type_id: type.id, is_active: true, sort_order: 0 });
      const { data: brand, error: brandError } = brandResult;
      if (brandError || !brand) throw brandError || new Error("Marca não foi cadastrada.");

      const { data: existingModel, error: modelLookupError } = await findEquipmentModelByName(brand.id, modelName.trim());
      if (modelLookupError) throw modelLookupError;
      const modelResult = existingModel
        ? { data: existingModel, error: null }
        : await createEquipmentModel({ name: modelName.trim(), slug: await generateUniqueSlug("equipment_models", modelName), equipment_brand_id: brand.id, is_active: true, sort_order: 0 });
      const { data: model, error: modelError } = modelResult;
      if (modelError || !model) throw modelError || new Error("Modelo não foi cadastrado.");

      const existingLinks = technicalFieldLinks
        .filter(link => link.equipment_type_id === type.id)
        .map(link => ({ technical_field_id: link.technical_field_id, required: Boolean(link.required), sort_order: Number(link.sort_order) || 0 }));
      const existingIds = new Set(existingLinks.map(link => link.technical_field_id));
      const selectedLinks = selectedFieldIds
        .filter(fieldId => !existingIds.has(fieldId))
        .map((fieldId, index) => ({ technical_field_id: fieldId, required: false, sort_order: (existingLinks.length + index) * 10 }));
      await saveEquipmentTypeTechnicalFields(type.id, [...existingLinks, ...selectedLinks]);
      onSaved({ type, brand, model });
      onClose();
    } catch (error) {
      console.error("[ADMIN] quick equipment save error:", error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showClose={false} className="max-w-md border-0 bg-transparent p-0 shadow-none">
      <DialogTitle className="sr-only">Adicionar novo equipamento</DialogTitle>
      <div style={{ transform: `translate(${position.x}px, ${position.y}px)` }} className="relative w-full max-w-md rounded-xl bg-white shadow-2xl border border-[#0d1b2e]/10 overflow-hidden">
        <div onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} className="flex cursor-move items-center justify-between border-b border-[#0d1b2e]/10 px-4 py-3 select-none">
          <div><h3 className="text-sm font-bold text-[#0d1b2e]">Adicionar novo equipamento</h3><p className="text-[11px] text-[#5a6a82] mt-0.5">Cadastre a hierarquia completa</p></div>
          <AdminIconButton ariaLabel="Fechar" onClick={onClose} variant="ghost"><X size={16} /></AdminIconButton>
        </div>
        <div className="p-4 space-y-3">
          <FInput label="Tipo de equipamento" required autoFocus value={typeName} onChange={(event: any) => setTypeName(event.target.value)} placeholder="Ex: Televisão" />
          <FInput label="Marca" required value={brandName} onChange={(event: any) => setBrandName(event.target.value)} placeholder="Ex: Samsung" />
          <FInput label="Modelo" required value={modelName} onChange={(event: any) => setModelName(event.target.value)} placeholder="Ex: UN55CU7700" />
          {technicalFields.filter(field => field.is_active !== false).length > 0 && <div className="rounded-lg border border-[#0d1b2e]/10 p-3">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#5a6a82]">Campos do equipamento</p>
            <div className="space-y-2">
              {technicalFields.filter(field => field.is_active !== false).map(field => <label key={field.id} className="flex items-center gap-2 text-sm font-medium text-[#0d1b2e]">
                <Checkbox checked={selectedFieldIds.includes(field.id)} onCheckedChange={checked => setSelectedFieldIds(current => checked === true ? [...current, field.id] : current.filter(id => id !== field.id))} />
                {field.label}
              </label>)}
            </div>
          </div>}
          {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#0d1b2e]/10 px-4 py-3"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>{hasPermission("equipment.create") && <BtnPrimary onClick={save} disabled={saving || !typeName.trim() || !brandName.trim() || !modelName.trim()}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>}</div>
      </div>
      </DialogContent>
    </Dialog>
  );
}

export function ServiceTypeModal({ onClose, onSaved }: { onClose: () => void; onSaved: (serviceType: any) => void }) {
  const { hasPermission } = useAuth();
  const [form, setForm] = useState({ title: "", description: "", forecast_days: "", is_active: true });
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: position.x, y: position.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPosition({ x: dragRef.current.x + event.clientX - dragRef.current.startX, y: dragRef.current.y + event.clientY - dragRef.current.startY });
  };
  const save = async () => {
    if (!form.title.trim()) { setErrorMessage("Informe o título do tipo de atendimento."); return; }
    setSaving(true);
    setErrorMessage("");
    const { data, error } = await createServiceType({ title: form.title.trim(), description: form.description.trim() || null, forecast_days: form.forecast_days ? Number(form.forecast_days) : null, is_active: form.is_active, sort_order: 0 });
    if (error || !data) setErrorMessage(error?.message || "Tipo de atendimento não foi cadastrado.");
    else { onSaved(data); onClose(); }
    setSaving(false);
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showClose={false} className="max-w-sm border-0 bg-transparent p-0 shadow-none">
      <DialogTitle className="sr-only">Novo tipo de atendimento</DialogTitle>
      <div style={{ transform: `translate(${position.x}px, ${position.y}px)` }} className="relative w-full max-w-sm rounded-xl bg-white shadow-2xl border border-[#0d1b2e]/10 overflow-hidden">
        <div onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} className="flex cursor-move items-center justify-between border-b border-[#0d1b2e]/10 px-4 py-3 select-none">
          <div><h3 className="text-sm font-bold text-[#0d1b2e]">Novo tipo de atendimento</h3><p className="text-[11px] text-[#5a6a82] mt-0.5">Cadastre sem sair da OS</p></div>
          <AdminIconButton ariaLabel="Fechar" onClick={onClose} variant="ghost"><X size={16} /></AdminIconButton>
        </div>
        <div className="p-4 space-y-3">
          <FInput label="Título" required autoFocus value={form.title} onChange={(event: any) => setForm({ ...form, title: event.target.value })} />
          <FTextarea label="Descrição" value={form.description} onChange={(event: any) => setForm({ ...form, description: event.target.value })} rows={3} />
          <FInput label="Previsão em dias" type="number" min="0" value={form.forecast_days} onChange={(event: any) => setForm({ ...form, forecast_days: event.target.value })} />
          <FToggle label="Tipo ativo" checked={form.is_active} onChange={is_active => setForm({ ...form, is_active })} />
          {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#0d1b2e]/10 px-4 py-3"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>{hasPermission("service_types.create") && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>}</div>
      </div>
      </DialogContent>
    </Dialog>
  );
}
