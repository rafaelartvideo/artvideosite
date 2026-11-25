import { systemErrorMessage } from "@/shared/domain/error-message";
import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/shared/domain/formatters";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { FInput, FIntegerInput, FTextarea, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
import {
  addQuickEquipmentExtraFields,
  createEquipmentBrand,
  createEquipmentModel,
  createEquipmentType,
  createServiceType,
  findEquipmentBrandByName,
  findEquipmentModelByName,
  findEquipmentTypeByName,
} from "../infrastructure/orders-catalog.repository";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { CatalogCombobox, cleanCatalogValue, findExactCatalogOption, normalizeCatalogValue, type CatalogOption } from "@/shared/ui/admin/CatalogCombobox";
export { CatalogCombobox } from "@/shared/ui/admin/CatalogCombobox";

type QuickEquipmentMode = "full" | "model";

type QuickEquipmentSavedItems = {
  type: any;
  brand?: any | null;
  model?: any | null;
};

/**
 * Sugestão inicial do cadastro rápido para equipamentos identificáveis por série.
 * A fonte real da exibição na OS são os vínculos técnicos deste equipamento.
 * Tipos novos/desconhecidos deixam o campo desmarcado, mas o usuário pode incluí-lo.
 */
const SUGGESTED_SERIAL_EQUIPMENT_NAMES = new Set(
  [
    "Celular",
    "Tablet",
    "Smartwatch",
    "Fone de ouvido",
    "Televisor",
    "Micro-ondas",
    "Refrigerador",
    "Freezer",
    "Lavadora de roupas",
    "Lava e seca",
    "Fogão",
    "Forno elétrico",
    "Air fryer",
    "Liquidificador/Multiprocessador",
    "Cafeteira",
    "Ferro de passar",
    "Aspirador de pó",
    "Som/Caixa de som",
    "Adega",
    "Ar-condicionado Split",
    "Ar-condicionado de janela",
    "Ar-condicionado portátil",
    "Climatizador",
    "Cortina de ar",
    "Câmara fria",
    "Notebook",
    "Desktop",
    "All-in-one",
    "Monitor",
    "Impressora",
    "Roteador",
    "Nobreak",
    "Painel solar",
    "Inversor solar",
    "Bateria solar",
    "Controlador de carga",
    "Airfryer",
    "Ar-Condicionado",
    "Caixa De Som",
    "Ferro A Vapor",
    "Fone",
    "Forno Eletrico",
    "Forno Embutir",
    "Lavadoura De Roupas",
    "Liquidificador / Multiprocessador",
    "Microondas",
    "Pipoqueira",
    "Som",
    "Tv",
    "Tv 85 Polegadas"
  ].map(normalizeCatalogValue),
);
function suggestSerialForEquipment(name: string) {
  return SUGGESTED_SERIAL_EQUIPMENT_NAMES.has(normalizeCatalogValue(name));
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
  initialBrandName,
  initialModelName,
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
  initialBrandName?: string;
  initialModelName?: string;
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
  const [brandName, setBrandName] = useState(initialBrand?.name || initialBrandName || "");
  const [modelName, setModelName] = useState(initialModelName || "");
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);

  const initialHasSerial = Boolean(initialTypeId && technicalFieldLinks.some((link) =>
    link.equipment_type_id === initialTypeId
      && technicalFields.some((field) =>
        field.id === link.technical_field_id && field.field_key === "numero_serie"
      ),
  ));
  const [includeSerial, setIncludeSerial] = useState(() => initialHasSerial || suggestSerialForEquipment(initialType?.name || ""));
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
    () => technicalFields.filter(field => field.is_active !== false && field.field_key !== "numero_serie"),
    [technicalFields],
  );
  const serialAlreadyLinked = Boolean(selectedTypeId && technicalFieldLinks.some(link =>
    link.equipment_type_id === selectedTypeId
      && technicalFields.some(field =>
        field.id === link.technical_field_id && field.field_key === "numero_serie"
      ),
  ));

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
      }

      if (mode === "full" && (selectedFieldIds.length > 0 || includeSerial)) {
        await addQuickEquipmentExtraFields(type.id, selectedFieldIds, includeSerial);
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
        const normalizedModelName = cleanCatalogValue(modelName).toLocaleUpperCase("pt-BR");
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
    className="max-w-4xl"
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
                        setIncludeSerial(suggestSerialForEquipment(value));
                        setErrorMessage("");
                      }}
                      onSelect={(option) => {
                        setSelectedTypeId(option?.id || "");
                        setIncludeSerial(Boolean(option && (
                          suggestSerialForEquipment(option.name) ||
                          technicalFieldLinks.some(link =>
                            link.equipment_type_id === option.id
                              && technicalFields.some(field =>
                                field.id === link.technical_field_id && field.field_key === "numero_serie"
                              ),
                          )
                        )));
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
                        setModelName(value.toLocaleUpperCase("pt-BR"));
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

              {mode === "full" && typeReady && !typeConflict && (
                <div className="rounded-xl border border-border p-3 sm:p-5">
                  <div className="mb-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#5a6a82]">Campos extras do equipamento</p>
                    <p className="mt-1 text-[11px] leading-4 text-[#5a6a82] sm:text-xs">
                      Selecione os campos que aparecerão nas OS. NÚMERO DE SÉRIE é sugerido somente para equipamentos apropriados e pode ser incluído manualmente nos demais.
                      {selectedTypeId ? " Os campos já vinculados serão mantidos." : ""}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="flex min-w-0 items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft/50 px-3 py-2.5 text-sm font-bold text-[#0d1b2e]">
                      <Checkbox disabled={saving || serialAlreadyLinked}
                        checked={serialAlreadyLinked || includeSerial}
                        onCheckedChange={checked => setIncludeSerial(checked === true)} />
                      <span>NÚMERO DE SÉRIE{serialAlreadyLinked ? " · Já vinculado" : ""}</span>
                    </label>
                    {activeTechnicalFields.map(field => {
                      const alreadyLinked = selectedTypeId && technicalFieldLinks.some(link =>
                        link.equipment_type_id === selectedTypeId && link.technical_field_id === field.id
                      );
                      return <label key={field.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2.5 text-sm font-medium text-[#0d1b2e] transition hover:border-primary/25 hover:bg-primary-soft/50">
                        <Checkbox disabled={saving || Boolean(alreadyLinked)}
                          checked={Boolean(alreadyLinked) || selectedFieldIds.includes(field.id)}
                          onCheckedChange={checked => setSelectedFieldIds(current => checked === true
                            ? [...new Set([...current, field.id])]
                            : current.filter(id => id !== field.id))} />
                        <span className="min-w-0 break-words">{field.label}{alreadyLinked ? " · Já vinculado" : ""}</span>
                      </label>;
                    })}
                  </div>
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