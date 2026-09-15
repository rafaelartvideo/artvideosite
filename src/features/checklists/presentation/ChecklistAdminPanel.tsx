import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ClipboardCheck, Edit2, Plus, Power, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { AdminButton, AdminCard, AdminCardHeader, AdminPage, BtnPrimary, BtnSecondary, InternalBackButton, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FInput, FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
import type { ChecklistProfileDraftItem, ChecklistProfileDraftStage, ChecklistStageType } from "../domain/checklist";
import { loadChecklistAdminData, profileEditorFromAdminData, saveChecklistProfile } from "../infrastructure/checklists.repository";

type Props = {
  onBack: () => void;
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
};

type Draft = {
  id?: string;
  name: string;
  description: string;
  is_active: boolean;
  stages: ChecklistProfileDraftStage[];
};

const RESPONSE_OPTIONS = [
  { value: "conformity", label: "Conforme / Não conforme" },
  { value: "yes_no", label: "Sim / Não" },
  { value: "confirmation", label: "Confirmação" },
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
];
const PHOTO_OPTIONS = [
  { value: "none", label: "Sem foto" },
  { value: "optional", label: "Foto opcional" },
  { value: "required", label: "Foto obrigatória" },
  { value: "required_on_failure", label: "Obrigatória se houver falha" },
];
const OBSERVATION_OPTIONS = [
  { value: "none", label: "Sem observação" },
  { value: "optional", label: "Observação opcional" },
  { value: "required", label: "Observação obrigatória" },
  { value: "required_on_failure", label: "Obrigatória se houver falha" },
];
const STAGE_TYPE_OPTIONS = [
  { value: "entry", label: "Entrada" },
  { value: "diagnosis", label: "Diagnóstico" },
  { value: "qc", label: "Saída / QC" },
  { value: "custom", label: "Personalizada" },
];

function stageCode(name: string, fallback: string) {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function newItem(sortOrder = 0): ChecklistProfileDraftItem {
  return {
    title: "",
    description: null,
    response_type: "conformity",
    allow_na: true,
    is_required: true,
    photo_requirement: "none",
    observation_requirement: "optional",
    sort_order: sortOrder,
    is_active: true,
  };
}

function newStage(name: string, type: ChecklistStageType, code: string, sortOrder: number): ChecklistProfileDraftStage {
  return {
    code,
    stage_type: type,
    name,
    situation_id: null,
    block_situation_exit: false,
    block_resolution: type === "diagnosis",
    block_completion: type === "qc",
    sort_order: sortOrder,
    is_active: true,
    items: [newItem(0)],
  };
}

function newDraft(): Draft {
  return {
    name: "",
    description: "",
    is_active: true,
    stages: [
      newStage("Entrada", "entry", "entrada", 0),
      newStage("Diagnóstico", "diagnosis", "diagnostico", 10),
      newStage("Saída / QC", "qc", "saida_qc", 20),
    ],
  };
}

export function ChecklistAdminPanel({ onBack, routeResourceId, routeSubpage, onRouteChange }: Props) {
  const { hasPermission } = useAuth();
  const canView = hasPermission("checklists.view") || hasPermission("checklists.manage");
  const canManage = hasPermission("checklists.manage");
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.checklists.profiles(), queryFn: loadChecklistAdminData, enabled: canView });
  const data = query.data;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const editorOpen = routeResourceId === "new" || Boolean(routeResourceId && routeSubpage === "edit");

  const linkedCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const equipment of data?.equipmentTypes ?? []) {
      if (!equipment.checklist_profile_id) continue;
      map.set(equipment.checklist_profile_id, (map.get(equipment.checklist_profile_id) || 0) + 1);
    }
    return map;
  }, [data?.equipmentTypes]);

  useEffect(() => {
    if (!editorOpen || !data) { if (!editorOpen) setDraft(null); return; }
    if (routeResourceId === "new") {
      setDraft(current => current?.id ? newDraft() : current || newDraft());
      return;
    }
    const editor = profileEditorFromAdminData(data, String(routeResourceId));
    if (!editor) return;
    setDraft({
      id: editor.id,
      name: editor.name,
      description: editor.description || "",
      is_active: editor.is_active,
      stages: editor.stages.map(stage => ({
        ...stage,
        situation_id: stage.situation_id || null,
        items: stage.items.map(item => ({ ...item })),
      })),
    });
  }, [editorOpen, routeResourceId, routeSubpage, data]);

  useEffect(() => {
    if (!query.error) return;
    setToast({ msg: `Erro ao carregar checklists: ${query.error instanceof Error ? query.error.message : String(query.error)}`, type: "error" });
  }, [query.error]);

  const closeEditor = () => onRouteChange?.(null, null);
  const updateStage = (stageIndex: number, value: Partial<ChecklistProfileDraftStage>) => setDraft(current => current ? ({
    ...current,
    stages: current.stages.map((stage, index) => index === stageIndex ? { ...stage, ...value } : stage),
  }) : current);
  const updateItem = (stageIndex: number, itemIndex: number, value: Partial<ChecklistProfileDraftItem>) => setDraft(current => current ? ({
    ...current,
    stages: current.stages.map((stage, index) => index === stageIndex ? {
      ...stage,
      items: stage.items.map((item, childIndex) => childIndex === itemIndex ? { ...item, ...value } : item),
    } : stage),
  }) : current);
  const addStage = () => setDraft(current => current ? ({
    ...current,
    stages: [...current.stages, newStage("Nova etapa", "custom", `etapa_${current.stages.length + 1}`, current.stages.length * 10)],
  }) : current);
  const removeStage = (stageIndex: number) => setDraft(current => current ? ({ ...current, stages: current.stages.filter((_, index) => index !== stageIndex) }) : current);
  const moveStage = (stageIndex: number, direction: -1 | 1) => setDraft(current => {
    if (!current) return current;
    const next = [...current.stages];
    const target = stageIndex + direction;
    if (target < 0 || target >= next.length) return current;
    [next[stageIndex], next[target]] = [next[target], next[stageIndex]];
    return { ...current, stages: next.map((stage, index) => ({ ...stage, sort_order: index * 10 })) };
  });
  const addItem = (stageIndex: number) => setDraft(current => current ? ({
    ...current,
    stages: current.stages.map((stage, index) => index === stageIndex ? { ...stage, items: [...stage.items, newItem(stage.items.length * 10)] } : stage),
  }) : current);
  const removeItem = (stageIndex: number, itemIndex: number) => setDraft(current => current ? ({
    ...current,
    stages: current.stages.map((stage, index) => index === stageIndex ? { ...stage, items: stage.items.filter((_, childIndex) => childIndex !== itemIndex) } : stage),
  }) : current);

  const validateDraft = (value: Draft) => {
    if (!value.name.trim()) return "Informe o nome do perfil.";
    if (!value.stages.length) return "Adicione ao menos uma etapa.";
    const codes = new Set<string>();
    for (const [stageIndex, stage] of value.stages.entries()) {
      if (!stage.name.trim()) return `Informe o nome da etapa ${stageIndex + 1}.`;
      const code = stageCode(stage.name, stage.code || `etapa_${stageIndex + 1}`);
      if (codes.has(code)) return "As etapas precisam ter nomes diferentes.";
      codes.add(code);
      if (stage.items.some(item => !item.title.trim())) return `Preencha todos os itens da etapa ${stage.name}.`;
    }
    return "";
  };

  const persist = async (value = draft) => {
    if (!value || !canManage) return;
    const validation = validateDraft(value);
    if (validation) { setToast({ msg: validation, type: "error" }); return; }
    setSaving(true);
    try {
      await saveChecklistProfile({
        id: value.id,
        name: value.name,
        description: value.description,
        is_active: value.is_active,
        stages: value.stages.map((stage, index) => ({
          ...stage,
          code: stage.id ? stage.code : stageCode(stage.name, stage.code || `etapa_${index + 1}`),
          sort_order: index * 10,
          items: stage.items.map((item, itemIndex) => ({ ...item, sort_order: itemIndex * 10 })),
        })),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.checklists.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all }),
      ]);
      setToast({ msg: value.id ? "Perfil de checklist atualizado." : "Perfil de checklist criado.", type: "success" });
      closeEditor();
    } catch (error) {
      setToast({ msg: `Erro ao salvar checklist: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const toggleProfile = async (profileId: string) => {
    if (!data || !canManage) return;
    const editor = profileEditorFromAdminData(data, profileId);
    if (!editor) return;
    await persist({
      id: editor.id,
      name: editor.name,
      description: editor.description || "",
      is_active: !editor.is_active,
      stages: editor.stages.map(stage => ({ ...stage, items: stage.items.map(item => ({ ...item })) })),
    });
  };

  if (!canView) return null;
  if (query.isPending) return <LoadingState text="Carregando perfis de checklist..." />;

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {!editorOpen && <>
      <PageHeader title="Checklists" subtitle="Perfis técnicos vinculados aos equipamentos e às etapas das ordens de serviço" actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{canManage && <AdminButton onClick={() => onRouteChange?.("new", null)}><Plus size={15} /> Novo perfil</AdminButton>}</div>} />
      {!data?.profiles.length ? <EmptyState icon={<ClipboardCheck size={24} />} title="Nenhum perfil de checklist" description="Crie o primeiro perfil para organizar Entrada, Diagnóstico e Saída/QC dos equipamentos." action={canManage ? <BtnPrimary onClick={() => onRouteChange?.("new", null)}><Plus size={15} /> Criar perfil</BtnPrimary> : undefined} /> : <div className="grid gap-3 lg:grid-cols-2">
        {data.profiles.map(profile => {
          const stages = data.stages.filter(stage => stage.profile_id === profile.id);
          const itemCount = stages.reduce((total, stage) => total + stage.items.length, 0);
          return <AdminCard key={profile.id}>
            <AdminCardHeader title={profile.name} subtitle={`Versão ${profile.version} • ${stages.length} etapa(s) • ${itemCount} item(ns)`} actions={<StatusBadge status={profile.is_active ? "Ativo" : "Inativo"} color={profile.is_active ? "#16a34a" : "#64748b"} />} />
            <div className="space-y-3 p-4">
              {profile.description && <p className="text-xs leading-5 text-[#5a6a82]">{profile.description}</p>}
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-lg bg-[#f5f7fa] p-2.5"><span className="block text-[10px] font-bold uppercase text-[#7a8aa0]">Equipamentos</span><strong>{linkedCounts.get(profile.id) || 0}</strong></div>
                <div className="rounded-lg bg-[#f5f7fa] p-2.5"><span className="block text-[10px] font-bold uppercase text-[#7a8aa0]">Etapas</span><strong>{stages.length}</strong></div>
                <div className="rounded-lg bg-[#f5f7fa] p-2.5"><span className="block text-[10px] font-bold uppercase text-[#7a8aa0]">Itens</span><strong>{itemCount}</strong></div>
              </div>
              {canManage && <div className="flex flex-wrap justify-end gap-2 border-t border-[#0d1b2e]/8 pt-3">
                <AdminButton variant="secondary" onClick={() => void toggleProfile(profile.id)}><Power size={14} /> {profile.is_active ? "Inativar" : "Ativar"}</AdminButton>
                <AdminButton onClick={() => onRouteChange?.(profile.id, "edit")}><Edit2 size={14} /> Editar</AdminButton>
              </div>}
            </div>
          </AdminCard>;
        })}
      </div>}
    </>}

    {editorOpen && draft && <AdminPage open onClose={closeEditor} breadcrumb="Operação > Checklists" title={draft.id ? "Editar perfil de checklist" : "Novo perfil de checklist"} subtitle="Configure etapas, situação vinculada, bloqueios e itens técnicos" maxW="max-w-5xl">
      <div className="space-y-5 p-5">
        <Section title="Perfil">
          <div className="grid gap-4 md:grid-cols-2">
            <FInput label="Nome do perfil" value={draft.name} onChange={event => setDraft(current => current ? { ...current, name: event.target.value } : current)} placeholder="Ex.: Televisor — Padrão" />
            <div className="flex items-end"><FToggle label="Perfil ativo" checked={draft.is_active} onCheckedChange={checked => setDraft(current => current ? { ...current, is_active: checked } : current)} /></div>
            <div className="md:col-span-2"><FInput label="Descrição" value={draft.description} onChange={event => setDraft(current => current ? { ...current, description: event.target.value } : current)} placeholder="Uso e objetivo deste perfil" /></div>
          </div>
        </Section>

        <div className="flex items-center justify-between gap-3">
          <div><h3 className="text-sm font-black text-[#0d1b2e]">Etapas</h3><p className="text-xs text-[#6b7c93]">Cada etapa pode ser ligada a uma Situação da OS e bloquear o fluxo.</p></div>
          <AdminButton variant="secondary" onClick={addStage}><Plus size={14} /> Etapa</AdminButton>
        </div>

        {draft.stages.map((stage, stageIndex) => <AdminCard key={`${stage.id || stage.code}-${stageIndex}`}>
          <AdminCardHeader title={`${stageIndex + 1}. ${stage.name || "Nova etapa"}`} subtitle={stage.situation_id ? `Vinculada a ${data?.situations.find(item => item.id === stage.situation_id)?.name || "Situação"}` : "Sem situação vinculada"} actions={<div className="flex gap-1"><AdminButton variant="secondary" className="px-2" disabled={stageIndex === 0} onClick={() => moveStage(stageIndex, -1)} title="Subir"><ArrowUp size={14} /></AdminButton><AdminButton variant="secondary" className="px-2" disabled={stageIndex === draft.stages.length - 1} onClick={() => moveStage(stageIndex, 1)} title="Descer"><ArrowDown size={14} /></AdminButton><AdminButton variant="secondary" className="px-2 text-red-600" onClick={() => removeStage(stageIndex)} title="Remover"><Trash2 size={14} /></AdminButton></div>} />
          <div className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <FInput label="Nome da etapa" value={stage.name} onChange={event => updateStage(stageIndex, { name: event.target.value })} />
              <FSelect label="Tipo" value={stage.stage_type} onValueChange={value => updateStage(stageIndex, { stage_type: value as ChecklistStageType })} options={STAGE_TYPE_OPTIONS} />
              <FSelect label="Situação da OS" value={stage.situation_id || ""} onValueChange={value => updateStage(stageIndex, { situation_id: value || null })} options={[{ value: "", label: "Sem vínculo" }, ...(data?.situations ?? []).map(item => ({ value: item.id, label: item.name }))]} />
            </div>
            <div className="grid gap-2 rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-3 md:grid-cols-3">
              <FToggle label="Bloquear saída da situação" checked={stage.block_situation_exit} onCheckedChange={checked => updateStage(stageIndex, { block_situation_exit: checked })} />
              <FToggle label="Bloquear Resolver OS" checked={stage.block_resolution} onCheckedChange={checked => updateStage(stageIndex, { block_resolution: checked })} />
              <FToggle label="Bloquear Concluir OS" checked={stage.block_completion} onCheckedChange={checked => updateStage(stageIndex, { block_completion: checked })} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between"><strong className="text-xs uppercase tracking-wide text-[#52647c]">Itens</strong><AdminButton variant="secondary" onClick={() => addItem(stageIndex)}><Plus size={13} /> Item</AdminButton></div>
              {stage.items.map((item, itemIndex) => <div key={`${item.id || "new"}-${itemIndex}`} className="rounded-xl border border-[#0d1b2e]/10 p-3">
                <div className="mb-3 flex items-center justify-between gap-2"><span className="text-xs font-bold text-[#0d1b2e]">Item {itemIndex + 1}</span><button type="button" onClick={() => removeItem(stageIndex, itemIndex)} className="rounded-md p-1.5 text-red-600 hover:bg-red-50" title="Remover item"><Trash2 size={14} /></button></div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <div className="md:col-span-2 lg:col-span-2"><FInput label="Título" value={item.title} onChange={event => updateItem(stageIndex, itemIndex, { title: event.target.value })} placeholder="O que deve ser verificado?" /></div>
                  <FSelect label="Resposta" value={item.response_type} onValueChange={value => updateItem(stageIndex, itemIndex, { response_type: value as ChecklistProfileDraftItem["response_type"] })} options={RESPONSE_OPTIONS} />
                  <FSelect label="Foto" value={item.photo_requirement} onValueChange={value => updateItem(stageIndex, itemIndex, { photo_requirement: value as ChecklistProfileDraftItem["photo_requirement"] })} options={PHOTO_OPTIONS} />
                  <FSelect label="Observação" value={item.observation_requirement} onValueChange={value => updateItem(stageIndex, itemIndex, { observation_requirement: value as ChecklistProfileDraftItem["observation_requirement"] })} options={OBSERVATION_OPTIONS} />
                  <div className="flex flex-wrap items-end gap-4 pb-1"><FToggle label="Obrigatório" checked={item.is_required} onCheckedChange={checked => updateItem(stageIndex, itemIndex, { is_required: checked })} /><FToggle label="Permitir N/A" checked={item.allow_na} onCheckedChange={checked => updateItem(stageIndex, itemIndex, { allow_na: checked })} /></div>
                  <div className="md:col-span-2 lg:col-span-3"><FInput label="Instrução / descrição" value={item.description || ""} onChange={event => updateItem(stageIndex, itemIndex, { description: event.target.value || null })} placeholder="Orientação opcional para quem executará o checklist" /></div>
                </div>
              </div>)}
            </div>
          </div>
        </AdminCard>)}
      </div>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#0d1b2e]/8 bg-white px-5 py-4"><BtnSecondary onClick={closeEditor}>Cancelar</BtnSecondary><BtnPrimary disabled={saving} onClick={() => void persist()}>{saving ? "Salvando..." : "Salvar perfil"}</BtnPrimary></div>
    </AdminPage>}
  </div>;
}
