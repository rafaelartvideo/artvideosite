import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Plus, Trash2, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { REFERENCE_DATA_CACHE_TIME } from "@/infrastructure/query/query-client";
import type { EquipmentDraft, EquipmentDraftModel, EquipmentTypeRow, TechnicalField } from "../domain/equipment";
import { createEquipmentBrandForTypes, loadEquipmentBrandDirectory, loadEquipmentCatalog, loadEquipmentServiceSettings, renameEquipmentBrandGroup, saveEquipmentHierarchy, saveTechnicalField, setEquipmentBrandGroupActive, setEquipmentTypeActive } from "../infrastructure/equipment.repository";
import type { EquipmentServiceSettings } from "../infrastructure/equipment.repository";
import { createGeneralService } from "@/features/general-services/infrastructure/general-services.repository";
import { EquipmentServiceSelector } from "./EquipmentServiceSelector";
import { brandKey, buildEquipmentBrandChoices, EquipmentBrandSelector, EquipmentBrandsDirectory } from "./EquipmentBrands";
import { EquipmentChecklistSection } from "./EquipmentChecklistSection";
import { AdminButton, AdminCard, AdminDialog, AdminIconButton, AdminPage, AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminActiveStateButton } from "@/shared/ui/admin/AdminActiveStateButton";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FCurrencyInput, FDecimalInput, FInput, FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { slugify } from "@/shared/domain/formatters";

type EquipmentAdminPanelProps = {
  onBack: () => void;
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
};

const normalizeCatalogName = brandKey;


export function EquipmentAdminPanel({ onBack, routeResourceId, routeSubpage, onRouteChange }: EquipmentAdminPanelProps) {
  const { hasPermission, activeOrganization, activeOrganizationId } = useAuth();
  const canView = hasPermission("equipment.view");
  const canViewTable = hasPermission("equipment.table.view");
  const canViewDetails = hasPermission("equipment.details.view");
  const canCreate = hasPermission("equipment.create");
  const canEdit = hasPermission("equipment.edit");
  const canToggleActive = hasPermission("equipment.toggle_active");
  const canDelete = hasPermission("equipment.delete");
  const canCreateGeneralService = hasPermission("general_services.create");
  const canViewFields = hasPermission("equipment.technical_fields.view");
  const canManageFields = hasPermission("equipment.technical_fields.manage");
  const showEquipment = hasPermission("equipment.table.equipment");
  const showBrands = hasPermission("equipment.table.brands");
  const showModels = hasPermission("equipment.table.models");
  const showStatus = hasPermission("equipment.table.status");
  const showActions = hasPermission("equipment.table.actions");
  const showFieldName = hasPermission("equipment.technical_fields.column.name");
  const showFieldType = hasPermission("equipment.technical_fields.column.type");
  const showFieldStatus = hasPermission("equipment.technical_fields.column.status");
  const showFieldActions = hasPermission("equipment.technical_fields.column.actions");
  const queryClient = useQueryClient();
  const catalogQuery = useQuery({ queryKey: queryKeys.equipment.catalog(), queryFn: loadEquipmentCatalog, enabled: canView && (canViewTable || canViewDetails || canCreate || canEdit || canViewFields || canManageFields), staleTime: REFERENCE_DATA_CACHE_TIME, gcTime: REFERENCE_DATA_CACHE_TIME });
  const brandDirectoryQuery = useQuery({
    queryKey: ["equipment", "brand-directory", activeOrganizationId, activeOrganization?.is_platform_operator === true],
    queryFn: () => loadEquipmentBrandDirectory(activeOrganization?.is_platform_operator === true, hasPermission("platform.catalog.view")),
    enabled: Boolean(activeOrganizationId && canView && (canViewTable || canCreate || canEdit)),
    staleTime: REFERENCE_DATA_CACHE_TIME,
  });
  const equipmentServicesQuery = useQuery({
    queryKey: ["equipment", "service-settings", activeOrganizationId],
    queryFn: loadEquipmentServiceSettings,
    enabled: Boolean(activeOrganizationId && canView && (canViewTable || canViewDetails || canCreate || canEdit)),
    staleTime: REFERENCE_DATA_CACHE_TIME,
  });
  const serviceSettings = equipmentServicesQuery.data;
  const catalog = catalogQuery.data;
  const types = catalog?.types ?? [];
  const brands = catalog?.brands ?? [];
  const models = catalog?.models ?? [];
  const technicalFields = catalog?.technicalFields ?? [];
  const brandChoices = buildEquipmentBrandChoices(brands, brandDirectoryQuery.data ?? []);
  const [drafts, setDrafts] = useState<EquipmentDraft[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [activeArea, setActiveArea] = useState<"registered" | "fields" | "brands">(routeResourceId === "brands" ? "brands" : routeResourceId === "fields" || routeResourceId === "new-field" || routeSubpage === "field" ? "fields" : "registered");
  const [fieldFormOpen, setFieldFormOpen] = useState(false);
  const [brandFormOpen, setBrandFormOpen] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [brandEquipmentIds, setBrandEquipmentIds] = useState<string[]>([]);
  const [brandError, setBrandError] = useState("");
  const [savingBrand, setSavingBrand] = useState(false);
  const [editingBrandName, setEditingBrandName] = useState<string | null>(null);
  const [editedBrandName, setEditedBrandName] = useState("");
  const [editBrandError, setEditBrandError] = useState("");
  const [savingBrandEdit, setSavingBrandEdit] = useState(false);
  const [busyBrand, setBusyBrand] = useState<string | null>(null);
  const [serviceDraftIndex, setServiceDraftIndex] = useState<number | null>(null);
  const [serviceForm, setServiceForm] = useState({ name: "", price: "", priceAtCompletion: false, maxDiscountPercentage: "", maxDiscountAmount: "" });
  const [serviceFormErrors, setServiceFormErrors] = useState<{ name?: string; price?: string; maxDiscountPercentage?: string; maxDiscountAmount?: string }>({});
  const [savingService, setSavingService] = useState(false);
  const [editingField, setEditingField] = useState<TechnicalField | null>(null);
  const [fieldForm, setFieldForm] = useState({ label: "", field_type: "text" as "text" | "number", is_active: true });
  const loading = catalogQuery.isPending;
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [hierarchyErrors, setHierarchyErrors] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<{ label?: string }>({});
  const [typePage, setTypePage] = useState(1);
  const [typePageSize, setTypePageSize] = useState(5);
  const [fieldPage, setFieldPage] = useState(1);
  const [fieldPageSize, setFieldPageSize] = useState(5);
  useEffect(() => { if (brandDirectoryQuery.error) setToast({ msg: `Erro ao carregar marcas: ${systemErrorMessage(brandDirectoryQuery.error)}`, type: "error" }); }, [brandDirectoryQuery.error]);

  useEffect(() => { if (catalogQuery.error) setToast({ msg: `Erro ao carregar equipamentos: ${systemErrorMessage(catalogQuery.error)}`, type: "error" }); }, [catalogQuery.error]);
  useEffect(() => { if (activeArea === "fields" && !canViewFields) setActiveArea("registered"); }, [activeArea, canViewFields]);
  const typeTotalPages = Math.max(1, Math.ceil(types.length / typePageSize));
  const safeTypePage = Math.min(typePage, typeTotalPages);
  const pagedTypes = types.slice((safeTypePage - 1) * typePageSize, safeTypePage * typePageSize);
  const fieldTotalPages = Math.max(1, Math.ceil(technicalFields.length / fieldPageSize));
  const safeFieldPage = Math.min(fieldPage, fieldTotalPages);
  const sortedTechnicalFields = [...technicalFields].sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
  const pagedFields = sortedTechnicalFields.slice((safeFieldPage - 1) * fieldPageSize, safeFieldPage * fieldPageSize);
  useEffect(() => { if (typePage > typeTotalPages) setTypePage(typeTotalPages); }, [typePage, typeTotalPages]);
  useEffect(() => { if (fieldPage > fieldTotalPages) setFieldPage(fieldTotalPages); }, [fieldPage, fieldTotalPages]);

  // Invalidações do cache são atualizações secundárias: não devem manter o
  // botão em "Salvando" após a confirmação da gravação pelo Supabase.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all });
    void queryClient.invalidateQueries({ queryKey: ["equipment", "service-settings", activeOrganizationId] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.checklists.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.orders.workspace() });
  };

  const makeDraft = (type?: EquipmentTypeRow): EquipmentDraft => ({
    id: type?.id,
    name: type?.name || "",
    is_active: type?.is_active ?? true,
    checklist_profile_id: type?.checklist_profile_id ?? null,
    checklistItems: (catalog?.equipmentChecklistItems ?? []).filter(item => item.equipment_type_id === type?.id).map(item => ({ ...item })),
    technicalFields: (catalog?.technicalFieldLinks ?? []).filter(link => link.equipment_type_id === type?.id).map(link => ({ technical_field_id: link.technical_field_id, required: link.required, sort_order: link.sort_order })),
    // A seleção usa os vínculos carregados, sem regravá-los até o usuário editar.
    brands: brands.filter(brand => brand.equipment_type_id === type?.id).map(brand => ({ id: brand.id, name: brand.name, is_active: brand.is_active, models: models.filter(model => model.equipment_brand_id === brand.id).map(model => ({ id: model.id, name: model.name, is_active: model.is_active })) })),
  });

  const openNew = () => { if (!canCreate) return; setServiceDraftIndex(null); setDrafts([makeDraft()]); setHierarchyErrors({}); setFieldFormOpen(false); setActiveArea("registered"); setFormOpen(true); };
  const openEdit = (type: EquipmentTypeRow) => { if (!(canViewDetails && canEdit)) return; setServiceDraftIndex(null); setDrafts([makeDraft(type)]); setHierarchyErrors({}); setFieldFormOpen(false); setActiveArea("registered"); setFormOpen(true); };
  const updateDraft = (index: number, value: Partial<EquipmentDraft>) => setDrafts(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item));
  const toggleDraftBrand = (ti: number, name: string, checked: boolean) => {
    setDrafts(current => current.map((type, index) => {
      if (index !== ti) return type;
      const existing = type.brands.find(brand => brandKey(brand.name) === brandKey(name));
      if (existing) {
        if (existing.id && !canEdit) return type;
        if (!existing.id && !canCreate) return type;
        return { ...type, brands: existing.id
          ? type.brands.map(brand => brand === existing ? { ...brand, is_active: checked } : brand)
          : checked ? type.brands.map(brand => brand === existing ? { ...brand, is_active: true } : brand)
            : type.brands.filter(brand => brand !== existing) };
      }
      if (!checked || !canCreate || !name.trim()) return type;
      return { ...type, brands: [...type.brands, { name: name.trim(), is_active: true, models: [] }] };
    }));
  };
  const addModel = (ti: number, bi: number) => canCreate && setDrafts(current => current.map((type, i) => i === ti ? { ...type, brands: type.brands.map((brand, j) => j === bi ? { ...brand, models: [...brand.models, { name: "", is_active: true }] } : brand) } : type));
  const updateModel = (ti: number, bi: number, mi: number, value: Partial<EquipmentDraftModel>) => setDrafts(current => current.map((type, i) => i === ti ? { ...type, brands: type.brands.map((brand, j) => j === bi ? { ...brand, models: brand.models.map((model, k) => k === mi ? { ...model, ...value } : model) } : brand) } : type));
  const removeModel = (ti: number, bi: number, mi: number) => setDrafts(current => current.map((type, i) => {
    if (i !== ti) return type;
    return { ...type, brands: type.brands.map((brand, j) => {
      if (j !== bi) return brand;
      const model = brand.models[mi];
      if (!model || (model.id ? !canDelete : !canCreate)) return brand;
      return { ...brand, models: brand.models.filter((_, k) => k !== mi) };
    }) };
  }));
  const updateTechnicalField = (ti: number, fieldId: string, checked: boolean) => { if (!canManageFields) return; setDrafts(current => current.map((type, i) => { if (i !== ti) return type; const existing = type.technicalFields.find(field => field.technical_field_id === fieldId); return { ...type, technicalFields: checked ? existing ? type.technicalFields : [...type.technicalFields, { technical_field_id: fieldId, required: false, sort_order: type.technicalFields.length * 10 }] : type.technicalFields.filter(field => field.technical_field_id !== fieldId) }; })); };
  const updateTechnicalFieldRequired = (ti: number, fieldId: string, required: boolean) => { if (!canManageFields) return; setDrafts(current => current.map((type, i) => i === ti ? { ...type, technicalFields: type.technicalFields.map(field => field.technical_field_id === fieldId ? { ...field, required } : field) } : type)); };
  const openNewField = () => { if (!canManageFields) return; setEditingField(null); setFieldForm({ label: "", field_type: "text", is_active: true }); setFormOpen(false); setActiveArea("fields"); setFieldFormOpen(true); };
  const openEditField = (field: TechnicalField) => { if (!canManageFields) return; setEditingField(field); setFieldForm({ label: field.label, field_type: field.field_type, is_active: field.is_active }); setFormOpen(false); setActiveArea("fields"); setFieldFormOpen(true); };
  const closeEditor = () => { setServiceDraftIndex(null); setFormOpen(false); setFieldFormOpen(false); onRouteChange?.(activeArea === "fields" ? "fields" : null, null); };
  const openNewPage = () => canCreate && (onRouteChange ? onRouteChange("new", null) : openNew());
  const openEditPage = (type: EquipmentTypeRow) => canViewDetails && canEdit && (onRouteChange ? onRouteChange(type.id, "edit") : openEdit(type));
  const openFieldsPage = () => { if (!canViewFields) return; if (onRouteChange) onRouteChange("fields", null); else setActiveArea("fields"); };
  const openBrandsPage = () => { if (!canViewTable) return; if (onRouteChange) onRouteChange("brands", null); else setActiveArea("brands"); };
  const openRegisteredPage = () => { if (onRouteChange) onRouteChange(null, null); else setActiveArea("registered"); };
  const openNewFieldPage = () => { if (canManageFields) openNewField(); };
  const openNewBrand = () => {
    if (!canCreate) return;
    setBrandName("");
    setBrandEquipmentIds([]);
    setBrandError("");
    setBrandFormOpen(true);
  };
  const closeBrandForm = () => { if (!savingBrand) setBrandFormOpen(false); };
  const saveBrand = async () => {
    if (!canCreate || !catalog || savingBrand) return;
    const name = brandName.trim().replace(/\s+/g, " ");
    if (!name) { setBrandError("Informe o nome da marca."); return; }
    if (brandChoices.some(item => brandKey(item.name) === brandKey(name))) {
      setBrandError("Esta marca já existe. Selecione-a no cadastro do equipamento.");
      return;
    }
    if (!brandEquipmentIds.length) { setBrandError("Selecione ao menos um equipamento."); return; }
    setSavingBrand(true);
    setBrandError("");
    try {
      await createEquipmentBrandForTypes(name, brandEquipmentIds, catalog);
      setBrandFormOpen(false);
      setToast({ msg: "Marca cadastrada com sucesso.", type: "success" });
      refresh();
    } catch (error) {
      setBrandError(systemErrorMessage(error, "Não foi possível cadastrar a marca."));
    } finally {
      setSavingBrand(false);
    }
  };
  const openEditBrand = (name: string) => {
    if (!canEdit || !brands.some(brand => brandKey(brand.name) === brandKey(name))) return;
    setEditingBrandName(name);
    setEditedBrandName(name);
    setEditBrandError("");
  };
  const closeEditBrand = () => { if (!savingBrandEdit) setEditingBrandName(null); };
  const saveEditedBrand = async () => {
    if (!canEdit || !catalog || !editingBrandName || savingBrandEdit) return;
    const name = editedBrandName.trim().replace(/\s+/g, " ");
    if (!name || name.length > 120) {
      setEditBrandError("Informe um nome de marca com até 120 caracteres.");
      return;
    }
    if (brands.some(brand => brandKey(brand.name) === brandKey(name) &&
      brandKey(brand.name) !== brandKey(editingBrandName))) {
      setEditBrandError("Já existe uma marca com esse nome nesta empresa.");
      return;
    }
    if (brands.filter(brand => brandKey(brand.name) === brandKey(editingBrandName))
      .every(brand => brand.name === name)) {
      setEditingBrandName(null);
      return;
    }
    setSavingBrandEdit(true);
    setEditBrandError("");
    try {
      await renameEquipmentBrandGroup(editingBrandName, name, catalog);
      setEditingBrandName(null);
      setToast({ msg: "Marca atualizada com sucesso.", type: "success" });
      refresh();
    } catch (error) {
      setEditBrandError(systemErrorMessage(error, "Não foi possível atualizar a marca."));
    } finally {
      setSavingBrandEdit(false);
    }
  };
  const toggleBrandActive = async (name: string, nextActive: boolean) => {
    if (!canEdit || !canToggleActive || busyBrand) return;
    const linkedBrands = brands.filter(brand => brandKey(brand.name) === brandKey(name));
    if (!linkedBrands.length) return;
    setBusyBrand(brandKey(name));
    try {
      await setEquipmentBrandGroupActive(linkedBrands.map(brand => brand.id), nextActive);
      setToast({ msg: nextActive ? "Marca ativada com sucesso." : "Marca inativada com sucesso.", type: "success" });
      refresh();
    } catch (error) {
      setToast({ msg: `Erro ao ${nextActive ? "ativar" : "inativar"} marca: ${systemErrorMessage(error)}`, type: "error" });
    } finally {
      setBusyBrand(null);
    }
  };

  const openNewService = (draftIndex: number) => {
    if (!canCreateGeneralService || !serviceSettings?.available || !(drafts[draftIndex]?.id ? canEdit : canCreate)) return;
    setServiceDraftIndex(draftIndex);
    setServiceForm({ name: "", price: "", priceAtCompletion: false, maxDiscountPercentage: "", maxDiscountAmount: "" });
    setServiceFormErrors({});
  };
  const closeNewService = () => { if (!savingService) setServiceDraftIndex(null); };
  const saveNewService = async () => {
    if (serviceDraftIndex === null || savingService || !canCreateGeneralService || !serviceSettings?.available) return;
    const name = serviceForm.name.trim().replace(/\s+/g, " ");
    const parsedPrice = serviceForm.priceAtCompletion || serviceForm.price === "" ? null : Number(serviceForm.price);
    const parsedPercentage = serviceForm.maxDiscountPercentage === "" ? null : Number(serviceForm.maxDiscountPercentage);
    const parsedAmount = serviceForm.maxDiscountAmount === "" ? null : Number(serviceForm.maxDiscountAmount);
    const errors: typeof serviceFormErrors = {};
    if (!name) errors.name = "Informe o nome do serviço.";
    else if (serviceSettings.services.some(service => normalizeCatalogName(service.name) === normalizeCatalogName(name))) errors.name = "Este Serviço Geral já está cadastrado. Selecione-o na lista.";
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) errors.price = "Informe um valor válido e não negativo.";
    if (parsedPercentage !== null && (!Number.isFinite(parsedPercentage) || parsedPercentage < 0 || parsedPercentage > 100)) errors.maxDiscountPercentage = "O desconto deve estar entre 0% e 100%.";
    if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) errors.maxDiscountAmount = "Informe um valor válido e não negativo.";
    setServiceFormErrors(errors);
    if (Object.keys(errors).length) return;
    setSavingService(true);
    try {
      const id = await createGeneralService({
        name, price: parsedPrice, price_at_completion: serviceForm.priceAtCompletion,
        max_discount_percentage: parsedPercentage, max_discount_amount: parsedAmount,
        is_active: true, sort_order: serviceSettings.services.length,
      });
      const selectedDraftIndex = serviceDraftIndex;
      const savedLinks = serviceSettings.links;
      setDrafts(current => current.map((draft, index) => {
        if (index !== selectedDraftIndex) return draft;
        const selectedIds = draft.serviceIds ?? savedLinks.filter(link => link.equipment_type_id === draft.id).map(link => link.general_service_id);
        return { ...draft, serviceIds: [...new Set([...selectedIds, id])] };
      }));
      queryClient.setQueryData<EquipmentServiceSettings>(["equipment", "service-settings", activeOrganizationId], previous =>
        previous ? { ...previous, services: [...previous.services, { id, name, is_active: true }] } : previous);
      setServiceDraftIndex(null);
      setToast({ msg: "Serviço cadastrado e selecionado. Salve o equipamento para confirmar o vínculo.", type: "success" });
      void queryClient.invalidateQueries({ queryKey: queryKeys.generalServices.all });
      void queryClient.invalidateQueries({ queryKey: ["equipment", "service-settings", activeOrganizationId] });
    } catch (error) {
      setToast({ msg: `Erro ao cadastrar serviço: ${systemErrorMessage(error)}`, type: "error" });
    } finally {
      setSavingService(false);
    }
  };

  const openEditFieldPage = (field: TechnicalField) => { if (canManageFields) openEditField(field); };

  useEffect(() => {
    if (!routeResourceId) { setActiveArea("registered"); if (formOpen) setFormOpen(false); if (fieldFormOpen) setFieldFormOpen(false); return; }
    if (routeResourceId === "fields") { setActiveArea("fields"); if (formOpen) setFormOpen(false); return; }
    if (routeResourceId === "brands") { setActiveArea("brands"); if (formOpen) setFormOpen(false); return; }
    if (routeResourceId === "new") { if (canCreate && !formOpen) openNew(); return; }
    if (routeResourceId === "new-field") { if (canManageFields && !fieldFormOpen) openNewField(); return; }
    if (routeSubpage === "edit") {
      const type = types.find(item => item.id === routeResourceId);
      if (type && canViewDetails && canEdit && (!formOpen || drafts[0]?.id !== type.id)) openEdit(type);
      return;
    }
    if (routeSubpage === "field") {
      const field = technicalFields.find(item => item.id === routeResourceId);
      if (field && canManageFields && (!fieldFormOpen || editingField?.id !== field.id)) openEditField(field);
    }
  }, [routeResourceId, routeSubpage, types, technicalFields, formOpen, fieldFormOpen, drafts, editingField?.id, canCreate, canViewDetails, canEdit, canManageFields]);

  const saveField = async () => {
    if (!canManageFields) return;
    const nextErrors: typeof fieldErrors = {};
    if (!fieldForm.label.trim()) nextErrors.label = "Informe o nome do campo.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (editingField
      && editingField.label === fieldForm.label.trim()
      && editingField.field_type === fieldForm.field_type
      && editingField.is_active === fieldForm.is_active) {
      closeEditor();
      setToast({ msg: "Nenhuma alteração necessária.", type: "success" });
      return;
    }
    setSaving(true);
    try {
      await saveTechnicalField({ id: editingField?.id, label: fieldForm.label, field_key: editingField?.field_key || slugify(fieldForm.label).replace(/-/g, "_"), field_type: fieldForm.field_type, is_active: fieldForm.is_active, sort_order: editingField?.sort_order ?? technicalFields.length * 10 });
      setToast({ msg: editingField ? "Campo atualizado." : "Campo cadastrado.", type: "success" });
      refresh();
      closeEditor();
    } catch (error) { setToast({ msg: `Erro ao salvar campo: ${systemErrorMessage(error)}`, type: "error" }); }
    finally { setSaving(false); }
  };

  const toggleField = async (field: TechnicalField) => {
    if (!canManageFields) return;
    try { await saveTechnicalField({ ...field, label: field.label, field_key: field.field_key, sort_order: field.sort_order, is_active: !field.is_active }); refresh(); }
    catch (error) { setToast({ msg: `Erro ao atualizar campo: ${systemErrorMessage(error)}`, type: "error" }); }
  };

  const toggleEquipmentActive = async (type: EquipmentTypeRow) => {
    if (!canToggleActive) return;
    try {
      await setEquipmentTypeActive(type.id, !type.is_active);
      setToast({ msg: type.is_active ? "Equipamento inativado com sucesso." : "Equipamento ativado com sucesso.", type: "success" });
      refresh();
    } catch (error) {
      setToast({ msg: `Erro ao ${type.is_active ? "inativar" : "ativar"} equipamento: ${systemErrorMessage(error)}`, type: "error" });
    }
  };

  const save = async () => {
    if (!catalog || !drafts.every(type => type.id ? canEdit : canCreate)) return;
    const nextErrors: Record<string, string> = {};
    const editingTypeIds = new Set(drafts.flatMap(type => type.id ? [type.id] : []));
    const existingEquipmentNames = new Set(catalog.types.filter(type => !editingTypeIds.has(type.id)).map(type => normalizeCatalogName(type.name)));
    const draftEquipmentNames = new Map<string, number>();

    drafts.forEach((draft, ti) => {
      const equipmentName = normalizeCatalogName(draft.name);
      if (!equipmentName) nextErrors[`type-${ti}`] = "Informe o nome do equipamento.";
      else if (existingEquipmentNames.has(equipmentName) || draftEquipmentNames.has(equipmentName)) {
        nextErrors[`type-${ti}`] = `Já existe um equipamento chamado "${draft.name.trim()}" nesta empresa.`;
        const previousIndex = draftEquipmentNames.get(equipmentName);
        if (previousIndex != null) nextErrors[`type-${previousIndex}`] = nextErrors[`type-${ti}`];
      } else {
        draftEquipmentNames.set(equipmentName, ti);
      }

      const brandNames = new Map<string, number>();
      draft.brands.forEach((brand, bi) => {
        const brandName = normalizeCatalogName(brand.name);
        if (!brandName) nextErrors[`brand-${ti}-${bi}`] = "Informe o nome da marca.";
        else if (brandNames.has(brandName)) {
          nextErrors[`brand-${ti}-${bi}`] = `A marca "${brand.name.trim()}" está duplicada neste equipamento.`;
          const previousIndex = brandNames.get(brandName);
          if (previousIndex != null) nextErrors[`brand-${ti}-${previousIndex}`] = nextErrors[`brand-${ti}-${bi}`];
        } else {
          brandNames.set(brandName, bi);
        }

        const modelNames = new Map<string, number>();
        brand.models.forEach((model, mi) => {
          const modelName = normalizeCatalogName(model.name);
          if (!modelName) nextErrors[`model-${ti}-${bi}-${mi}`] = "Informe o nome do modelo.";
          else if (modelNames.has(modelName)) {
            nextErrors[`model-${ti}-${bi}-${mi}`] = `O modelo "${model.name.trim()}" está duplicado nesta marca.`;
            const previousIndex = modelNames.get(modelName);
            if (previousIndex != null) nextErrors[`model-${ti}-${bi}-${previousIndex}`] = nextErrors[`model-${ti}-${bi}-${mi}`];
          } else {
            modelNames.set(modelName, mi);
          }
        });
      });

      if (draft.checklistItems.length && !draft.checklist_profile_id) {
        nextErrors[`checklist-${ti}-profile`] = "Selecione um perfil de checklist antes de adicionar itens específicos.";
      }
      const stageCodes = new Set(catalog.checklistStages.filter(stage => stage.profile_id === draft.checklist_profile_id).map(stage => stage.code));
      draft.checklistItems.forEach((item, ci) => {
        if (!item.title.trim()) nextErrors[`checklist-${ti}-${ci}-title`] = "Informe o título do item.";
        if (!stageCodes.has(item.stage_code)) nextErrors[`checklist-${ti}-${ci}-stage`] = "Selecione uma etapa válida.";
      });
    });

    setHierarchyErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      await saveEquipmentHierarchy(drafts, catalog);
      setToast({ msg: "Equipamentos salvos com sucesso.", type: "success" });
      refresh();
      setActiveArea("registered");
      setFormOpen(false);
      onRouteChange?.(null, null);
    } catch (error) { setToast({ msg: `Erro ao salvar estrutura: ${systemErrorMessage(error)}`, type: "error" }); }
    finally { setSaving(false); }
  };

  if (!canView) return null;
  const editorRouteActive = Boolean(routeResourceId && routeResourceId !== "fields" && routeResourceId !== "brands" && routeResourceId !== "new-field" && routeSubpage !== "field");
  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {!editorRouteActive && <><PageHeader title="Equipamentos Técnicos" subtitle="Cadastre equipamentos, vincule marcas e organize os modelos" />
    <div className="flex gap-1 border-b border-[#0d1b2e]/10">{canViewTable && <button type="button" onClick={openRegisteredPage} className={`cursor-default border-b-2 px-4 py-2.5 text-xs font-bold ${activeArea === "registered" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82]"}`}>Cadastrados</button>}{canViewFields && <button type="button" onClick={openFieldsPage} className={`cursor-default border-b-2 px-4 py-2.5 text-xs font-bold ${activeArea === "fields" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82]"}`}>Campos Extras</button>}{canViewTable && <button type="button" onClick={openBrandsPage} className={`cursor-default border-b-2 px-4 py-2.5 text-xs font-bold ${activeArea === "brands" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82]"}`}>Marcas</button>}</div>
    {activeArea === "registered" && canViewTable ? <AdminCard>{loading ? <LoadingState /> : types.length === 0 ? <EmptyState icon={Wrench} title="Nenhum equipamento cadastrado" message="Cadastre o primeiro equipamento com suas marcas e modelos." /> : <><div className="overflow-x-auto"><table className="min-w-[680px]"><thead><tr>{showEquipment && <th className="text-left">Equipamento</th>}{showBrands && <th className="text-left">Marcas</th>}{showModels && <th className="text-left">Modelos</th>}{showStatus && <th className="text-left">Status</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{pagedTypes.map(type => { const typeBrands = brands.filter(brand => brand.equipment_type_id === type.id); const brandIds = new Set(typeBrands.map(brand => brand.id)); const modelCount = models.filter(model => brandIds.has(model.equipment_brand_id)).length; return <tr key={type.id}>{showEquipment && <td className="font-bold text-[#0d1b2e]"><span>{type.name}</span></td>}{showBrands && <td className="text-xs text-[#5a6a82]">{typeBrands.length}</td>}{showModels && <td className="text-xs text-[#5a6a82]">{modelCount}</td>}{showStatus && <td><StatusBadge status={type.is_active ? "Ativo" : "Inativo"} /></td>}{showActions && <td><div className="flex justify-end gap-1">{canViewDetails && canEdit && <AdminIconButton ariaLabel="Editar equipamento" title="Editar equipamento" onClick={() => openEditPage(type)}><Edit2 size={14} /></AdminIconButton>}{canToggleActive && <AdminActiveStateButton active={type.is_active} entityLabel="equipamento" onClick={() => void toggleEquipmentActive(type)} iconSize={14} />}</div></td>}</tr>; })}</tbody></table></div><PaginationBar page={safeTypePage} pageSize={typePageSize} totalItems={types.length} onPageChange={setTypePage} onPageSizeChange={size => { setTypePageSize(size); setTypePage(1); }} /></>}</AdminCard> : activeArea === "fields" && canViewFields ? <AdminCard>{loading ? <LoadingState /> : technicalFields.length === 0 ? <EmptyState icon={Wrench} title="Nenhum campo extra cadastrado" message="Cadastre o primeiro campo extra." /> : <><div className="overflow-x-auto"><table className="min-w-[680px]"><thead><tr>{showFieldName && <th className="text-left">Campo</th>}{showFieldType && <th className="text-left">Tipo</th>}{showFieldStatus && <th className="text-left">Status</th>}{showFieldActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{pagedFields.map(field => <tr key={field.id}>{showFieldName && <td className="font-bold text-[#0d1b2e]"><span>{field.label}</span></td>}{showFieldType && <td className="text-xs text-[#5a6a82]">{field.field_type === "number" ? "Número" : "Texto"}</td>}{showFieldStatus && <td><StatusBadge status={field.is_active ? "Ativo" : "Inativo"} /></td>}{showFieldActions && <td><div className="flex justify-end gap-1">{canManageFields && <><AdminIconButton ariaLabel="Editar campo" title="Editar campo" onClick={() => openEditFieldPage(field)}><Edit2 size={14} /></AdminIconButton><AdminActiveStateButton active={field.is_active} entityLabel="campo" onClick={() => void toggleField(field)} iconSize={14} /></>}</div></td>}</tr>)}</tbody></table></div><PaginationBar page={safeFieldPage} pageSize={fieldPageSize} totalItems={technicalFields.length} onPageChange={setFieldPage} onPageSizeChange={size => { setFieldPageSize(size); setFieldPage(1); }} /></>}</AdminCard> : activeArea === "brands" && canViewTable ? <EquipmentBrandsDirectory choices={brandChoices} brands={brands} types={types}
        onEditBrand={canEdit ? openEditBrand : undefined}
        onToggleBrand={canEdit && canToggleActive ? (name, nextActive) => { void toggleBrandActive(name, nextActive); } : undefined}
        busyBrand={busyBrand} /> : null}
    <AdminStickyToolbar>
      <BtnSecondary onClick={onBack}>Voltar</BtnSecondary>
      {activeArea === "registered" ? canCreate && <BtnPrimary onClick={openNewPage}>Novo</BtnPrimary>
        : activeArea === "fields" && canManageFields ? <BtnPrimary onClick={openNewFieldPage}>Novo</BtnPrimary>
        : activeArea === "brands" && canCreate ? <BtnPrimary onClick={openNewBrand}>Novo</BtnPrimary> : null}
    </AdminStickyToolbar></>}
    {editorRouteActive && !formOpen && !fieldFormOpen && <AdminCard className="p-8"><LoadingState /></AdminCard>}
    <AdminPage open={formOpen} onClose={closeEditor} breadcrumb="Equipamentos Técnicos" title="Cadastro de equipamentos" subtitle="Monte equipamento, marcas e modelos antes de salvar"><div className="space-y-5 p-4 sm:p-5">{drafts.map((type, ti) => <div key={`${type.id || "new"}-${ti}`} className="space-y-4"><Section title="Equipamento"><div className="space-y-5"><div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><FInput label="Nome do equipamento" required error={hierarchyErrors[`type-${ti}`]} value={type.name} onChange={(e: any) => { setHierarchyErrors(current => ({ ...current, [`type-${ti}`]: undefined as any })); updateDraft(ti, { name: e.target.value }); }} placeholder="Ex: Televisão" /><div className="flex items-center gap-2">{type.id && <FToggle label="Equipamento ativo" disabled={!canToggleActive} checked={type.is_active} onChange={is_active => updateDraft(ti, { is_active })} />}{drafts.length > 1 && canDelete && <button type="button" onClick={() => setDrafts(current => current.filter((_, i) => i !== ti))} className="cursor-default rounded-lg p-2.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>}</div></div><EquipmentServiceSelector
  services={serviceSettings?.services ?? []}
  selectedIds={type.serviceIds ?? (serviceSettings?.links.filter(link => link.equipment_type_id === type.id).map(link => link.general_service_id) ?? [])}
  loading={equipmentServicesQuery.isPending}
  error={equipmentServicesQuery.error ? systemErrorMessage(equipmentServicesQuery.error, "Não foi possível carregar os vínculos de serviços.") : null}
  disabled={saving || !(type.id ? canEdit : canCreate) || !serviceSettings || !serviceSettings.available}
  available={Boolean(serviceSettings?.available)}
  onRetry={() => { void queryClient.invalidateQueries({ queryKey: ["equipment", "service-settings", activeOrganizationId] }); }}
  onCreate={canCreateGeneralService && (type.id ? canEdit : canCreate) ? () => openNewService(ti) : undefined}
  onChange={serviceIds => updateDraft(ti, { serviceIds })}
/>{canViewFields && <div className="border-t border-[#0d1b2e]/8 pt-4"><div className="mb-1 text-[10px] font-black uppercase tracking-wider text-[#8a98aa]">Campos Extras</div><div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">{technicalFields.filter(field => field.is_active || type.technicalFields.some(link => link.technical_field_id === field.id)).sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" })).map(field => { const link = type.technicalFields.find(item => item.technical_field_id === field.id); return <div key={field.id} className="border-b border-[#0d1b2e]/8 py-3"><div className="flex min-w-0 items-start gap-3 text-left"><Checkbox disabled={!canManageFields} checked={Boolean(link)} onCheckedChange={checked => updateTechnicalField(ti, field.id, checked === true)} /><span className="min-w-0 flex-1"><span className="block text-xs font-bold text-[#0d1b2e]">{field.label}</span>{link && <label className="mt-2 flex cursor-default items-center gap-2 text-[11px] text-[#5a6a82]"><Checkbox disabled={!canManageFields} checked={link.required} onCheckedChange={checked => updateTechnicalFieldRequired(ti, field.id, checked === true)} />Obrigatório</label>}</span></div></div>; })}</div></div>}{catalog && <EquipmentChecklistSection
  draft={type}
  catalog={catalog}
  onChange={patch => updateDraft(ti, patch)}
  errorFor={(field, ci) => field === "profile"
    ? hierarchyErrors[`checklist-${ti}-profile`]
    : hierarchyErrors[`checklist-${ti}-${ci}-${field}`]}
  clearError={(field, ci) => {
    const key = field === "profile"
      ? `checklist-${ti}-profile`
      : `checklist-${ti}-${ci}-${field}`;
    setHierarchyErrors(current => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }}
/>}</div></Section><Section title="Marcas e modelos"><EquipmentBrandSelector
  draft={type}
  choices={brandChoices}
  canEdit={canEdit}
  canCreate={canCreate}
  canDelete={canDelete}
  onToggleBrand={(name, checked) => toggleDraftBrand(ti, name, checked)}
  onAddModel={bi => addModel(ti, bi)}
  onUpdateModel={(bi, mi, patch) => updateModel(ti, bi, mi, patch)}
  onRemoveModel={(bi, mi) => removeModel(ti, bi, mi)}
  errorFor={(bi, mi) => hierarchyErrors[mi == null ? `brand-${ti}-${bi}` : `model-${ti}-${bi}-${mi}`]}
  clearError={(bi, mi) => {
    const key = mi == null ? `brand-${ti}-${bi}` : `model-${ti}-${bi}-${mi}`;
    setHierarchyErrors(current => ({ ...current, [key]: undefined as any }));
  }}
/></Section></div>)}</div><div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={closeEditor}>Cancelar</BtnSecondary><BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary></div></AdminPage>
    <AdminDialog
      open={serviceDraftIndex !== null && formOpen && canCreateGeneralService}
      onClose={closeNewService}
      title="Novo Serviço Geral"
      className="max-w-lg"
      minimizable={!savingService}
      footer={<div className="flex justify-end gap-2">
        <BtnSecondary onClick={closeNewService} disabled={savingService}>Cancelar</BtnSecondary>
        <BtnPrimary onClick={() => void saveNewService()} loading={savingService} loadingText="Salvando...">Cadastrar e vincular</BtnPrimary>
      </div>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FInput label="Nome do serviço" required disabled={savingService} value={serviceForm.name}
            error={serviceFormErrors.name}
            onChange={(event: any) => { setServiceForm(current => ({ ...current, name: event.target.value })); setServiceFormErrors(current => ({ ...current, name: undefined })); }} />
        </div>
        <div className="sm:col-span-2">
          <FToggle label="Definir valor na conclusão da OS" disabled={savingService} checked={serviceForm.priceAtCompletion}
            onChange={value => setServiceForm(current => ({ ...current, priceAtCompletion: value, price: value ? "" : current.price }))} />
        </div>
        <FCurrencyInput label="Valor" disabled={savingService || serviceForm.priceAtCompletion} value={serviceForm.priceAtCompletion ? "" : serviceForm.price}
          error={serviceFormErrors.price} onChange={(event: any) => { setServiceForm(current => ({ ...current, price: event.target.value })); setServiceFormErrors(current => ({ ...current, price: undefined })); }} />
        <FDecimalInput label="Desconto máximo (%)" disabled={savingService} decimalPlaces={2} value={serviceForm.maxDiscountPercentage}
          error={serviceFormErrors.maxDiscountPercentage} onChange={(event: any) => { setServiceForm(current => ({ ...current, maxDiscountPercentage: event.target.value })); setServiceFormErrors(current => ({ ...current, maxDiscountPercentage: undefined })); }} />
        <FCurrencyInput label="Desconto máximo (R$)" disabled={savingService} value={serviceForm.maxDiscountAmount}
          error={serviceFormErrors.maxDiscountAmount} onChange={(event: any) => { setServiceForm(current => ({ ...current, maxDiscountAmount: event.target.value })); setServiceFormErrors(current => ({ ...current, maxDiscountAmount: undefined })); }} />
      </div>
    </AdminDialog>
    <AdminDialog
      open={editingBrandName !== null && canEdit}
      onClose={closeEditBrand}
      title="Editar marca"
      className="max-w-lg"
      minimizable={!savingBrandEdit}
      footer={<div className="flex justify-end gap-2">
        <BtnSecondary onClick={closeEditBrand} disabled={savingBrandEdit}>Cancelar</BtnSecondary>
        <BtnPrimary onClick={() => void saveEditedBrand()} loading={savingBrandEdit} loadingText="Salvando...">Salvar</BtnPrimary>
      </div>}
    >
      <div className="space-y-3">
        <FInput label="Nome da marca" required value={editedBrandName} maxLength={120}
          disabled={savingBrandEdit} error={editBrandError}
          onChange={(event: any) => { setEditedBrandName(event.target.value); setEditBrandError(""); }} />
        <div className="text-xs text-muted-foreground">
          Equipamentos: {editingBrandName ? [...new Set(brands
            .filter(brand => brandKey(brand.name) === brandKey(editingBrandName))
            .map(brand => types.find(type => type.id === brand.equipment_type_id)?.name)
            .filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "pt-BR")).join(", ") : "—"}
        </div>
      </div>
    </AdminDialog>
    <AdminDialog
      open={brandFormOpen && canCreate}
      onClose={closeBrandForm}
      title="Nova marca"
      className="max-w-lg"
      minimizable={!savingBrand}
      footer={<div className="flex justify-end gap-2">
        <BtnSecondary onClick={closeBrandForm} disabled={savingBrand}>Cancelar</BtnSecondary>
        <BtnPrimary onClick={() => void saveBrand()} loading={savingBrand} loadingText="Salvando...">Salvar</BtnPrimary>
      </div>}
    >
      <div className="space-y-4">
        <FInput label="Nome da marca" required value={brandName} maxLength={120}
          onChange={(event: any) => { setBrandName(event.target.value); setBrandError(""); }}
          placeholder="Nome da marca" />
        <div>
          <p className="mb-2 text-xs font-bold text-foreground">Equipamentos</p>
          <div className="grid max-h-64 grid-cols-1 gap-x-4 overflow-y-auto border-y border-border sm:grid-cols-2">
            {types.filter(type => type.is_active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })).map(type => (
              <label key={type.id} className="flex cursor-pointer items-center gap-3 border-b border-border py-3 text-xs text-foreground">
                <Checkbox checked={brandEquipmentIds.includes(type.id)} disabled={savingBrand}
                  onCheckedChange={checked => {
                    setBrandEquipmentIds(current => checked === true
                      ? [...new Set([...current, type.id])]
                      : current.filter(id => id !== type.id));
                    setBrandError("");
                  }} />
                <span className="min-w-0 flex-1 font-semibold">{type.name}</span>
              </label>
            ))}
            {types.every(type => !type.is_active) && <p className="py-3 text-xs text-muted-foreground">Cadastre um equipamento antes de adicionar marcas.</p>}
          </div>
        </div>
        {brandError && <p role="alert" className="text-xs text-red-600">{brandError}</p>}
      </div>
    </AdminDialog>
    <AdminDialog
      open={fieldFormOpen && canManageFields}
      onClose={() => { if (!saving) closeEditor(); }}
      title={editingField ? "Editar campo extra" : "Novo campo extra"}
      description="Defina o nome, tipo e situação do campo. A chave técnica será gerada automaticamente."
      className="max-w-lg"
      minimizable={!saving}
      footer={<div className="flex justify-end gap-2">
        <BtnSecondary onClick={closeEditor} disabled={saving}>Cancelar</BtnSecondary>
        <BtnPrimary onClick={() => void saveField()} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>
      </div>}
    >
      <div className="space-y-4">
        <FInput label="Nome" required error={fieldErrors.label}
          value={fieldForm.label} onChange={(e: any) => {
            setFieldErrors(current => ({ ...current, label: undefined }));
            setFieldForm(current => ({ ...current, label: e.target.value }));
          }} />
        <FSelect label="Tipo" value={fieldForm.field_type}
          onChange={(e: any) => setFieldForm(current => ({ ...current, field_type: e.target.value }))}
          options={[{ value: "text", label: "Texto" }, { value: "number", label: "Número" }]} />
        <FToggle label="Ativo" checked={fieldForm.is_active}
          onChange={is_active => setFieldForm(current => ({ ...current, is_active }))} />
      </div>
    </AdminDialog>
  </div>;
}
