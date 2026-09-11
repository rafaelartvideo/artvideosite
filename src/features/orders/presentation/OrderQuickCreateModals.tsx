import React, { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminIconButton, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { FInput, FIntegerInput, FSelect, FTextarea, FToggle } from "@/shared/ui/admin/AdminFormControls";
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

type QuickEquipmentMode = "full" | "type" | "brand" | "model";

type QuickEquipmentSavedItems = {
  type: any;
  brand?: any | null;
  model?: any | null;
};

export function QuickEquipmentModal({
  onClose,
  onSaved,
  technicalFields,
  technicalFieldLinks,
  equipmentTypes,
  equipmentBrands,
  initialTypeId,
  initialBrandId,
}: {
  onClose: () => void;
  onSaved: (items: QuickEquipmentSavedItems) => void;
  technicalFields: any[];
  technicalFieldLinks: any[];
  equipmentTypes: any[];
  equipmentBrands: any[];
  initialTypeId?: string;
  initialBrandId?: string;
}) {
  const { hasPermission } = useAuth();
  const defaultMode: QuickEquipmentMode = initialBrandId ? "model" : initialTypeId ? "brand" : "full";
  const [mode, setMode] = useState<QuickEquipmentMode>(defaultMode);
  const [selectedTypeId, setSelectedTypeId] = useState(initialTypeId || "");
  const [selectedBrandId, setSelectedBrandId] = useState(initialBrandId || "");
  const [typeName, setTypeName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [modelName, setModelName] = useState("");
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const availableBrands = useMemo(
    () => equipmentBrands.filter(brand => brand.equipment_type_id === selectedTypeId),
    [equipmentBrands, selectedTypeId],
  );
  const activeTechnicalFields = useMemo(
    () => technicalFields.filter(field => field.is_active !== false),
    [technicalFields],
  );

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: position.x, y: position.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPosition({ x: dragRef.current.x + event.clientX - dragRef.current.startX, y: dragRef.current.y + event.clientY - dragRef.current.startY });
  };
  const endDrag = () => { dragRef.current = null; };

  const selectMode = (nextMode: QuickEquipmentMode) => {
    if (saving) return;
    setMode(nextMode);
    setErrorMessage("");
    if (nextMode === "full" || nextMode === "type") {
      setSelectedTypeId("");
      setSelectedBrandId("");
    } else if (nextMode === "brand") {
      setSelectedBrandId("");
    }
  };

  const canSave = (() => {
    if (mode === "full") return Boolean(typeName.trim() && brandName.trim() && modelName.trim());
    if (mode === "type") return Boolean(typeName.trim());
    if (mode === "brand") return Boolean(selectedTypeId && brandName.trim());
    return Boolean(selectedTypeId && selectedBrandId && modelName.trim());
  })();

  const persistTechnicalFields = async (typeId: string) => {
    if ((mode !== "full" && mode !== "type") || selectedFieldIds.length === 0) return;
    const existingLinks = technicalFieldLinks
      .filter(link => link.equipment_type_id === typeId)
      .map(link => ({ technical_field_id: link.technical_field_id, required: Boolean(link.required), sort_order: Number(link.sort_order) || 0 }));
    const existingIds = new Set(existingLinks.map(link => link.technical_field_id));
    const selectedLinks = selectedFieldIds
      .filter(fieldId => !existingIds.has(fieldId))
      .map((fieldId, index) => ({ technical_field_id: fieldId, required: false, sort_order: (existingLinks.length + index) * 10 }));
    await saveEquipmentTypeTechnicalFields(typeId, [...existingLinks, ...selectedLinks]);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setErrorMessage("");
    try {
      let type: any = null;
      let brand: any = null;
      let model: any = null;

      if (mode === "full" || mode === "type") {
        const normalizedTypeName = typeName.trim();
        const { data: existingType, error: typeLookupError } = await findEquipmentTypeByName(normalizedTypeName);
        if (typeLookupError) throw typeLookupError;
        const typeResult = existingType
          ? { data: existingType, error: null }
          : await createEquipmentType({ name: normalizedTypeName, slug: await generateUniqueSlug("equipment_types", normalizedTypeName), is_active: true, sort_order: 0 });
        if (typeResult.error || !typeResult.data) throw typeResult.error || new Error("Equipamento não foi cadastrado.");
        type = typeResult.data;
        await persistTechnicalFields(type.id);
      } else {
        type = equipmentTypes.find(item => item.id === selectedTypeId) || null;
        if (!type) throw new Error("Selecione um tipo de equipamento válido.");
      }

      if (mode === "full" || mode === "brand") {
        const normalizedBrandName = brandName.trim();
        const { data: existingBrand, error: brandLookupError } = await findEquipmentBrandByName(type.id, normalizedBrandName);
        if (brandLookupError) throw brandLookupError;
        const brandResult = existingBrand
          ? { data: existingBrand, error: null }
          : await createEquipmentBrand({ name: normalizedBrandName, slug: await generateUniqueSlug("equipment_brands", normalizedBrandName), equipment_type_id: type.id, is_active: true, sort_order: 0 });
        if (brandResult.error || !brandResult.data) throw brandResult.error || new Error("Marca não foi cadastrada.");
        brand = brandResult.data;
      } else if (mode === "model") {
        brand = equipmentBrands.find(item => item.id === selectedBrandId && item.equipment_type_id === type.id) || null;
        if (!brand) throw new Error("Selecione uma marca válida para este equipamento.");
      }

      if (mode === "full" || mode === "model") {
        const normalizedModelName = modelName.trim();
        const { data: existingModel, error: modelLookupError } = await findEquipmentModelByName(brand.id, normalizedModelName);
        if (modelLookupError) throw modelLookupError;
        const modelResult = existingModel
          ? { data: existingModel, error: null }
          : await createEquipmentModel({ name: normalizedModelName, slug: await generateUniqueSlug("equipment_models", normalizedModelName), equipment_brand_id: brand.id, is_active: true, sort_order: 0 });
        if (modelResult.error || !modelResult.data) throw modelResult.error || new Error("Modelo não foi cadastrado.");
        model = modelResult.data;
      }

      onSaved({ type, brand, model });
      onClose();
    } catch (error) {
      console.error("[ADMIN] quick equipment save error:", error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const modes: Array<{ id: QuickEquipmentMode; title: string; description: string }> = [
    { id: "full", title: "Completo", description: "Equipamento + marca + modelo" },
    { id: "type", title: "Equipamento", description: "Somente o tipo" },
    { id: "brand", title: "Marca", description: "Para equipamento existente" },
    { id: "model", title: "Modelo", description: "Para marca existente" },
  ];

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent showClose={false} className="max-w-3xl border-0 bg-transparent p-0 shadow-none">
        <DialogTitle className="sr-only">Adicionar equipamento, marca ou modelo</DialogTitle>
        <div
          style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
          className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#0d1b2e]/10 bg-white shadow-2xl"
        >
          <div onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} className="flex cursor-move items-center justify-between border-b border-[#0d1b2e]/10 px-5 py-4 select-none sm:px-6">
            <div className="min-w-0 pr-4">
              <h3 className="text-base font-black text-[#0d1b2e]">Adicionar equipamento, marca ou modelo</h3>
              <p className="mt-1 text-xs text-[#5a6a82]">Cadastre somente o nível necessário sem sair da nova OS.</p>
            </div>
            <AdminIconButton ariaLabel="Fechar" onClick={onClose} disabled={saving} variant="ghost"><X size={17} /></AdminIconButton>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            <div className="space-y-6">
              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#5a6a82]">O que deseja cadastrar?</p>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {modes.map(item => {
                    const selected = mode === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={saving}
                        onClick={() => selectMode(item.id)}
                        className={`min-w-0 rounded-xl border px-3 py-3 text-left transition ${selected ? "border-[#0057e7] bg-[#eef5ff] shadow-sm" : "border-[#0d1b2e]/10 bg-white hover:border-[#0057e7]/40 hover:bg-[#f8fafc]"}`}
                      >
                        <span className={`block text-xs font-black ${selected ? "text-[#0057e7]" : "text-[#0d1b2e]"}`}>{item.title}</span>
                        <span className="mt-1 block text-[10px] leading-4 text-[#5a6a82]">{item.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {(mode === "full" || mode === "type") && (
                <div className="rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-4 sm:p-5">
                  <div className="mb-4">
                    <p className="text-sm font-black text-[#0d1b2e]">Novo equipamento</p>
                    <p className="mt-1 text-xs text-[#5a6a82]">Crie o tipo principal. Se o nome já existir, o cadastro existente será reutilizado.</p>
                  </div>
                  <FInput label="Tipo de equipamento" required autoFocus disabled={saving} value={typeName} onChange={(event: any) => setTypeName(event.target.value)} placeholder="Ex: Televisão" />
                </div>
              )}

              {(mode === "brand" || mode === "model") && (
                <div className="rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-4 sm:p-5">
                  <div className="mb-4">
                    <p className="text-sm font-black text-[#0d1b2e]">Equipamento existente</p>
                    <p className="mt-1 text-xs text-[#5a6a82]">Escolha onde o novo cadastro será vinculado.</p>
                  </div>
                  <FSelect
                    label="Tipo de equipamento"
                    required
                    disabled={saving}
                    value={selectedTypeId}
                    onChange={(event: any) => {
                      setSelectedTypeId(event.target.value);
                      setSelectedBrandId("");
                    }}
                    options={[{ value: "", label: "Selecionar equipamento..." }, ...equipmentTypes.map(type => ({ value: type.id, label: type.name }))]}
                  />
                </div>
              )}

              {mode === "full" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <FInput label="Marca" required disabled={saving} value={brandName} onChange={(event: any) => setBrandName(event.target.value)} placeholder="Ex: Samsung" />
                  <FInput label="Modelo" required disabled={saving} value={modelName} onChange={(event: any) => setModelName(event.target.value)} placeholder="Ex: UN55CU7700" />
                </div>
              )}

              {mode === "brand" && (
                <div className="rounded-xl border border-[#0d1b2e]/10 p-4 sm:p-5">
                  <FInput label="Nova marca" required autoFocus disabled={saving || !selectedTypeId} value={brandName} onChange={(event: any) => setBrandName(event.target.value)} placeholder={selectedTypeId ? "Ex: Samsung" : "Selecione o equipamento primeiro"} />
                </div>
              )}

              {mode === "model" && (
                <div className="grid gap-4 rounded-xl border border-[#0d1b2e]/10 p-4 sm:grid-cols-2 sm:p-5">
                  <FSelect
                    label="Marca existente"
                    required
                    disabled={saving || !selectedTypeId}
                    value={selectedBrandId}
                    onChange={(event: any) => setSelectedBrandId(event.target.value)}
                    options={[{ value: "", label: selectedTypeId ? "Selecionar marca..." : "Selecione o equipamento primeiro" }, ...availableBrands.map(brand => ({ value: brand.id, label: brand.name }))]}
                  />
                  <FInput label="Novo modelo" required autoFocus disabled={saving || !selectedBrandId} value={modelName} onChange={(event: any) => setModelName(event.target.value)} placeholder={selectedBrandId ? "Ex: UN55CU7700" : "Selecione a marca primeiro"} />
                </div>
              )}

              {(mode === "full" || mode === "type") && activeTechnicalFields.length > 0 && (
                <div className="rounded-xl border border-[#0d1b2e]/10 p-4 sm:p-5">
                  <div className="mb-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#5a6a82]">Campos do equipamento</p>
                    <p className="mt-1 text-xs text-[#5a6a82]">Selecione os campos técnicos que devem aparecer nas OS deste equipamento.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {activeTechnicalFields.map(field => (
                      <label key={field.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-[#0d1b2e]/8 bg-[#f8fafc] px-3 py-2.5 text-sm font-medium text-[#0d1b2e]">
                        <Checkbox disabled={saving} checked={selectedFieldIds.includes(field.id)} onCheckedChange={checked => setSelectedFieldIds(current => checked === true ? [...current, field.id] : current.filter(id => id !== field.id))} />
                        <span className="truncate">{field.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {errorMessage && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{errorMessage}</p>}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-[#0d1b2e]/10 bg-white px-5 py-4 sm:px-6">
            <BtnSecondary onClick={onClose} disabled={saving}>Cancelar</BtnSecondary>
            {hasPermission("equipment.create") && (
              <BtnPrimary onClick={save} disabled={!canSave} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>
            )}
          </div>
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
    if (form.forecast_days !== "" && (!Number.isInteger(Number(form.forecast_days)) || Number(form.forecast_days) < 0)) {
      setErrorMessage("A previsão deve ser informada em dias inteiros, a partir de zero.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    try {
      const { data, error } = await createServiceType({ title: form.title.trim(), description: form.description.trim() || null, forecast_days: form.forecast_days ? Number(form.forecast_days) : null, is_active: form.is_active, sort_order: 0 });
      if (error || !data) setErrorMessage(error?.message || "Tipo de atendimento não foi cadastrado.");
      else { onSaved(data); onClose(); }
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent showClose={false} className="max-w-sm border-0 bg-transparent p-0 shadow-none">
      <DialogTitle className="sr-only">Novo tipo de atendimento</DialogTitle>
      <div style={{ transform: `translate(${position.x}px, ${position.y}px)` }} className="relative w-full max-w-sm rounded-xl bg-white shadow-2xl border border-[#0d1b2e]/10 overflow-hidden">
        <div onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} className="flex cursor-move items-center justify-between border-b border-[#0d1b2e]/10 px-4 py-3 select-none">
          <div><h3 className="text-sm font-bold text-[#0d1b2e]">Novo tipo de atendimento</h3><p className="text-[11px] text-[#5a6a82] mt-0.5">Cadastre sem sair da OS</p></div>
          <AdminIconButton ariaLabel="Fechar" onClick={onClose} disabled={saving} variant="ghost"><X size={16} /></AdminIconButton>
        </div>
        <div className="p-4 space-y-3">
          <FInput label="Título" required autoFocus disabled={saving} value={form.title} onChange={(event: any) => setForm({ ...form, title: event.target.value })} />
          <FTextarea label="Descrição" disabled={saving} value={form.description} onChange={(event: any) => setForm({ ...form, description: event.target.value })} rows={3} />
          <FIntegerInput label="Previsão em dias" disabled={saving} value={form.forecast_days} onChange={(event: any) => setForm({ ...form, forecast_days: event.target.value })} />
          <FToggle label="Tipo ativo" disabled={saving} checked={form.is_active} onChange={is_active => setForm({ ...form, is_active })} />
          {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#0d1b2e]/10 px-4 py-3"><BtnSecondary onClick={onClose} disabled={saving}>Cancelar</BtnSecondary>{hasPermission("service_types.create") && <BtnPrimary onClick={save} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}</div>
      </div>
      </DialogContent>
    </Dialog>
  );
}
