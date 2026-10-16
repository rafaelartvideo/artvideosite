import { useEffect, useState } from "react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import {
  loadUnionCatalogTemplates, saveUnionCatalogTemplate,
  type CatalogChecklistTemplate, type CatalogTechnicalTemplate, type OfficialTemplates,
} from "../infrastructure/union-catalog-templates.repository";

type Kind = "technical" | "checklist";
type TemplateForm = {
  field_key: string; label: string; field_type: "text" | "number"; required: boolean;
  stage_code: string; title: string; description: string;
  response_type: CatalogChecklistTemplate["response_type"];
  allow_na: boolean; is_required: boolean;
  photo_requirement: CatalogChecklistTemplate["photo_requirement"];
  observation_requirement: CatalogChecklistTemplate["observation_requirement"];
  sort_order: number; is_active: boolean;
};
const EMPTY_FORM: TemplateForm = {
  field_key: "", label: "", field_type: "text", required: false,
  stage_code: "entrada", title: "", description: "",
  response_type: "conformity", allow_na: false, is_required: true,
  photo_requirement: "none", observation_requirement: "none",
  sort_order: 0, is_active: true,
};
const typeOptions = [
  ["conformity", "Conformidade"], ["yes_no", "Sim/Não"], ["confirmation", "Confirmação"],
  ["text", "Texto"], ["number", "Número"],
] as const;

export function UnionEquipmentTemplates({
  equipmentId, canManage,
}: { equipmentId: string; canManage: boolean }) {
  const [templates, setTemplates] = useState<OfficialTemplates>({ technical: [], checklists: [] });
  const [kind, setKind] = useState<Kind>("technical");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let live = true;
    setLoading(true); setEditing(false); setEditingId(null); setError(""); setNotice("");
    void loadUnionCatalogTemplates(equipmentId)
      .then(data => { if (live) setTemplates(data); })
      .catch(cause => { if (live) setError(systemErrorMessage(cause, "Falha ao carregar os templates.")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [equipmentId]);

  const rows = kind === "technical" ? templates.technical : templates.checklists;
  const startNew = () => {
    setEditing(true); setEditingId(null); setForm(EMPTY_FORM); setError(""); setNotice("");
  };
  const startEdit = (item: CatalogTechnicalTemplate | CatalogChecklistTemplate) => {
    setEditing(true); setEditingId(item.id); setError(""); setNotice("");
    setForm({
      ...EMPTY_FORM,
      ...item,
      description: "description" in item ? item.description || "" : "",
    });
  };
  const save = async () => {
    if (!canManage || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const payload: Record<string, string | number | boolean | null> = kind === "technical"
        ? { field_key: form.field_key.trim(), label: form.label.trim(),
            field_type: form.field_type, required: form.required,
            is_active: form.is_active, sort_order: form.sort_order }
        : { stage_code: form.stage_code.trim(), title: form.title.trim(),
            description: form.description.trim(), response_type: form.response_type,
            allow_na: form.allow_na, is_required: form.is_required,
            photo_requirement: form.photo_requirement,
            observation_requirement: form.observation_requirement,
            sort_order: form.sort_order, is_active: form.is_active };
      await saveUnionCatalogTemplate(kind, equipmentId, editingId, payload);
      setTemplates(await loadUnionCatalogTemplates(equipmentId));
      setEditing(false); setEditingId(null); setNotice("Template salvo. Nenhuma empresa foi alterada.");
    } catch (cause) {
      setError(systemErrorMessage(cause, "Não foi possível salvar o template."));
    } finally { setSaving(false); }
  };
  const fieldClass = "w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary";
  const labelClass = "block space-y-1 text-xs font-bold text-muted-foreground";

  return <section className="mt-5 space-y-4 border-t border-border pt-4">
    <h3 className="text-sm font-bold text-foreground">Templates do equipamento</h3>
    <div className="flex flex-wrap gap-2">
      <BtnSecondary onClick={() => { setKind("technical"); setEditing(false); }}>Campos técnicos ({templates.technical.length})</BtnSecondary>
      <BtnSecondary onClick={() => { setKind("checklist"); setEditing(false); }}>Itens de checklist ({templates.checklists.length})</BtnSecondary>
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
    {!editing && <>
      {canManage && <div className="flex justify-end"><BtnPrimary onClick={startNew}>Novo</BtnPrimary></div>}
      {loading ? <LoadingState text="Carregando modelos..." /> : rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhum template cadastrado.</p> : <div className="overflow-x-auto border border-border"><table className="w-full min-w-[440px] text-sm">
        <thead className="bg-muted/70 text-muted-foreground"><tr><th className="p-3 text-left">Nome</th><th className="p-3 text-left">Identificador</th><th className="p-3 text-left">Situação</th><th className="p-3 text-right">Ações</th></tr></thead>
        <tbody className="divide-y divide-border">{rows.map(item => <tr key={item.id} className="hover:bg-muted/50"><td className="p-3 font-semibold text-foreground">{"label" in item ? item.label : item.title}</td><td className="p-3 text-muted-foreground">{"field_key" in item ? item.field_key : item.stage_code}</td><td className="p-3">{item.is_active ? "Ativo" : "Inativo"}</td><td className="p-3 text-right">{canManage && <BtnSecondary onClick={() => startEdit(item)}>Editar</BtnSecondary>}</td></tr>)}</tbody>
      </table></div>}
    </>}
    {editing && <AdminDialog open onClose={() => { if (!saving) setEditing(false); }} title={editingId ? "Editar template" : "Novo template"} className="max-w-2xl" footer={<div className="flex justify-end gap-2"><BtnSecondary disabled={saving} onClick={() => setEditing(false)}>Cancelar</BtnSecondary><BtnPrimary loading={saving} loadingText="Salvando..." onClick={() => void save()}>Salvar</BtnPrimary></div>}><div className="space-y-3">
      {kind === "technical" ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>Chave do campo
          <input className={fieldClass} maxLength={80} disabled={Boolean(editingId)} value={form.field_key}
            onChange={e => setForm(x => ({ ...x,field_key:e.target.value.toLowerCase() }))} placeholder="numero_serie"/>
        </label>
        <label className={labelClass}>Nome do campo
          <input className={fieldClass} maxLength={120} value={form.label}
            onChange={e => setForm(x => ({ ...x,label:e.target.value }))} placeholder="Número de série"/>
        </label>
        <label className={labelClass}>Tipo
          <select className={fieldClass} value={form.field_type}
            onChange={e => setForm(x => ({ ...x,field_type:e.target.value as "text"|"number" }))}>
            <option value="text">Texto</option><option value="number">Número</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pt-5 text-sm text-[#30445f]">
          <input type="checkbox" checked={form.required} onChange={e => setForm(x => ({ ...x,required:e.target.checked }))}/>Obrigatório
        </label>
      </div> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>Etapa (código)
          <input className={fieldClass} value={form.stage_code}
            onChange={e => setForm(x => ({ ...x,stage_code:e.target.value.toLowerCase() }))} placeholder="entrada, diagnostico ou saida_qc"/>
        </label>
        <label className={labelClass}>Título do item
          <input className={fieldClass} maxLength={180} value={form.title}
            onChange={e => setForm(x => ({ ...x,title:e.target.value }))}/>
        </label>
        <label className={labelClass}>Tipo de resposta
          <select className={fieldClass} value={form.response_type}
            onChange={e => setForm(x => ({ ...x,response_type:e.target.value as TemplateForm["response_type"] }))}>
            {typeOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className={labelClass}>Descrição
          <input className={fieldClass} value={form.description}
            onChange={e => setForm(x => ({ ...x,description:e.target.value }))}/>
        </label>
        <label className={labelClass}>Fotografia
          <select className={fieldClass} value={form.photo_requirement}
            onChange={e => setForm(x => ({ ...x,photo_requirement:e.target.value as TemplateForm["photo_requirement"] }))}>
            <option value="none">Não exigida</option><option value="optional">Opcional</option>
            <option value="required">Obrigatória</option><option value="required_on_failure">Se houver falha</option>
          </select>
        </label>
        <label className={labelClass}>Observação
          <select className={fieldClass} value={form.observation_requirement}
            onChange={e => setForm(x => ({ ...x,observation_requirement:e.target.value as TemplateForm["observation_requirement"] }))}>
            <option value="none">Não exigida</option><option value="optional">Opcional</option>
            <option value="required">Obrigatória</option><option value="required_on_failure">Se houver falha</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-[#30445f]">
          <input type="checkbox" checked={form.is_required} onChange={e => setForm(x => ({ ...x,is_required:e.target.checked }))}/>Resposta obrigatória
        </label>
        <label className="flex items-center gap-2 text-sm text-[#30445f]">
          <input type="checkbox" checked={form.allow_na} onChange={e => setForm(x => ({ ...x,allow_na:e.target.checked }))}/>Permitir N/A
        </label>
      </div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>Ordenação
          <input type="number" min={0} max={1000000} className={fieldClass} value={form.sort_order}
            onChange={e => setForm(x => ({ ...x,sort_order:Number(e.target.value) }))}/>
        </label>
        <label className="flex items-center gap-2 self-end rounded-lg border border-[#e1e7f0] p-3 text-sm text-[#30445f]">
          <input type="checkbox" checked={form.is_active} onChange={e => setForm(x => ({ ...x,is_active:e.target.checked }))}/>Template ativo
        </label>
      </div>
    </div></AdminDialog>}
  </section>;
}
