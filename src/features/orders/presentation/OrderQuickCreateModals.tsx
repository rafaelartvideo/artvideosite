import { systemErrorMessage } from "@/shared/domain/error-message";
import React, { useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/shared/domain/formatters";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { FInput, FIntegerInput, FTextarea, FToggle, INPUT } from "@/shared/ui/admin/AdminFormControls";
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
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { Popover, PopoverAnchor, PopoverContent } from "@/shared/ui/primitives/popover";
import { saveEquipmentTypeTechnicalFields } from "@/features/equipment/infrastructure/equipment.repository";

type QuickEquipmentMode = "full" | "model";

type QuickEquipmentSavedItems = {
  type: any;
  brand?: any | null;
  model?: any | null;
};

type CatalogOption = {
  id: string;
  name: string;
  meta?: string;
};

function normalizeCatalogValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function cleanCatalogValue(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function getQuickCreateErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  if (error && typeof error === "object") {
    const typed = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
    const code = typeof typed.code === "string" ? typed.code : "";
    const raw = [typed.message, typed.details, typed.hint]
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
      .join(" ");

    if (code === "23505") {
      if (raw.includes("equipment_types_organization_name_uidx")) return "Já existe um equipamento com este nome nesta empresa.";
      if (raw.includes("equipment_brands_type_name_uidx")) return "Já existe uma marca com este nome neste equipamento.";
      if (raw.includes("equipment_models_brand_name_uidx")) return "Já existe um modelo com este nome nesta marca.";
      return "Já existe um cadastro igual.";
    }

    if (code === "23502" && raw.includes("organization_id")) {
      return "Não foi possível identificar a empresa ativa para salvar o equipamento.";
    }

    if (raw) return raw;
  }

  return "Não foi possível salvar o equipamento. Tente novamente.";
}

function findExactCatalogOption(options: CatalogOption[], value: string) {
  const normalized = normalizeCatalogValue(value);
  if (!normalized) return null;
  return options.find(option => normalizeCatalogValue(option.name) === normalized) || null;
}

function CatalogCombobox({
  label,
  value,
  selectedId,
  options,
  onChange,
  onSelect,
  placeholder,
  disabled = false,
  required = false,
  allowCreate = true,
  createLabel = "Novo cadastro",
  emptyText = "Nenhum cadastro encontrado.",
  helperText,
}: {
  label: string;
  value: string;
  selectedId: string;
  options: CatalogOption[];
  onChange: (value: string) => void;
  onSelect: (option: CatalogOption | null) => void;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  allowCreate?: boolean;
  createLabel?: string;
  emptyText?: string;
  helperText?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const query = normalizeCatalogValue(value);
  const selectedOption = options.find(option => option.id === selectedId) || null;
  const exactOption = findExactCatalogOption(options, value);
  const duplicateOption = exactOption && exactOption.id !== selectedId ? exactOption : null;

  React.useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const filteredOptions = useMemo(() => {
    const sorted = [...options].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
    if (!query) return sorted;
    return sorted.filter(option => normalizeCatalogValue(option.name).includes(query) || normalizeCatalogValue(option.meta).includes(query));
  }, [options, query]);

  const selectOption = (option: CatalogOption) => {
    onSelect(option);
    onChange(option.name);
    setOpen(false);
  };

  return <div className="min-w-0">
    <label className="mb-1.5 flex min-w-0 items-baseline gap-1 break-words text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">
      {label}{required && <span className="text-red-400">*</span>}
    </label>
    <Popover open={open && !disabled} onOpenChange={(nextOpen) => { if (!disabled) setOpen(nextOpen); }}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className="relative">
          <input
            value={value}
            disabled={disabled}
            autoComplete="off"
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onPointerDown={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
              if (event.key === "Enter" && exactOption) {
                event.preventDefault();
                selectOption(exactOption);
              }
            }}
            onChange={(event) => {
              const nextValue = event.target.value;
              onChange(nextValue);
              if (selectedId && normalizeCatalogValue(selectedOption?.name) !== normalizeCatalogValue(nextValue)) onSelect(null);
              setOpen(true);
            }}
            className={cn(
              INPUT,
              "h-[42px] pr-9",
              disabled && "disabled:cursor-default disabled:bg-slate-100/60 disabled:text-slate-500 disabled:opacity-70 disabled:focus:ring-0",
              duplicateOption && "border-amber-400 focus:border-amber-500 focus:ring-amber-400/30",
              selectedId && "border-emerald-300 bg-emerald-50/30",
            )}
          />
          <ChevronDown size={15} className={cn("pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#5a6a82] transition-transform", open && "rotate-180")} />
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={{ top: 12, right: 12, bottom: 84, left: 12 }}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          const target = event.target as Node | null;
          if (target && anchorRef.current?.contains(target)) event.preventDefault();
        }}
        className="z-[220] w-[var(--radix-popover-trigger-width)] min-w-[220px] overflow-hidden rounded-xl border border-border bg-white p-0 text-[#0d1b2e] shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px] font-semibold text-[#5a6a82]">
          <Search size={13} className="shrink-0" />
          <span>{query ? "Resultados encontrados" : "Cadastros recentes"}</span>
        </div>
        <div
          className="max-h-40 overflow-y-auto overscroll-contain p-1.5 [scrollbar-gutter:stable]"
          onWheelCapture={(event) => event.stopPropagation()}
          onTouchMoveCapture={(event) => event.stopPropagation()}
        >
          {filteredOptions.length > 0 ? filteredOptions.map(option => {
            const selected = selectedId === option.id;
            return <button
              key={option.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-primary-soft focus-visible:bg-primary-soft focus-visible:outline-none",
                selected && "bg-primary-soft",
              )}
            >
              <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary bg-primary text-white" : "border-[#0d1b2e]/15 text-transparent")}><Check size={11} /></span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-xs font-bold", selected ? "text-primary" : "text-[#0d1b2e]")}>{option.name}</span>
                {option.meta && <span className="mt-0.5 block truncate text-[10px] text-[#5a6a82]">{option.meta}</span>}
              </span>
            </button>;
          }) : <p className="px-2.5 py-3 text-xs text-[#5a6a82]">{emptyText}</p>}
        </div>
        {allowCreate && cleanCatalogValue(value) && !exactOption && (
          <div className="border-t border-border bg-muted px-3 py-2 text-[10px] text-[#5a6a82]">
            <span className="font-bold text-primary">{createLabel}:</span> {cleanCatalogValue(value)}
          </div>
        )}
      </PopoverContent>
    </Popover>

    {duplicateOption ? (
      <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-800">
        <div className="flex min-w-0 items-start gap-1.5 text-[10px] font-semibold leading-4">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">“{duplicateOption.name}” já está cadastrado.</span>
        </div>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectOption(duplicateOption)}
          className="mt-1.5 inline-flex min-h-6 items-center rounded-md border border-primary/20 bg-white px-2 py-1 text-[9px] font-bold leading-none text-primary transition-colors hover:bg-primary-soft"
        >
          Usar cadastro
        </button>
      </div>
    ) : selectedId && selectedOption ? (
      <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><Check size={11} /> Cadastro existente selecionado.</p>
    ) : helperText ? (
      <p className="mt-1 text-[10px] leading-relaxed text-[#5a6a82]">{helperText}</p>
    ) : null}
  </div>;
}

export function QuickEquipmentModal({
  onClose,
  onSaved,
  technicalFields,
  technicalFieldLinks,
  equipmentTypes,
  equipmentBrands,
  equipmentModels,
  initialTypeId,
  initialBrandId,
}: {
  onClose: () => void;
  onSaved: (items: QuickEquipmentSavedItems) => void;
  technicalFields: any[];
  technicalFieldLinks: any[];
  equipmentTypes: any[];
  equipmentBrands: any[];
  equipmentModels: any[];
  initialTypeId?: string;
  initialBrandId?: string;
}) {
  const { hasPermission } = useAuth();
  const initialType = equipmentTypes.find(item => item.id === initialTypeId) || null;
  const initialBrand = equipmentBrands.find(item => item.id === initialBrandId && (!initialTypeId || item.equipment_type_id === initialTypeId)) || null;
  const defaultMode: QuickEquipmentMode = initialBrand ? "model" : "full";
  const [mode, setMode] = useState<QuickEquipmentMode>(defaultMode);
  const [selectedTypeId, setSelectedTypeId] = useState(initialType?.id || "");
  const [selectedBrandId, setSelectedBrandId] = useState(initialBrand?.id || "");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [typeName, setTypeName] = useState(initialType?.name || "");
  const [brandName, setBrandName] = useState(initialBrand?.name || "");
  const [modelName, setModelName] = useState("");
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const typeOptions = useMemo<CatalogOption[]>(
    () => equipmentTypes.map(type => ({ id: type.id, name: type.name })),
    [equipmentTypes],
  );
  const availableBrands = useMemo(
    () => selectedTypeId ? equipmentBrands.filter(brand => brand.equipment_type_id === selectedTypeId) : [],
    [equipmentBrands, selectedTypeId],
  );
  const brandOptions = useMemo<CatalogOption[]>(
    () => availableBrands.map(brand => ({ id: brand.id, name: brand.name })),
    [availableBrands],
  );
  const availableModels = useMemo(
    () => selectedBrandId ? equipmentModels.filter(model => model.equipment_brand_id === selectedBrandId) : [],
    [equipmentModels, selectedBrandId],
  );
  const modelOptions = useMemo<CatalogOption[]>(
    () => availableModels.map(model => ({ id: model.id, name: model.name })),
    [availableModels],
  );
  const activeTechnicalFields = useMemo(
    () => technicalFields.filter(field => field.is_active !== false),
    [technicalFields],
  );

  const exactType = findExactCatalogOption(typeOptions, typeName);
  const typeConflict = Boolean(exactType && exactType.id !== selectedTypeId);
  const typeReady = mode === "model"
    ? Boolean(selectedTypeId)
    : Boolean(selectedTypeId || (cleanCatalogValue(typeName) && !typeConflict));

  const exactBrand = findExactCatalogOption(brandOptions, brandName);
  const brandConflict = Boolean(exactBrand && exactBrand.id !== selectedBrandId);
  const brandReady = mode === "model"
    ? Boolean(selectedBrandId)
    : Boolean(selectedBrandId || (cleanCatalogValue(brandName) && !brandConflict));

  const exactModel = findExactCatalogOption(modelOptions, modelName);
  const modelConflict = Boolean(exactModel && exactModel.id !== selectedModelId);
  const modelReady = Boolean(selectedModelId || (cleanCatalogValue(modelName) && !modelConflict));

  const willCreateType = mode === "full" && typeReady && !selectedTypeId;
  const willCreateBrand = mode === "full" && brandReady && !selectedBrandId;
  const willCreateModel = modelReady && !selectedModelId;
  const newItems = [willCreateType && "equipamento", willCreateBrand && "marca", willCreateModel && "modelo"].filter(Boolean) as string[];
  const reusedItems = [selectedTypeId && "equipamento", selectedBrandId && "marca", selectedModelId && "modelo"].filter(Boolean) as string[];

  const canSave = mode === "full"
    ? typeReady && brandReady && modelReady && !typeConflict && !brandConflict && !modelConflict
    : Boolean(selectedTypeId && selectedBrandId && modelReady && !modelConflict);

  const resetBrand = () => {
    setSelectedBrandId("");
    setBrandName("");
    setSelectedModelId("");
    setModelName("");
  };
  const resetModel = () => {
    setSelectedModelId("");
    setModelName("");
  };

  const selectMode = (nextMode: QuickEquipmentMode) => {
    if (saving || mode === nextMode) return;
    setMode(nextMode);
    setErrorMessage("");
    setSelectedModelId("");
    setModelName("");
    if (nextMode === "model") {
      if (!selectedTypeId) {
        setTypeName("");
        resetBrand();
      } else if (!selectedBrandId) {
        setBrandName("");
      }
    }
  };

  const persistTechnicalFields = async (typeId: string) => {
    if (selectedFieldIds.length === 0) return;
    const selectedLinks = selectedFieldIds.map((fieldId, index) => ({
      technical_field_id: fieldId,
      required: false,
      sort_order: index * 10,
    }));
    await saveEquipmentTypeTechnicalFields(typeId, selectedLinks);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setErrorMessage("");
    try {
      let type: any = null;
      let brand: any = null;
      let model: any = null;

      if (selectedTypeId) {
        type = equipmentTypes.find(item => item.id === selectedTypeId) || null;
        if (!type) throw new Error("Selecione um equipamento válido.");
      } else {
        if (mode !== "full") throw new Error("No modo Modelo, selecione um equipamento já cadastrado.");
        const normalizedTypeName = cleanCatalogValue(typeName);
        const { data: existingType, error: typeLookupError } = await findEquipmentTypeByName(normalizedTypeName);
        if (typeLookupError) throw typeLookupError;
        if (existingType) throw new Error(`O equipamento “${existingType.name}” já está cadastrado. Selecione o cadastro existente antes de continuar.`);
        const typeResult = await createEquipmentType({ name: normalizedTypeName, slug: await generateUniqueSlug("equipment_types", normalizedTypeName), is_active: true, sort_order: 0 });
        if (typeResult.error || !typeResult.data) throw typeResult.error || new Error("Equipamento não foi cadastrado.");
        type = typeResult.data;
        await persistTechnicalFields(type.id);
      }

      if (selectedBrandId) {
        brand = equipmentBrands.find(item => item.id === selectedBrandId && item.equipment_type_id === type.id) || null;
        if (!brand) throw new Error("Selecione uma marca válida para este equipamento.");
      } else {
        if (mode !== "full") throw new Error("No modo Modelo, selecione uma marca já cadastrada.");
        const normalizedBrandName = cleanCatalogValue(brandName);
        const { data: existingBrand, error: brandLookupError } = await findEquipmentBrandByName(type.id, normalizedBrandName);
        if (brandLookupError) throw brandLookupError;
        if (existingBrand) throw new Error(`A marca “${existingBrand.name}” já está cadastrada neste equipamento. Selecione o cadastro existente antes de continuar.`);
        const brandResult = await createEquipmentBrand({ name: normalizedBrandName, slug: await generateUniqueSlug("equipment_brands", normalizedBrandName), equipment_type_id: type.id, is_active: true, sort_order: 0 });
        if (brandResult.error || !brandResult.data) throw brandResult.error || new Error("Marca não foi cadastrada.");
        brand = brandResult.data;
      }

      if (selectedModelId) {
        model = equipmentModels.find(item => item.id === selectedModelId && item.equipment_brand_id === brand.id) || null;
        if (!model) throw new Error("Selecione um modelo válido para esta marca.");
      } else {
        const normalizedModelName = cleanCatalogValue(modelName);
        const { data: existingModel, error: modelLookupError } = await findEquipmentModelByName(brand.id, normalizedModelName);
        if (modelLookupError) throw modelLookupError;
        if (existingModel) throw new Error(`O modelo “${existingModel.name}” já está cadastrado nesta marca. Selecione o cadastro existente para usá-lo.`);
        const modelResult = await createEquipmentModel({ name: normalizedModelName, slug: await generateUniqueSlug("equipment_models", normalizedModelName), equipment_brand_id: brand.id, is_active: true, sort_order: 0 });
        if (modelResult.error || !modelResult.data) throw modelResult.error || new Error("Modelo não foi cadastrado.");
        model = modelResult.data;
      }

      onSaved({ type, brand, model });
      notifyAdmin(mode === "model" ? "Modelo criado com sucesso." : "Equipamento criado com sucesso.", "success");
      onClose();
    } catch (error) {
      console.error("[ADMIN] quick equipment save error:", error);
      setErrorMessage(getQuickCreateErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const modes: Array<{ id: QuickEquipmentMode; title: string; description: string }> = [
    { id: "full", title: "Completo", description: "Equipamento, marca e modelo em um único fluxo" },
    { id: "model", title: "Modelo", description: "Adicione um modelo a um equipamento já cadastrado" },
  ];

  const typeHelper = mode === "model"
    ? "Pesquise e selecione um equipamento já cadastrado."
    : "Digite para pesquisar. Se não existir, o equipamento será criado.";
  const brandHelper = mode === "model"
    ? "Pesquise uma marca vinculada ao equipamento selecionado."
    : selectedTypeId
      ? "Digite para pesquisar marcas deste equipamento ou cadastre uma nova."
      : "Informe primeiro o equipamento. Para um equipamento novo, a marca também será nova.";
  const modelHelper = selectedBrandId
    ? "Digite para pesquisar modelos desta marca. Se não existir, será criado."
    : "Informe a marca para continuar.";

  return <AdminDialog
    open
    onClose={() => { if (!saving) onClose(); }}
    title="Cadastro rápido de equipamento"
    description="Pesquise antes de cadastrar e evite duplicidades no catálogo."
    minimizedDescription={[typeName, brandName, modelName].map(value => String(value || "").trim()).filter(Boolean).join(" · ") || (mode === "model" ? "Novo modelo" : "Cadastro em andamento")}
    minimizable={!saving}
    className="max-w-6xl"
    footer={<div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
      <BtnSecondary className="w-full sm:w-auto" onClick={onClose} disabled={saving}>Cancelar</BtnSecondary>
      {hasPermission("equipment.create") && (
        <BtnPrimary className="w-full sm:w-auto" onClick={save} disabled={!canSave} loading={saving} loadingText="Salvando...">
          {newItems.length === 0 && selectedModelId ? "Usar" : "Criar"}
        </BtnPrimary>
      )}
    </div>}
  >
    <div className="space-y-5 sm:space-y-6">
<div>
                <p className="mb-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#5a6a82]">Tipo de cadastro</p>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f3f6fa] p-1.5">
                  {modes.map(item => {
                    const selected = mode === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={saving}
                        onClick={() => selectMode(item.id)}
                        className={cn(
                          "min-w-0 rounded-lg border px-3 py-2.5 text-left transition sm:px-4 sm:py-3",
                          selected ? "border-primary/20 bg-white shadow-sm" : "border-transparent hover:bg-white/70",
                        )}
                      >
                        <span className={cn("block text-xs font-black sm:text-sm", selected ? "text-primary" : "text-[#0d1b2e]")}>{item.title}</span>
                        <span className="mt-0.5 block text-[9px] leading-3.5 text-[#5a6a82] sm:mt-1 sm:text-[10px] sm:leading-4">{item.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted p-4 sm:p-6">
                <div className="mb-5">
                  <p className="text-sm font-black text-[#0d1b2e]">Dados do equipamento</p>
                  <p className="mt-1 text-[11px] leading-4 text-[#5a6a82] sm:text-xs">Digite em cada campo para pesquisar os cadastros existentes. Cadastros selecionados são reutilizados sem alteração.</p>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                  <div className="relative min-w-0">
                    <span className="mb-2 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-black text-white">1</span>
                    <CatalogCombobox
                      label="Equipamento"
                      required
                      value={typeName}
                      selectedId={selectedTypeId}
                      options={typeOptions}
                      disabled={saving}
                      allowCreate={mode === "full"}
                      createLabel="Novo equipamento"
                      emptyText={mode === "model" ? "Nenhum equipamento encontrado. No modo Modelo, use um cadastro existente." : "Nenhum equipamento encontrado."}
                      helperText={typeHelper}
                      placeholder="Ex: Televisão"
                      onChange={(value) => {
                        setTypeName(value);
                        setErrorMessage("");
                      }}
                      onSelect={(option) => {
                        setSelectedTypeId(option?.id || "");
                        resetBrand();
                        setErrorMessage("");
                      }}
                    />
                  </div>

                  <div className="relative min-w-0">
                    <span className="mb-2 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-black text-white">2</span>
                    <CatalogCombobox
                      label="Marca"
                      required
                      value={brandName}
                      selectedId={selectedBrandId}
                      options={brandOptions}
                      disabled={saving || !typeReady}
                      allowCreate={mode === "full"}
                      createLabel="Nova marca"
                      emptyText={selectedTypeId ? "Nenhuma marca encontrada para este equipamento." : "Informe o equipamento primeiro."}
                      helperText={brandHelper}
                      placeholder={typeReady ? "Ex: Samsung" : "Informe o equipamento primeiro"}
                      onChange={(value) => {
                        setBrandName(value);
                        setErrorMessage("");
                      }}
                      onSelect={(option) => {
                        setSelectedBrandId(option?.id || "");
                        resetModel();
                        setErrorMessage("");
                      }}
                    />
                  </div>

                  <div className="relative min-w-0">
                    <span className="mb-2 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-black text-white">3</span>
                    <CatalogCombobox
                      label="Modelo"
                      required
                      value={modelName}
                      selectedId={selectedModelId}
                      options={modelOptions}
                      disabled={saving || !brandReady}
                      allowCreate
                      createLabel="Novo modelo"
                      emptyText={selectedBrandId ? "Nenhum modelo encontrado para esta marca." : "Informe a marca primeiro."}
                      helperText={modelHelper}
                      placeholder={brandReady ? "Ex: UN55CU7700" : "Informe a marca primeiro"}
                      onChange={(value) => {
                        setModelName(value);
                        setErrorMessage("");
                      }}
                      onSelect={(option) => {
                        setSelectedModelId(option?.id || "");
                        setErrorMessage("");
                      }}
                    />
                  </div>
                </div>
              </div>

              {mode === "full" && activeTechnicalFields.length > 0 && !selectedTypeId && cleanCatalogValue(typeName) && !typeConflict && (
                <div className="rounded-xl border border-border p-3 sm:p-5">
                  <div className="mb-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#5a6a82]">Campos do equipamento</p>
                    <p className="mt-1 text-[11px] leading-4 text-[#5a6a82] sm:text-xs">Opcional. Escolha os campos técnicos que aparecerão nas OS deste novo equipamento.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {activeTechnicalFields.map(field => (
                      <label key={field.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2.5 text-sm font-medium text-[#0d1b2e] transition hover:border-primary/25 hover:bg-primary-soft/50">
                        <Checkbox disabled={saving} checked={selectedFieldIds.includes(field.id)} onCheckedChange={checked => setSelectedFieldIds(current => checked === true ? [...current, field.id] : current.filter(id => id !== field.id))} />
                        <span className="min-w-0 break-words">{field.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {mode === "full" && selectedTypeId && (
                <div className="rounded-lg border border-primary/15 bg-primary-soft/60 px-3 py-2.5 text-[10px] leading-4 text-[#426080]">
                  Os campos técnicos do equipamento existente serão mantidos sem alterações. Para editá-los, use <strong>Operação &gt; Equipamentos</strong>.
                </div>
              )}

              {canSave && (
                <div className="rounded-xl border border-border bg-white p-3 shadow-sm sm:px-4 sm:py-3.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-[#0d1b2e]">Resumo do cadastro</p>
                      <p className="mt-0.5 text-[10px] leading-4 text-[#5a6a82]">
                        {newItems.length > 0 ? `Será criado: ${newItems.join(", ")}.` : "Nenhum cadastro novo será criado."}
                        {reusedItems.length > 0 ? ` Será reutilizado: ${reusedItems.join(", ")}.` : ""}
                      </p>
                    </div>
                    {newItems.length === 0 && selectedModelId && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700">Já cadastrado</span>}
                  </div>
                </div>
              )}

              {errorMessage && <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700"><AlertCircle size={15} className="mt-0.5 shrink-0" />{errorMessage}</p>}
    </div>
  </AdminDialog>;
}

export function ServiceTypeModal({ onClose, onSaved }: { onClose: () => void; onSaved: (serviceType: any) => void }) {
  const { hasPermission } = useAuth();
  const [form, setForm] = useState({ title: "", description: "", forecast_days: "", is_active: true });
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; forecast_days?: string }>({});
  const save = async () => {
    const nextErrors: { title?: string; forecast_days?: string } = {};
    if (!form.title.trim()) nextErrors.title = "Informe o título do tipo de atendimento.";
    if (form.forecast_days !== "" && (!Number.isInteger(Number(form.forecast_days)) || Number(form.forecast_days) < 0)) {
      nextErrors.forecast_days = "A previsão deve ser informada em dias inteiros, a partir de zero.";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const { data, error } = await createServiceType({ title: form.title.trim(), description: form.description.trim() || null, forecast_days: form.forecast_days ? Number(form.forecast_days) : null, is_active: form.is_active, sort_order: 0 });
      if (error || !data) notifyAdmin(systemErrorMessage(error, "Tipo de atendimento não foi cadastrado."), "error");
      else { onSaved(data); onClose(); }
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Tipo de atendimento não foi cadastrado."), "error");
    } finally {
      setSaving(false);
    }
  };
  return <AdminDialog
    open
    onClose={() => { if (!saving) onClose(); }}
    title="Novo tipo de atendimento"
    description="Cadastre sem sair da OS."
    minimizedDescription={form.title.trim() || (form.forecast_days ? `Previsão: ${form.forecast_days} dia(s)` : "Cadastro em andamento")}
    minimizable={!saving}
    className="max-w-sm"
    footer={<div className="flex justify-end gap-2">
      <BtnSecondary onClick={onClose} disabled={saving}>Cancelar</BtnSecondary>
      {hasPermission("service_types.create") && <BtnPrimary onClick={save} loading={saving} loadingText="Salvando...">Criar</BtnPrimary>}
    </div>}
  >
    <div className="space-y-3">
      <FInput label="Título" required disabled={saving} error={fieldErrors.title} value={form.title} onChange={(event: any) => { setFieldErrors(current => ({ ...current, title: undefined })); setForm({ ...form, title: event.target.value }); }} />
      <FTextarea label="Descrição" disabled={saving} value={form.description} onChange={(event: any) => setForm({ ...form, description: event.target.value })} rows={3} />
      <FIntegerInput label="Previsão em dias" disabled={saving} error={fieldErrors.forecast_days} value={form.forecast_days} onChange={(event: any) => { setFieldErrors(current => ({ ...current, forecast_days: undefined })); setForm({ ...form, forecast_days: event.target.value }); }} />
      <FToggle label="Tipo ativo" disabled={saving} checked={form.is_active} onChange={is_active => setForm({ ...form, is_active })} />
    </div>
  </AdminDialog>;
}