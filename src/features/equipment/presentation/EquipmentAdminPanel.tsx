import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Plus, Trash2, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import type {
  EquipmentDraft,
  EquipmentDraftBrand,
  EquipmentDraftModel,
  EquipmentTypeRow,
} from "../domain/equipment";
import {
  loadEquipmentCatalog,
  saveEquipmentHierarchy,
} from "../infrastructure/equipment.repository";
import {
  AdminButton,
  AdminIconButton,
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  InternalBackButton,
  PageHeader,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import {
  EmptyState,
  LoadingState,
  StatusBadge,
  Toast,
} from "@/shared/ui/admin/AdminFeedback";
import { FInput } from "@/shared/ui/admin/AdminFormControls";

export function EquipmentAdminPanel({ onBack }: { onBack: () => void }) {
  const { hasPermission } = useAuth();
  const canView = hasPermission("equipment.view");
  const queryClient = useQueryClient();
  const catalogQuery = useQuery({
    queryKey: queryKeys.equipment.catalog(),
    queryFn: loadEquipmentCatalog,
    enabled: canView,
  });
  const types = catalogQuery.data?.types ?? [];
  const brands = catalogQuery.data?.brands ?? [];
  const models = catalogQuery.data?.models ?? [];
  const [drafts, setDrafts] = useState<EquipmentDraft[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const loading = catalogQuery.isPending;
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!catalogQuery.error) return;
    const message = catalogQuery.error instanceof Error ? catalogQuery.error.message : String(catalogQuery.error);
    setToast({ msg: `Erro ao carregar equipamentos: ${message}`, type: "error" });
  }, [catalogQuery.error]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all });
  if (!canView) return null;

  const makeDraft = (type?: EquipmentTypeRow): EquipmentDraft => ({
    id: type?.id, name: type?.name || "", is_active: type?.is_active ?? true,
    brands: brands.filter(brand => brand.equipment_type_id === type?.id).map(brand => ({
      id: brand.id, name: brand.name, is_active: brand.is_active,
      models: models.filter(model => model.equipment_brand_id === brand.id).map(model => ({ id: model.id, name: model.name, is_active: model.is_active })),
    })),
  });
  const openNew = () => { setDrafts([makeDraft()]); setFormOpen(true); };
  const openEdit = (type: EquipmentTypeRow) => { setDrafts([makeDraft(type)]); setFormOpen(true); };
  const addEquipment = () => setDrafts(current => [...current, makeDraft()]);
  const updateDraft = (index: number, value: Partial<EquipmentDraft>) => setDrafts(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item));
  const addBrand = (typeIndex: number) => setDrafts(current => current.map((type, index) => index === typeIndex ? { ...type, brands: [...type.brands, { name: "", is_active: true, models: [{ name: "", is_active: true }] }] } : type));
  const updateBrand = (typeIndex: number, brandIndex: number, value: Partial<EquipmentDraftBrand>) => setDrafts(current => current.map((type, index) => index === typeIndex ? { ...type, brands: type.brands.map((brand, childIndex) => childIndex === brandIndex ? { ...brand, ...value } : brand) } : type));
  const removeBrand = (typeIndex: number, brandIndex: number) => setDrafts(current => current.map((type, index) => index === typeIndex ? { ...type, brands: type.brands.filter((_, childIndex) => childIndex !== brandIndex) } : type));
  const addModel = (typeIndex: number, brandIndex: number) => setDrafts(current => current.map((type, index) => index === typeIndex ? { ...type, brands: type.brands.map((brand, childIndex) => childIndex === brandIndex ? { ...brand, models: [...brand.models, { name: "", is_active: true }] } : brand) } : type));
  const updateModel = (typeIndex: number, brandIndex: number, modelIndex: number, value: Partial<EquipmentDraftModel>) => setDrafts(current => current.map((type, index) => index === typeIndex ? { ...type, brands: type.brands.map((brand, childIndex) => childIndex === brandIndex ? { ...brand, models: brand.models.map((model, itemIndex) => itemIndex === modelIndex ? { ...model, ...value } : model) } : brand) } : type));
  const removeModel = (typeIndex: number, brandIndex: number, modelIndex: number) => setDrafts(current => current.map((type, index) => index === typeIndex ? { ...type, brands: type.brands.map((brand, childIndex) => childIndex === brandIndex ? { ...brand, models: brand.models.filter((_, itemIndex) => itemIndex !== modelIndex) } : brand) } : type));

  const save = async () => {
    if (!drafts.every(type => type.id ? hasPermission("equipment.edit") : hasPermission("equipment.create"))) return;
    if (drafts.some(type => !type.name.trim() || type.brands.some(brand => !brand.name.trim() || brand.models.some(model => !model.name.trim())))) { setToast({ msg: "Preencha equipamento, marcas e modelos antes de salvar.", type: "error" }); return; }
    const typeNames = new Set<string>();
    for (const type of drafts) {
      const normalizedType = type.name.trim().toLowerCase();
      if (typeNames.has(normalizedType) || (!type.id && types.some(item => item.name.trim().toLowerCase() === normalizedType))) { setToast({ msg: `O equipamento "${type.name}" já existe.`, type: "error" }); return; }
      typeNames.add(normalizedType);
      const brandNames = new Set<string>();
      for (const brand of type.brands) {
        const normalizedBrand = brand.name.trim().toLowerCase();
        if (brandNames.has(normalizedBrand) || (!brand.id && brands.some(item => item.equipment_type_id === type.id && item.name.trim().toLowerCase() === normalizedBrand))) { setToast({ msg: `A marca "${brand.name}" está duplicada neste equipamento.`, type: "error" }); return; }
        brandNames.add(normalizedBrand);
        const modelNames = new Set<string>();
        for (const model of brand.models) {
          const normalizedModel = model.name.trim().toLowerCase();
          if (modelNames.has(normalizedModel) || (!model.id && models.some(item => item.equipment_brand_id === brand.id && item.name.trim().toLowerCase() === normalizedModel))) { setToast({ msg: `O modelo "${model.name}" está duplicado nesta marca.`, type: "error" }); return; }
          modelNames.add(normalizedModel);
        }
      }
    }
    setSaving(true);
    try {
      await saveEquipmentHierarchy(drafts, { types, brands, models });
      setFormOpen(false); setToast({ msg: "Equipamentos salvos com sucesso.", type: "success" }); await refresh();
    } catch (error) { setToast({ msg: `Erro ao salvar estrutura: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <PageHeader title="Equipamentos Técnicos" subtitle="Cadastro hierárquico usado nas ordens de serviço" actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{hasPermission("equipment.create") && <AdminButton onClick={openNew} className="text-xs"><Plus size={15} /> Novo equipamento</AdminButton>}</div>} />
      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? <LoadingState /> : types.length === 0 ? <EmptyState icon={Wrench} title="Nenhum equipamento cadastrado" message="Cadastre o primeiro equipamento com suas marcas e modelos." onAdd={hasPermission("equipment.create") ? openNew : undefined} addLabel="Novo equipamento" /> : <div className="divide-y divide-[#0d1b2e]/5">{types.map(type => <div key={type.id} className="px-5 py-4 flex items-center justify-between gap-3"><div><p className="font-bold text-[#0d1b2e]">{type.name}</p><p className="text-xs text-[#5a6a82]">{brands.filter(brand => brand.equipment_type_id === type.id).length} marca(s) técnica(s)</p></div><div className="flex items-center gap-2"><StatusBadge status={type.is_active ? "Ativo" : "Inativo"} />{hasPermission("equipment.edit") && <AdminIconButton ariaLabel="Editar equipamento" title="Editar equipamento" onClick={() => openEdit(type)}><Edit2 size={14} /></AdminIconButton>}</div></div>)}</div>}
      </div>
      <AdminPage open={formOpen} onClose={() => setFormOpen(false)} breadcrumb="Equipamentos Técnicos" title="Cadastro de equipamentos" subtitle="Monte equipamento, marcas e modelos antes de salvar">
        <div className="p-5 space-y-5">{drafts.map((type, typeIndex) => <Section key={`${type.id || "new"}-${typeIndex}`} title="Equipamento"><div className="flex items-end gap-2"><div className="flex-1"><FInput label="Nome do equipamento" required value={type.name} onChange={(e: any) => updateDraft(typeIndex, { name: e.target.value })} placeholder="Ex: Televisão" /></div>{drafts.length > 1 && hasPermission("equipment.delete") && <button type="button" onClick={() => setDrafts(current => current.filter((_, index) => index !== typeIndex))} className="p-2.5 text-red-500 hover:bg-red-50 rounded-lg" title="Remover equipamento"><Trash2 size={16} /></button>}</div><div className="mt-5 space-y-4"><div className="flex items-center justify-between"><h4 className="text-sm font-bold text-[#0d1b2e]">Marcas e modelos</h4>{hasPermission("equipment.create") && <button type="button" onClick={() => addBrand(typeIndex)} className="p-1.5 text-[#0057e7] hover:bg-[#e8eef8] rounded-lg" title="Adicionar marca"><Plus size={16} /></button>}</div>{type.brands.map((brand, brandIndex) => <div key={`${brand.id || "new-brand"}-${brandIndex}`} className="rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-4"><div className="flex items-end gap-2"><div className="flex-1"><FInput label="Marca" required value={brand.name} onChange={(e: any) => updateBrand(typeIndex, brandIndex, { name: e.target.value })} placeholder="Ex: Samsung" /></div>{hasPermission("equipment.delete") && <button type="button" onClick={() => removeBrand(typeIndex, brandIndex)} className="p-2.5 text-red-500 hover:bg-red-50 rounded-lg" title="Remover marca"><Trash2 size={15} /></button>}</div><div className="mt-3 pl-3 border-l-2 border-[#0057e7]/20 space-y-2"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Modelos</span>{hasPermission("equipment.create") && <button type="button" onClick={() => addModel(typeIndex, brandIndex)} className="p-1 text-[#0057e7] hover:bg-[#e8eef8] rounded-lg" title="Adicionar modelo"><Plus size={15} /></button>}</div>{brand.models.map((model, modelIndex) => <div key={`${model.id || "new-model"}-${modelIndex}`} className="flex items-center gap-2"><FInput value={model.name} required onChange={(e: any) => updateModel(typeIndex, brandIndex, modelIndex, { name: e.target.value })} placeholder="Nome do modelo" />{hasPermission("equipment.delete") && <button type="button" onClick={() => removeModel(typeIndex, brandIndex, modelIndex)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Remover modelo"><Trash2 size={14} /></button>}</div>)}</div></div>)}</div></Section>)}{hasPermission("equipment.create") && <BtnSecondary onClick={addEquipment}><Plus size={15} /> Adicionar equipamento</BtnSecondary>}</div><div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3"><BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>{drafts.length > 0 && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar estrutura"}</BtnPrimary>}</div>
      </AdminPage>
    </div>
  );
}
