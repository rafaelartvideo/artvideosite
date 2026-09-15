import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ClipboardCheck, Edit2, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  AdminButton,
  AdminCard,
  AdminCardHeader,
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  InternalBackButton,
  PageHeader,
} from "@/shared/ui/admin/AdminLayout";
import { AdminActiveStateButton } from "@/shared/ui/admin/AdminActiveStateButton";
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
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || fallback;
}

function newItem(sort_order = 0): ChecklistProfileDraftItem {
  return {
    title: "",
    description: null,
    response_type: "conformity",
    allow_na: true,
    is_required: true,
    photo_requirement: "none",
    observation_requirement: "optional",
    sort_order,
    is_active: true,
  };
}

function newStage(name: string, stage_type: ChecklistStageType, code: string, sort_order: number): ChecklistProfileDraftStage {
  return {
    code,
    stage_type,
    name,
    situation_id: null,
    block_situation_exit: false,
    block_resolution: stage_type === "diagnosis",
    block_completion: stage_type === "qc",
    sort_order,
    is_active: true,
    items: [newItem()],
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
  const query = useQuery({
    queryKey: queryKeys.checklists.profiles(),
    queryFn: loadChecklistAdminData,
    enabled: canView,
  });
  const data = query.data;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const editorOpen = routeResourceId === "new" || Boolean(routeResourceId && routeSubpage === "edit");

  const linkedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const equipment of data?.equipmentTypes ?? []) {
      if (equipment.checklist_profile_id) {
        counts.set(equipment.checklist_profile_id, (counts.get(equipment.checklist_profile_id) || 0) + 1);
      }
    }
    return counts;
  }, [data?.equipmentTypes]);

  useEffect(() => {
    if (!editorOpen) {
      setDraft(null);
      return;
    }
    if (!data) return;
    if (routeResourceId === "new") {
      setDraft(current => current || newDraft());
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
  }, [editorOpen, routeResourceId, data]);

  useEffect(() => {
    if (query.error) {
      setToast({
        msg: `Erro ao carregar checklists: ${query.error instanceof Error ? query.error.message : String(query.error)}`,
        type: "error",
      });
    }
  }, [query.error]);

  const closeEditor = () => onRouteChange?.(null, null);
  const updateStage = (stageIndex: number, patch: Partial<ChecklistProfileDraftStage>) =>
    setDraft(current => current
      ? { ...current, stages: current.stages.map((stage, index) => index === stageIndex ? { ...stage, ...patch } : stage) }
      : current);
  const updateItem = (stageIndex: number, itemIndex: number, patch: Partial<ChecklistProfileDraftItem>) =>
    setDraft(current => current
      ? {
          ...current,
          stages: current.stages.map((stage, index) => index === stageIndex
            ? { ...stage, items: stage.items.map((item, childIndex) => childIndex === itemIndex ? { ...item, ...patch } : item) }
            : stage),
        }
      : current);
  const addStage = () => setDraft(current => current
    ? {
        ...current,
        stages: [
          ...current.stages,
          newStage("Nova etapa", "custom", `etapa_${current.stages.length + 1}`, current.stages.length * 10),
        ],
      }
    : current);
  const removeStage = (stageIndex: number) => setDraft(current => current
    ? { ...current, stages: current.stages.filter((_, index) => index !== stageIndex) }
    : current);
  const moveStage = (stageIndex: number, direction: -1 | 1) => setDraft(current => {
    if (!current) return current;
    const target = stageIndex + direction;
    if (target < 0 || target >= current.stages.length) return current;
    const stages = [...current.stages];
    [stages[stageIndex], stages[target]] = [stages[target], stages[stageIndex]];
    return { ...current, stages: stages.map((stage, index) => ({ ...stage, sort_order: index * 10 })) };
  });
  const addItem = (stageIndex: number) => setDraft(current => current
    ? {
        ...current,
        stages: current.stages.map((stage, index) => index === stageIndex
          ? { ...stage, items: [...stage.items, newItem(stage.items.length * 10)] }
          : stage),
      }
    : current);
  const removeItem = (stageIndex: number, itemIndex: number) => setDraft(current => current
    ? {
        ...current,
        stages: current.stages.map((stage, index) => index === stageIndex
          ? { ...stage, items: stage.items.filter((_, childIndex) => childIndex !== itemIndex) }
          : stage),
      }
    : current);

  const validate = (value: Draft) => {
    if (!value.name.trim()) return "Informe o nome do perfil.";
    if (!value.stages.length) return "Adicione ao menos uma etapa.";
    const codes = new Set<string>();
    for (const [index, stage] of value.stages.entries()) {
      if (!stage.name.trim()) return `Informe o nome da etapa ${index + 1}.`;
      const code = stage.id ? stage.code : stageCode(stage.name, stage.code || `etapa_${index + 1}`);
      if (codes.has(code)) return "As etapas precisam ter códigos diferentes.";
      codes.add(code);
      if (stage.items.some(item => !item.title.trim())) return `Preencha todos os itens da etapa ${stage.name}.`;
    }
    return "";
  };

  const persist = async (value = draft, close = true) => {
    if (!value || !canManage) return;
    const errorMessage = validate(value);
    if (errorMessage) {
      setToast({ msg: errorMessage, type: "error" });
      return;
    }
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
      if (close) closeEditor();
    } catch (error) {
      setToast({
        msg: `Erro ao salvar checklist: ${error instanceof Error ? error.message : String(error)}`,
        type: "error",
      });
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
    }, false);
  };

  if (!canView) return null;
  if (query.isPending) return <LoadingState text="Carregando perfis de checklist..." />;

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    {!editorOpen && <>
      <PageHeader
        title="Checklists"
        subtitle="Perfis técnicos vinculados aos equipamentos e às etapas das ordens de serviço"
        actions={<div className="flex items-center gap-2">
          <InternalBackButton onBack={onBack} />
          {canManage && <AdminButton onClick={() => onRouteChange?.("new", null)}><Plus size={15} /> Novo perfil</AdminButton>}
        </div>}
      />
      {!data?.profiles.length
        ? <EmptyState
            icon={ClipboardCheck}
            title="Nenhum perfil de checklist"
            message="Crie o primeiro perfil para organizar Entrada, Diagnóstico e Saída/QC dos equipamentos."
            onAdd={canManage ? () => onRouteChange?.("new", null) : undefined}
            addLabel="Criar perfil"
          />
        : <div className="grid gap-3 lg:grid-cols-2">
            {data.profiles.map(profile => {
              const stages = data.stages.filter(stage => stage.profile_id === profile.id);
              const itemCount = stages.reduce((total, stage) => total + stage.items.length, 0);
              return <AdminCard key={profile.id}>
                <AdminCardHeader
                  title={profile.name}
                  subtitle={`Versão ${profile.version} • ${stages.length} etapa(s) • ${itemCount} item(ns)`}
                  actions={<StatusBadge status={profile.is_active ? "Ativo" : "Inativo"} color={profile.is_active ? "#16a34a" : "#64748b"} />}
                />
                <div className="space-y-3 p-4">
                  {profile.description && <p className="text-xs leading-5 text-[#5a6a82]">{profile.description}</p>}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <Metric label="Equipamentos" value={linkedCounts.get(profile.id) || 0} />
                    <Metric label="Etapas" value={stages.length} />
                    <Metric label="Itens" value={itemCount} />
                  </div>
                  {canManage && <div className="flex flex-wrap justify-end gap-2 border-t border-[#0d1b2e]/8 pt-3">
                    <AdminActiveStateButton
                      active={profile.is_active}
                      entityLabel="perfil"
                      onClick={() => void toggleProfile(profile.id)}
                      className="h-9 w-9"
                      iconSize={14}
                    />
                    <AdminButton onClick={() => onRouteChange?.(profile.id, "edit")}><Edit2 size={14} /> Editar</AdminButton>
                  </div>}
                </div>
              </AdminCard>;
            })}
          </div>}
    </>}

    {editorOpen && draft && <AdminPage
      open
      onClose={closeEditor}
      breadcrumb="Operação > Checklists"
      title={draft.id ? "Editar perfil de checklist" : "Novo perfil de checklist"}
      subtitle="Configure etapas, situação vinculada, bloqueios e itens técnicos"
      maxW="max-w-7xl"
    >
      <div className="space-y-5 p-5">
        <section className="overflow-hidden rounded-2xl border border-[#0d1b2e]/10 bg-white">
          <div className="flex flex-col gap-3 border-b border-[#0d1b2e]/8 bg-[#f8fafc] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-black text-[#0d1b2e]">Perfil</h3>
              <p className="mt-1 text-xs text-[#6b7c93]">Defina a identificação e disponibilidade deste perfil.</p>
            </div>
            <div className="flex justify-end">
              <FToggle
                label="Perfil ativo"
                checked={draft.is_active}
                onChange={checked => setDraft(current => current ? { ...current, is_active: checked } : current)}
              />
            </div>
          </div>
          <div className="grid gap-4 p-5 lg:grid-cols-2">
            <FInput
              label="Nome do perfil"
              value={draft.name}
              onChange={event => setDraft(current => current ? { ...current, name: event.target.value } : current)}
              placeholder="Ex.: Televisor — Padrão"
            />
            <FInput
              label="Descrição"
              value={draft.description}
              onChange={event => setDraft(current => current ? { ...current, description: event.target.value } : current)}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#0d1b2e]/10 bg-white">
          <div className="flex flex-col gap-3 border-b border-[#0d1b2e]/8 bg-[#f8fafc] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#0057e7]/15 bg-[#eef5ff] text-[#0057e7]">
                <ClipboardCheck size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-black text-[#0d1b2e]">Etapas do checklist</h3>
                  <span className="rounded-full bg-[#e8edf4] px-2 py-0.5 text-[10px] font-bold text-[#52647c]">
                    {draft.stages.length} {draft.stages.length === 1 ? "etapa" : "etapas"}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#6b7c93]">
                  Organize o fluxo, vincule situações da OS e defina os bloqueios de cada etapa.
                </p>
              </div>
            </div>
            <AdminButton className="w-full justify-center sm:w-auto" onClick={addStage}>
              <Plus size={14} /> Nova etapa
            </AdminButton>
          </div>

          <div className="grid gap-5 p-5 xl:grid-cols-2">
            {draft.stages.map((stage, stageIndex) => <AdminCard key={`${stage.id || stage.code}-${stageIndex}`} className="h-full overflow-hidden shadow-none">
              <div className="border-b border-[#0d1b2e]/8 bg-[#f8fafc] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <FInput
                      label={`Nome da etapa ${stageIndex + 1}`}
                      value={stage.name}
                      onChange={event => updateStage(stageIndex, { name: event.target.value })}
                      placeholder="Ex.: Entrada"
                    />
                    <p className="mt-1.5 text-[11px] text-[#6b7c93]">
                      {stage.situation_id
                        ? `Vinculada a ${data?.situations.find(item => item.id === stage.situation_id)?.name || "Situação"}`
                        : "Sem situação vinculada"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <AdminButton
                      variant="secondary"
                      className="px-2"
                      disabled={stageIndex === 0}
                      onClick={() => moveStage(stageIndex, -1)}
                      title="Mover etapa para cima"
                    >
                      <ArrowUp size={14} />
                    </AdminButton>
                    <AdminButton
                      variant="secondary"
                      className="px-2"
                      disabled={stageIndex === draft.stages.length - 1}
                      onClick={() => moveStage(stageIndex, 1)}
                      title="Mover etapa para baixo"
                    >
                      <ArrowDown size={14} />
                    </AdminButton>
                    <AdminButton
                      variant="secondary"
                      className="border-red-200 bg-red-50 px-3 text-red-600 hover:bg-red-100"
                      onClick={() => removeStage(stageIndex)}
                      title="Excluir etapa"
                    >
                      <Trash2 size={14} /> Excluir etapa
                    </AdminButton>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FSelect
                    label="Tipo"
                    value={stage.stage_type}
                    onChange={(event: any) => updateStage(stageIndex, { stage_type: event.target.value as ChecklistStageType })}
                    options={STAGE_TYPE_OPTIONS}
                  />
                  <FSelect
                    label="Situação da OS"
                    value={stage.situation_id || ""}
                    onChange={(event: any) => updateStage(stageIndex, { situation_id: event.target.value || null })}
                    options={[
                      { value: "", label: "Sem vínculo" },
                      ...(data?.situations ?? []).map(item => ({ value: item.id, label: item.name })),
                    ]}
                  />
                </div>

                <div className="grid gap-2 rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-3 sm:grid-cols-2">
                  <FToggle
                    label="Bloquear saída da situação"
                    checked={stage.block_situation_exit}
                    onChange={checked => updateStage(stageIndex, { block_situation_exit: checked })}
                  />
                  <FToggle
                    label="Bloquear Resolver OS"
                    checked={stage.block_resolution}
                    onChange={checked => updateStage(stageIndex, { block_resolution: checked })}
                  />
                  <div className="sm:col-span-2">
                    <FToggle
                      label="Bloquear Concluir OS"
                      checked={stage.block_completion}
                      onChange={checked => updateStage(stageIndex, { block_completion: checked })}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 border-t border-[#0d1b2e]/8 pt-3">
                    <div>
                      <strong className="text-xs uppercase tracking-wide text-[#52647c]">Itens</strong>
                      <p className="mt-0.5 text-[11px] text-[#7a8aa0]">{stage.items.length} {stage.items.length === 1 ? "item" : "itens"}</p>
                    </div>
                    <AdminButton variant="secondary" onClick={() => addItem(stageIndex)}>
                      <Plus size={13} /> Item
                    </AdminButton>
                  </div>

                  {stage.items.map((item, itemIndex) => <div
                    key={`${item.id || "new"}-${itemIndex}`}
                    className="rounded-xl border border-[#0d1b2e]/10 bg-white p-3"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#0d1b2e]">Item {itemIndex + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeItem(stageIndex, itemIndex)}
                        className="rounded-md p-1.5 text-red-600 transition-colors hover:bg-red-50"
                        title="Excluir item"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <FInput
                          label="Título"
                          value={item.title}
                          onChange={event => updateItem(stageIndex, itemIndex, { title: event.target.value })}
                        />
                      </div>
                      <FSelect
                        label="Resposta"
                        value={item.response_type}
                        onChange={(event: any) => updateItem(stageIndex, itemIndex, { response_type: event.target.value })}
                        options={RESPONSE_OPTIONS}
                      />
                      <FSelect
                        label="Foto"
                        value={item.photo_requirement}
                        onChange={(event: any) => updateItem(stageIndex, itemIndex, { photo_requirement: event.target.value })}
                        options={PHOTO_OPTIONS}
                      />
                      <FSelect
                        label="Observação"
                        value={item.observation_requirement}
                        onChange={(event: any) => updateItem(stageIndex, itemIndex, { observation_requirement: event.target.value })}
                        options={OBSERVATION_OPTIONS}
                      />
                      <div className="flex flex-wrap items-end gap-4 pb-1">
                        <FToggle
                          label="Obrigatório"
                          checked={item.is_required}
                          onChange={checked => updateItem(stageIndex, itemIndex, { is_required: checked })}
                        />
                        <FToggle
                          label="Permitir N/A"
                          checked={item.allow_na}
                          onChange={checked => updateItem(stageIndex, itemIndex, { allow_na: checked })}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <FInput
                          label="Instrução / descrição"
                          value={item.description || ""}
                          onChange={event => updateItem(stageIndex, itemIndex, { description: event.target.value || null })}
                        />
                      </div>
                    </div>
                  </div>)}
                </div>
              </div>
            </AdminCard>)}
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#0d1b2e]/8 bg-white px-5 py-4">
        <BtnSecondary onClick={closeEditor}>Cancelar</BtnSecondary>
        <BtnPrimary disabled={saving} onClick={() => void persist()}>{saving ? "Salvando..." : "Salvar perfil"}</BtnPrimary>
      </div>
    </AdminPage>}
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-[#f5f7fa] p-2.5">
    <span className="block text-[10px] font-bold uppercase text-[#7a8aa0]">{label}</span>
    <strong>{value}</strong>
  </div>;
}