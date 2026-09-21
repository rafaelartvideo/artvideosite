import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Plus, Trash2, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import type { EquipmentDraft, EquipmentDraftBrand, EquipmentDraftModel, EquipmentTypeRow, TechnicalField } from "../domain/equipment";
import { loadEquipmentCatalog, saveEquipmentHierarchy, saveTechnicalField, setEquipmentTypeActive } from "../infrastructure/equipment.repository";
import { EquipmentChecklistSection } from "./EquipmentChecklistSection";
import { AdminButton, AdminCard, AdminCardHeader, AdminIconButton, AdminPage, BtnPrimary, BtnSecondary, InternalBackButton, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminActiveStateButton } from "@/shared/ui/admin/AdminActiveStateButton";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FInput, FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { slugify } from "@/shared/domain/formatters";

type EquipmentAdminPanelProps = {
  onBack: () => void;
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
};

const normalizeCatalogName = (value: string) => value.trim().replace(/\\s+/g, " ").toLocaleLowerCase("pt-BR");

const findDuplicateName = (values: string[]) => {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeCatalogName(value);
    if (!normalized) continue;
    if (seen.has(normalized)) return value.trim();
    seen.add(normalized);
  }
  return null;
};

export function EquipmentAdminPanel({ onBack, routeResourceId, routeSubpage, onRouteChange }: EquipmentAdminPanelProps) {
  const { hasPermission } = useAuth();
  const canView = hasPermission("equipment.view");
  const canViewTable = hasPermission("equipment.table.view");
  const canViewDetails = hasPermission("equipment.details.view");
  const canCreate = hasPermission("equipment.create");
  const canEdit = hasPermission("equipment.edit");
  const canToggleActive = hasPermission("equipment.toggle_active");
  const canDelete = hasPermission("equipment.delete");
  const canViewFields = hasPermission("equipment.technical_fields.view");
  const canManageFields = hasPermission("equipment.technical_fields.manage");
  const showEquipment = hasPermission("equipment.table.equipment");
  const showBrands = hasPermission("equipment.table.brands");
  const showModels = hasPermission("equipment.table.models");
  const showStatus = hasPermission("equipment.table.status");
  const showActions = hasPermission("equipment.table.actions");
  const showFieldName = hasPermission("equipment.technical_fields.column.name");
  const showFieldKey = hasPermission("equipment.technical_fields.column.key");
  const showFieldType = hasPermission("equipment.technical_fields.column.type");
  const showFieldStatus = hasPermission("equipment.technical_fields.column.status");
  const showFieldActions = hasPermission("equipment.technical_fields.column.actions");
  const queryClient = useQueryClient();
  const catalogQuery = useQuery({ queryKey: queryKeys.equipment.catalog(), queryFn: loadEquipmentCatalog, enabled: canView && (canViewTable || canViewDetails || canCreate || canEdit || canViewFields || canManageFields) });
  const catalog = catalogQuery.data;
  const types = catalog?.types ?? [];
  const brands = catalog?.brands ?? [];
  const models = catalog?.models ?? [];
  const technicalFields = catalog?.technicalFields ?? [];
  const [drafts, setDrafts] = useState<EquipmentDraft[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [activeArea, setActiveArea] = useState<"registered" | "fields">(routeResourceId === "fields" || routeResourceId === "new-field" || routeSubpage === "field" ? "fields" : "registered");
  const [fieldFormOpen, setFieldFormOpen] = useState(false);
  const [editingField, setEditingField] = useState<TechnicalField | null>(null);
  const [fieldForm, setFieldForm] = useState({ label: "", field_key: "", field_type: "text" as "text" | "number", is_active: true });
  const loading = catalogQuery.isPending;
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [typePage, setTypePage] = useState(1);
  const [typePageSize, setTypePageSize] = useState(5);
  const [fieldPage, setFieldPage] = useState(1);
  const [fieldPageSize, setFieldPageSize] = useState(5);

  useEffect(() => { if (catalogQuery.error) setToast({ msg: `Erro ao carregar equipamentos: ${catalogQuery.error instanceof Error ? catalogQuery.error.message : String(catalogQuery.error)}`, type: "error" }); }, [catalogQuery.error]);
  useEffect(() => { if (activeArea === "fields" && !canViewFields) setActiveArea("registered"); }, [activeArea, canViewFields]);
  const typeTotalPages = Math.max(1, Math.ceil(types.length / typePageSize));
  const safeTypePage = Math.min(typePage, typeTotalPages);
  const pagedTypes = types.slice((safeTypePage - 1) * typePageSize, safeTypePage * typePageSize);
  const fieldTotalPages = Math.max(1, Math.ceil(technicalFields.length / fieldPageSize));
  const safeFieldPage = Math.min(fieldPage, fieldTotalPages);
  const pagedFields = technicalFields.slice((safeFieldPage - 1) * fieldPageSize, safeFieldPage * fieldPageSize);
  useEffect(() => { if (typePage > typeTotalPages) setTypePage(typeTotalPages); }, [typePage, typeTotalPages]);
  useEffect(() => { if (fieldPage > fieldTotalPages) setFieldPage(fieldTotalPages); }, [fieldPage, fieldTotalPages]);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.checklists.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
  ]);

  const makeDraft = (type?: EquipmentTypeRow): EquipmentDraft => ({
    id: type?.id,
    name: type?.name || "",
    is_active: type?.is_active ?? true,
    checklist_profile_id: type?.checklist_profile_id ?? null,
    checklistItems: (catalog?.equipmentChecklistItems ?? []).filter(item => item.equipment_type_id === type?.id).map(item => ({ ...item })),
    technicalFields: (catalog?.technicalFieldLinks ?? []).filter(link => link.equipment_type_id === type?.id).map(link => ({ technical_field_id: link.technical_field_id, required: link.required, sort_order: link.sort_order })),
    brands: brands.filter(brand => brand.equipment_type_id === type?.id).map(brand => ({ id: brand.id, name: brand.name, is_active: brand.is_active, models: models.filter(model => model.equipment_brand_id === brand.id).map(model => ({ id: model.id, name: model.name, is_active: model.is_active })) })),
  });

  const openNew = () => { if (!canCreate) return; setDrafts([makeDraft()]); setFieldFormOpen(false); setActiveArea("registered"); setFormOpen(true); };
  const openEdit = (type: EquipmentTypeRow) => { if (!(canViewDetails && canEdit)) return; setDrafts([makeDraft(type)]); setFieldFormOpen(false); setActiveArea("registered"); setFormOpen(true); };
  const addEquipment = () => canCreate && setDrafts(current => [...current, makeDraft()]);
  const updateDraft = (index: number, value: Partial<EquipmentDraft>) => setDrafts(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item));
  const addBrand = (ti: number) => canCreate && setDrafts(current => current.map((type, i) => i === ti ? { ...type, brands: [...type.brands, { name: "", is_active: true, models: [{ name: "", is_active: true }] }] } : type));
  const updateBrand = (ti: number, bi: number, value: Partial<EquipmentDraftBrand>) => setDrafts(current => current.map((type, i) => i === ti ? { ...type, brands: type.brands.map((brand, j) => j === bi ? { ...brand, ...value } : brand) } : type));
  const removeBrand = (ti: number, bi: number) => canDelete && setDrafts(current => current.map((type, i) => i === ti ? { ...type, brands: type.brands.filter((_, j) => j !== bi) } : type));
  const addModel = (ti: number, bi: number) => canCreate && setDrafts(current => current.map((type, i) => i === ti ? { ...type, brands: type.brands.map((brand, j) => j === bi ? { ...brand, models: [...brand.models, { name: "", is_active: true }] } : brand) } : type));
  const updateModel = (ti: number, bi: number, mi: number, value: Partial<EquipmentDraftModel>) => setDrafts(current => current.map((type, i) => i === ti ? { ...type, brands: type.brands.map((brand, j) => j === bi ? { ...brand, models: brand.models.map((model, k) => k === mi ? { ...model, ...value } : model) } : brand) } : type));
  const removeModel = (ti: number, bi: number, mi: number) => canDelete && setDrafts(current => current.map((type, i) => i === ti ? { ...type, brands: type.brands.map((brand, j) => j === bi ? { ...brand, models: brand.models.filter((_, k) => k !== mi) } : brand) } : type));
  const updateTechnicalField = (ti: number, fieldId: string, checked: boolean) => { if (!canManageFields) return; setDrafts(current => current.map((type, i) => { if (i !== ti) return type; const existing = type.technicalFields.find(field => field.technical_field_id === fieldId); return { ...type, technicalFields: checked ? existing ? type.technicalFields : [...type.technicalFields, { technical_field_id: fieldId, required: false, sort_order: type.technicalFields.length * 10 }] : type.technicalFields.filter(field => field.technical_field_id !== fieldId) }; })); };
  const updateTechnicalFieldRequired = (ti: number, fieldId: string, required: boolean) => { if (!canManageFields) return; setDrafts(current => current.map((type, i) => i === ti ? { ...type, technicalFields: type.technicalFields.map(field => field.technical_field_id === fieldId ? { ...field, required } : field) } : type)); };
  const openNewField = () => { if (!canManageFields) return; setEditingField(null); setFieldForm({ label: "", field_key: "", field_type: "text", is_active: true }); setFormOpen(false); setActiveArea("fields"); setFieldFormOpen(true); };
  const openEditField = (field: TechnicalField) => { if (!canManageFields) return; setEditingField(field); setFieldForm({ label: field.label, field_key: field.field_key, field_type: field.field_type, is_active: field.is_active }); setFormOpen(false); setActiveArea("fields"); setFieldFormOpen(true); };
  const closeEditor = () => { setFormOpen(false); setFieldFormOpen(false); onRouteChange?.(activeArea === "fields" ? "fields" : null, null); };
  const openNewPage = () => canCreate && (onRouteChange ? onRouteChange("new", null) : openNew());
  const openEditPage = (type: EquipmentTypeRow) => canViewDetails && canEdit && (onRouteChange ? onRouteChange(type.id, "edit") : openEdit(type));
  const openFieldsPage = () => { if (!canViewFields) return; if (onRouteChange) onRouteChange("fields", null); else setActiveArea("fields"); };
  const openRegisteredPage = () => { if (onRouteChange) onRouteChange(null, null); else setActiveArea("registered"); };
  const openNewFieldPage = () => canManageFields && (onRouteChange ? onRouteChange("new-field", null) : openNewField());
  const openEditFieldPage = (field: TechnicalField) => canManageFields && (onRouteChange ? onRouteChange(field.id, "field") : openEditField(field));

  useEffect(() => {
    if (!routeResourceId) { setActiveArea("registered"); if (formOpen) setFormOpen(false); if (fieldFormOpen) setFieldFormOpen(false); return; }
    if (routeResourceId === "fields") { setActiveArea("fields"); if (formOpen) setFormOpen(false); if (fieldFormOpen) setFieldFormOpen(false); return; }
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
    if (!fieldForm.label.trim() || (!editingField && !fieldForm.field_key)) { setToast({ msg: "Informe o nome do campo.", type: "error" }); return; }
    setSaving(true);
    try {
      await saveTechnicalField({ id: editingField?.id, label: fieldForm.label, field_key: editingField?.field_key || slugify(fieldForm.label).replace(/-/g, "_"), field_type: fieldForm.field_type, is_active: fieldForm.is_active, sort_order: editingField?.sort_order ?? technicalFields.length * 10 });
      setToast({ msg: editingField ? "Campo atualizado." : "Campo cadastrado.", type: "success" });
      await refresh();
      closeEditor();
    } catch (error) { setToast({ msg: `Erro ao salvar campo: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); }
    finally { setSaving(false); }
  };

  const toggleField = async (field: TechnicalField) => {
    if (!canManageFields) return;
    try { await saveTechnicalField({ ...field, label: field.label, field_key: field.field_key, sort_order: field.sort_order, is_active: !field.is_active }); await refresh(); }
    catch (error) { setToast({ msg: `Erro ao atualizar campo: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); }
  };

  const toggleEquipmentActive = async (type: EquipmentTypeRow) => {
    if (!canToggleActive) return;
    try {
      await setEquipmentTypeActive(type.id, !type.is_active);
      setToast({ msg: type.is_active ? "Equipamento inativado com sucesso." : "Equipamento ativado com sucesso.", type: "success" });
      await refresh();
    } catch (error) {
      setToast({ msg: `Erro ao ${type.is_active ? "inativar" : "ativar"} equipamento: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    }
  };

  const save = async () => {
    if (!catalog || !drafts.every(type => type.id ? canEdit : canCreate)) return;
    if (drafts.some(type => !type.name.trim() || type.brands.some(brand => !brand.name.trim() || brand.models.some(model => !model.name.trim())))) { setToast({ msg: "Preencha equipamento, marcas e modelos antes de salvar.", type: "error" }); return; }

    const editingTypeIds = new Set(drafts.flatMap(type => type.id ? [type.id] : []));
    const existingEquipmentNames = new Set(catalog.types.filter(type => !editingTypeIds.has(type.id)).map(type => normalizeCatalogName(type.name)));
    const draftEquipmentNames = new Set<string>();

    for (const draft of drafts) {
      const equipmentName = normalizeCatalogName(draft.name);
      if (existingEquipmentNames.has(equipmentName) || draftEquipmentNames.has(equipmentName)) {
        setToast({ msg: `Já existe um equipamento chamado "${draft.name.trim()}" nesta empresa.`, type: "error" });
        return;
      }
      draftEquipmentNames.add(equipmentName);

      const duplicateBrand = findDuplicateName(draft.brands.map(brand => brand.name));
      if (duplicateBrand) {
        setToast({ msg: `Já existe a marca "${duplicateBrand}" neste equipamento.`, type: "error" });
        return;
      }

      for (const brand of draft.brands) {
        const duplicateModel = findDuplicateName(brand.models.map(model => model.name));
        if (duplicateModel) {
          setToast({ msg: `Já existe o modelo "${duplicateModel}" na marca "${brand.name.trim()}".`, type: "error" });
          return;
        }
      }

      if (draft.checklistItems.some(item => !item.title.trim())) { setToast({ msg: `Preencha todos os itens adicionais do checklist de ${draft.name || "equipamento"}.`, type: "error" }); return; }
      if (draft.checklistItems.length && !draft.checklist_profile_id) { setToast({ msg: "Selecione um perfil de checklist antes de adicionar itens específicos.", type: "error" }); return; }
      const stageCodes = new Set(catalog.checklistStages.filter(stage => stage.profile_id === draft.checklist_profile_id).map(stage => stage.code));
      if (draft.checklistItems.some(item => !stageCodes.has(item.stage_code))) { setToast({ msg: `Remapeie os itens adicionais de ${draft.name} para uma etapa válida.`, type: "error" }); return; }
    }
    setSaving(true);
    try {
      await saveEquipmentHierarchy(drafts, catalog);
      setToast({ msg: "Equipamentos salvos com sucesso.", type: "success" });
      await refresh();
      setActiveArea("registered");
      setFormOpen(false);
      onRouteChange?.(null, null);
    } catch (error) { setToast({ msg: `Erro ao salvar estrutura: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); }
    finally { setSaving(false); }
  };

  if (!canView) return null;
  const editorRouteActive = Boolean(routeResourceId && routeResourceId !== "fields");
  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {!editorRouteActive && <><PageHeader title="Equipamentos Técnicos" subtitle="Cadastro hierárquico usado nas ordens de serviço" actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{activeArea === "registered" && canCreate && <AdminButton onClick={openNewPage} className="text-xs"><Plus size={15} /> Novo equipamento</AdminButton>}</div>} />
    <div className="flex gap-1 border-b border-[#0d1b2e]/10">{canViewTable && <button type="button" onClick={openRegisteredPage} className={`cursor-default border-b-2 px-4 py-2.5 text-xs font-bold ${activeArea === "registered" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82]"}`}>Cadastrados</button>}{canViewFields && <button type="button" onClick={openFieldsPage} className={`cursor-default border-b-2 px-4 py-2.5 text-xs font-bold ${activeArea === "fields" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82]"}`}>Campos Extras</button>}</div>
    {activeArea === "registered" && canViewTable ? <AdminCard>{loading ? <LoadingState /> : types.length === 0 ? <EmptyState icon={Wrench} title="Nenhum equipamento cadastrado" message="Cadastre o primeiro equipamento com suas marcas e modelos." onAdd={canCreate ? openNewPage : undefined} addLabel="Novo equipamento" /> : <><div className="overflow-x-auto"><table className="min-w-[680px]"><thead><tr>{showEquipment && <th className="text-left">Equipamento</th>}{showBrands && <th className="text-left">Marcas</th>}{showModels && <th className="text-left">Modelos</th>}{showStatus && <th className="text-left">Status</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{pagedTypes.map(type => { const typeBrands = brands.filter(brand => brand.equipment_type_id === type.id); const brandIds = new Set(typeBrands.map(brand => brand.id)); const modelCount = models.filter(model => brandIds.has(model.equipment_brand_id)).length; return <tr key={type.id}>{showEquipment && <td className="font-bold text-[#0d1b2e]"><span>{type.name}</span></td>}{showBrands && <td className="text-xs text-[#5a6a82]">{typeBrands.length}</td>}{showModels && <td className="text-xs text-[#5a6a82]">{modelCount}</td>}{showStatus && <td><StatusBadge status={type.is_active ? "Ativo" : "Inativo"} /></td>}{showActions && <td><div className="flex justify-end gap-1">{canViewDetails && canEdit && <AdminIconButton ariaLabel="Editar equipamento" title="Editar equipamento" onClick={() => openEditPage(type)}><Edit2 size={14} /></AdminIconButton>}{canToggleActive && <AdminActiveStateButton active={type.is_active} entityLabel="equipamento" onClick={() => void toggleEquipmentActive(type)} iconSize={14} />}</div></td>}</tr>; })}</tbody></table></div><PaginationBar page={safeTypePage} pageSize={typePageSize} totalItems={types.length} onPageChange={setTypePage} onPageSizeChange={size => { setTypePageSize(size); setTypePage(1); }} /></>}</AdminCard> : activeArea === "fields" && canViewFields ? <AdminCard><AdminCardHeader className="justify-end">{canManageFields && <AdminButton onClick={openNewFieldPage} className="text-xs"><Plus size={15} /> Novo campo extra</AdminButton>}</AdminCardHeader>{loading ? <LoadingState /> : technicalFields.length === 0 ? <EmptyState icon={Wrench} title="Nenhum campo extra cadastrado" message="Cadastre o primeiro campo extra." onAdd={canManageFields ? openNewFieldPage : undefined} addLabel="Novo campo extra" /> : <><div className="overflow-x-auto"><table className="min-w-[680px]"><thead><tr>{showFieldName && <th className="text-left">Campo</th>}{showFieldKey && <th className="text-left">Chave</th>}{showFieldType && <th className="text-left">Tipo</th>}{showFieldStatus && <th className="text-left">Status</th>}{showFieldActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{pagedFields.map(field => <tr key={field.id}>{showFieldName && <td className="font-bold text-[#0d1b2e]"><span>{field.label}</span></td>}{showFieldKey && <td className="font-mono text-xs text-[#5a6a82]">{field.field_key}</td>}{showFieldType && <td className="text-xs text-[#5a6a82]">{field.field_type === "number" ? "Número" : "Texto"}</td>}{showFieldStatus && <td><StatusBadge status={field.is_active ? "Ativo" : "Inativo"} /></td>}{showFieldActions && <td><div className="flex justify-end gap-1">{canManageFields && <><AdminIconButton ariaLabel="Editar campo" title="Editar campo" onClick={() => openEditFieldPage(field)}><Edit2 size={14} /></AdminIconButton><AdminActiveStateButton active={field.is_active} entityLabel="campo" onClick={() => void toggleField(field)} iconSize={14} /></>}</div></td>}</tr>)}</tbody></table></div><PaginationBar page={safeFieldPage} pageSize={fieldPageSize} totalItems={technicalFields.length} onPageChange={setFieldPage} onPageSizeChange={size => { setFieldPageSize(size); setFieldPage(1); }} /></>}</AdminCard> : null}</>}
    {editorRouteActive && !formOpen && !fieldFormOpen && <AdminCard className="p-8"><LoadingState /></AdminCard>}
    <AdminPage open={formOpen} onClose={closeEditor} breadcrumb="Equipamentos Técnicos" title="Cadastro de equipamentos" subtitle="Monte equipamento, marcas e modelos antes de salvar"><div className="space-y-5 p-4 sm:p-5">{drafts.map((type, ti) => <div key={`${type.id || "new"}-${ti}`} className="space-y-4"><Section title="Equipamento"><div className="space-y-5"><div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><FInput label="Nome do equipamento" required value={type.name} onChange={(e: any) => updateDraft(ti, { name: e.target.value })} placeholder="Ex: Televisão" /><div className="flex items-center gap-2">{type.id && <FToggle label="Equipamento ativo" disabled={!canToggleActive} checked={type.is_active} onChange={is_active => updateDraft(ti, { is_active })} />}{drafts.length > 1 && canDelete && <button type="button" onClick={() => setDrafts(current => current.filter((_, i) => i !== ti))} className="cursor-default rounded-lg p-2.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>}</div></div>{canViewFields && <div className="border-t border-[#0d1b2e]/8 pt-4"><div className="mb-1 text-[10px] font-black uppercase tracking-wider text-[#8a98aa]">Campos Extras</div><div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">{technicalFields.filter(field => field.is_active || type.technicalFields.some(link => link.technical_field_id === field.id)).map(field => { const link = type.technicalFields.find(item => item.technical_field_id === field.id); return <div key={field.id} className="border-b border-[#0d1b2e]/8 py-3"><label className="flex min-w-0 cursor-default items-start gap-3 text-left"><Checkbox disabled={!canManageFields} checked={Boolean(link)} onCheckedChange={checked => updateTechnicalField(ti, field.id, checked === true)} /><span className="min-w-0 flex-1"><span className="block text-xs font-bold text-[#0d1b2e]">{field.label}</span>{link && <label className="mt-2 flex cursor-default items-center gap-2 text-[11px] text-[#5a6a82]"><Checkbox disabled={!canManageFields} checked={link.required} onCheckedChange={checked => updateTechnicalFieldRequired(ti, field.id, checked === true)} />Obrigatório</label>}</span></label></div>; })}</div></div>}{catalog && <EquipmentChecklistSection draft={type} catalog={catalog} onChange={patch => updateDraft(ti, patch)} />}</div></Section><Section title="Marcas e modelos"><div><p className="text-xs font-semibold text-[#0d1b2e]">Hierarquia do equipamento</p><p className="mt-0.5 text-xs text-[#5a6a82]">Cada marca agrupa seus respectivos modelos.</p></div><div className="mt-4 divide-y divide-[#0d1b2e]/10 border-y border-[#0d1b2e]/8">{type.brands.length === 0 ? <div className="flex items-center justify-between gap-3 py-4"><p className="text-xs text-[#8a98aa]">Nenhuma marca cadastrada.</p>{canCreate && <AdminButton onClick={() => addBrand(ti)} aria-label="Adicionar marca" title="Adicionar marca" className="h-11 w-11 shrink-0 !px-0"><Plus size={17} /></AdminButton>}</div> : type.brands.map((brand, bi) => <div key={`${brand.id || "new-brand"}-${bi}`} className="py-4"><div className="flex items-end gap-2"><div className="min-w-0 flex-1"><FInput label={`Marca ${bi + 1}`} required value={brand.name} onChange={(e: any) => updateBrand(ti, bi, { name: e.target.value })} /></div>{canCreate && bi === type.brands.length - 1 && <AdminButton onClick={() => addBrand(ti)} aria-label="Adicionar marca" title="Adicionar marca" className="h-11 w-11 shrink-0 !px-0"><Plus size={17} /></AdminButton>}{canDelete && <AdminIconButton ariaLabel="Excluir marca" title="Excluir marca" variant="danger" onClick={() => removeBrand(ti, bi)} className="h-11 w-11 shrink-0"><Trash2 size={16} /></AdminIconButton>}</div><div className="ml-3 mt-4 border-l-2 border-[#0057e7]/15 pl-4 sm:ml-5 sm:pl-5"><p className="mb-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#5a6a82]">Modelos</p>{brand.models.length === 0 ? <div className="flex items-center justify-between gap-3 py-2"><p className="text-xs text-[#8a98aa]">Nenhum modelo cadastrado nesta marca.</p>{canCreate && <AdminButton onClick={() => addModel(ti, bi)} aria-label="Adicionar modelo" title="Adicionar modelo" className="h-11 w-11 shrink-0 !px-0"><Plus size={17} /></AdminButton>}</div> : <div className="divide-y divide-[#0d1b2e]/8">{brand.models.map((model, mi) => <div key={`${model.id || "new-model"}-${mi}`} className="flex items-end gap-2 py-3 first:pt-0 last:pb-0"><div className="min-w-0 flex-1"><FInput label={`Modelo ${mi + 1}`} value={model.name} required placeholder="Nome do modelo" onChange={(e: any) => updateModel(ti, bi, mi, { name: e.target.value })} /></div>{canCreate && mi === brand.models.length - 1 && <AdminButton onClick={() => addModel(ti, bi)} aria-label="Adicionar modelo" title="Adicionar modelo" className="h-11 w-11 shrink-0 !px-0"><Plus size={17} /></AdminButton>}{canDelete && <AdminIconButton ariaLabel="Excluir modelo" title="Excluir modelo" variant="danger" onClick={() => removeModel(ti, bi, mi)} className="h-11 w-11 shrink-0"><Trash2 size={16} /></AdminIconButton>}</div>)}</div>}</div></div>)}</div></Section></div>)}{canCreate && drafts.every(type => !type.id) && <BtnSecondary onClick={addEquipment}><Plus size={15} /> Adicionar equipamento</BtnSecondary>}</div><div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={closeEditor}>Cancelar</BtnSecondary><BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary></div></AdminPage>
    <AdminPage open={fieldFormOpen && canManageFields} onClose={closeEditor} breadcrumb="Equipamentos Técnicos > Campos Extras" title={editingField ? "Editar campo extra" : "Novo campo extra"} subtitle="Configure um campo extra reutilizável nos tipos de equipamento"><div className="space-y-5 p-4 sm:p-5"><Section title="Campo extra"><div className="grid gap-4"><FInput label="Nome do campo" required value={fieldForm.label} onChange={(e: any) => setFieldForm(current => ({ ...current, label: e.target.value, ...(!editingField && !current.field_key ? { field_key: slugify(e.target.value).replace(/-/g, "_") } : {}) }))} /><FInput label="Chave" required disabled={Boolean(editingField)} value={fieldForm.field_key} onChange={(e: any) => setFieldForm(current => ({ ...current, field_key: e.target.value }))} /><FSelect label="Tipo" value={fieldForm.field_type} onChange={(e: any) => setFieldForm(current => ({ ...current, field_type: e.target.value }))} options={[{ value: "text", label: "Texto" }, { value: "number", label: "Número" }]} /><FToggle label="Campo ativo" checked={fieldForm.is_active} onChange={is_active => setFieldForm(current => ({ ...current, is_active }))} /></div></Section></div><div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={closeEditor}>Cancelar</BtnSecondary><BtnPrimary onClick={() => void saveField()} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary></div></AdminPage>
  </div>;
}
