import { Plus, Trash2 } from "lucide-react";
import type { EquipmentChecklistItem } from "@/features/checklists/domain/checklist";
import type { EquipmentDraft, EquipmentCatalog } from "../domain/equipment";
import { AdminButton, AdminCard, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput, FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";

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
const OBS_OPTIONS = [
  { value: "none", label: "Sem observação" },
  { value: "optional", label: "Observação opcional" },
  { value: "required", label: "Observação obrigatória" },
  { value: "required_on_failure", label: "Obrigatória se houver falha" },
];

function blankExtra(stageCode: string, sortOrder: number): EquipmentChecklistItem {
  return {
    stage_code: stageCode,
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

export function EquipmentChecklistSection({ draft, catalog, onChange }: {
  draft: EquipmentDraft;
  catalog: EquipmentCatalog;
  onChange: (patch: Partial<EquipmentDraft>) => void;
}) {
  const selectedStages = catalog.checklistStages.filter(stage => stage.profile_id === draft.checklist_profile_id);
  const stageOptions = selectedStages.map(stage => ({ value: stage.code, label: stage.name }));
  const selectableProfiles = catalog.checklistProfiles.filter(profile => profile.is_active || profile.id === draft.checklist_profile_id);
  const profileOptions = [
    { value: "", label: "Sem perfil de checklist" },
    ...selectableProfiles.map(profile => ({ value: profile.id, label: `${profile.name} • v${profile.version}${profile.is_active ? "" : " • Inativo"}` })),
  ];

  const updateItem = (index: number, patch: Partial<EquipmentChecklistItem>) => onChange({ checklistItems: draft.checklistItems.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  const addItem = () => {
    if (!stageOptions.length) return;
    onChange({ checklistItems: [...draft.checklistItems, blankExtra(stageOptions[0].value, draft.checklistItems.length * 10)] });
  };
  const removeItem = (index: number) => onChange({ checklistItems: draft.checklistItems.filter((_, itemIndex) => itemIndex !== index) });

  return <Section title="Checklist">
    <div className="space-y-4">
      <FSelect
        label="Perfil de checklist"
        value={draft.checklist_profile_id || ""}
        options={profileOptions}
        onChange={(event: any) => {
          const nextProfileId = event.target.value || null;
          const nextStageCodes = new Set(catalog.checklistStages.filter(stage => stage.profile_id === nextProfileId).map(stage => stage.code));
          onChange({
            checklist_profile_id: nextProfileId,
            checklistItems: draft.checklistItems.filter(item => nextStageCodes.has(item.stage_code)),
          });
        }}
      />
      {draft.checklist_profile_id && <>
        <div className="rounded-xl border border-[#0057e7]/12 bg-[#eef5ff]/55 p-3 text-xs leading-5 text-[#426080]">
          Este equipamento usará o perfil selecionado. Os itens abaixo são adicionais e serão copiados para cada nova OS junto com o perfil.
        </div>
        <div className="flex items-center justify-between gap-3"><div><strong className="text-xs uppercase tracking-wide text-[#52647c]">Itens adicionais deste equipamento</strong><p className="mt-0.5 text-xs text-[#6b7c93]">Use apenas para verificações específicas deste tipo de equipamento.</p></div><AdminButton variant="secondary" onClick={addItem} disabled={!stageOptions.length}><Plus size={14} /> Item</AdminButton></div>
        {!draft.checklistItems.length ? <p className="rounded-lg border border-dashed border-[#0d1b2e]/12 p-4 text-center text-xs text-[#6b7c93]">Nenhum item adicional. O equipamento usará somente os itens do perfil.</p> : <div className="space-y-3">{draft.checklistItems.map((item, index) => <AdminCard key={`${item.id || "new"}-${index}`} className="p-3 shadow-none">
          <div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold text-[#0d1b2e]">Item adicional {index + 1}</span><button type="button" onClick={() => removeItem(index)} className="rounded-md p-1.5 text-red-600 hover:bg-red-50"><Trash2 size={14} /></button></div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="md:col-span-2"><FInput label="Título" value={item.title} onChange={(event: any) => updateItem(index, { title: event.target.value })} /></div>
            <FSelect label="Etapa" value={item.stage_code} options={stageOptions} onChange={(event: any) => updateItem(index, { stage_code: event.target.value })} />
            <FSelect label="Resposta" value={item.response_type} options={RESPONSE_OPTIONS} onChange={(event: any) => updateItem(index, { response_type: event.target.value })} />
            <FSelect label="Foto" value={item.photo_requirement} options={PHOTO_OPTIONS} onChange={(event: any) => updateItem(index, { photo_requirement: event.target.value })} />
            <FSelect label="Observação" value={item.observation_requirement} options={OBS_OPTIONS} onChange={(event: any) => updateItem(index, { observation_requirement: event.target.value })} />
            <div className="flex flex-wrap items-end gap-4 pb-1"><FToggle label="Obrigatório" checked={item.is_required} onChange={checked => updateItem(index, { is_required: checked })} /><FToggle label="Permitir N/A" checked={item.allow_na} onChange={checked => updateItem(index, { allow_na: checked })} /></div>
            <div className="md:col-span-2 lg:col-span-3"><FInput label="Instrução / descrição" value={item.description || ""} onChange={(event: any) => updateItem(index, { description: event.target.value || null })} /></div>
          </div>
        </AdminCard>)}</div>}
      </>}
    </div>
  </Section>;
}