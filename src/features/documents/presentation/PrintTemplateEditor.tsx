import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Eye, Save } from "lucide-react";
import { PRINT_FIELD_REGISTRY } from "../domain/print-field-registry";
import { cn } from "@/shared/domain/formatters";
import { FDecimalInput, FIntegerInput, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { AdminCard, AdminCardHeader, AdminCardContent, BtnPrimary, BtnSecondary, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { PrintTemplatePreview } from "./PrintTemplatePreview";
import type { PrintTemplateEditorValue } from "../domain/print-template";

const inRange = (value: unknown, min: number, max: number, integer = false) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max && (!integer || Number.isInteger(numeric));
};

export function PrintTemplateEditor({ initialValue, onCancel, onSave, saving, saveError }: { initialValue: PrintTemplateEditorValue; onCancel: () => void; onSave: (value: PrintTemplateEditorValue) => Promise<unknown>; saving: boolean; saveError?: string }) {
  const [value, setValue] = useState<PrintTemplateEditorValue>(() => ({ ...initialValue, layout: { ...initialValue.layout }, selectedFields: new Set(initialValue.selectedFields) }));
  const [expanded, setExpanded] = useState<Set<string>>(new Set(PRINT_FIELD_REGISTRY.slice(0, 3).map(section => section.key)));
  const [validationError, setValidationError] = useState("");
  useEffect(() => {
    setValue({ ...initialValue, layout: { ...initialValue.layout }, selectedFields: new Set(initialValue.selectedFields) });
    setValidationError("");
  }, [initialValue]);

  const selectedCount = value.selectedFields.size;
  const selectedSections = useMemo(() => PRINT_FIELD_REGISTRY.filter(section => section.fields.some(field => value.selectedFields.has(field.key))), [value.selectedFields]);

  const toggleField = (key: string) => setValue(current => {
    const fields = new Set(current.selectedFields);
    fields.has(key) ? fields.delete(key) : fields.add(key);
    return { ...current, selectedFields: fields };
  });

  const toggleSection = (sectionKey: string) => {
    const section = PRINT_FIELD_REGISTRY.find(item => item.key === sectionKey);
    if (!section) return;
    setValue(current => {
      const fields = new Set(current.selectedFields);
      const allSelected = section.fields.every(field => fields.has(field.key));
      section.fields.forEach(field => allSelected ? fields.delete(field.key) : fields.add(field.key));
      return { ...current, selectedFields: fields };
    });
  };

  const save = async () => {
    if (!value.name.trim()) { setValidationError("Informe o nome do documento."); return; }
    if (!selectedCount) { setValidationError("Selecione pelo menos um campo para o documento."); return; }
    if (![value.margin_top, value.margin_right, value.margin_bottom, value.margin_left].every(item => inRange(item, 0, 100, true))) { setValidationError("As margens devem ser números inteiros entre 0 e 100."); return; }
    if (!inRange(value.layout.body_font_size, 7, 18, true)) { setValidationError("O tamanho do texto deve estar entre 7 e 18 pt."); return; }
    if (!inRange(value.layout.label_font_size, 6, 14, true)) { setValidationError("O tamanho dos rótulos deve estar entre 6 e 14 pt."); return; }
    if (!inRange(value.layout.section_title_font_size, 8, 18, true)) { setValidationError("O título das seções deve estar entre 8 e 18 pt."); return; }
    if (!inRange(value.layout.line_height, 1, 2)) { setValidationError("A altura da linha deve estar entre 1 e 2."); return; }
    if (!inRange(value.layout.section_spacing, 0, 40, true)) { setValidationError("O espaço entre seções deve estar entre 0 e 40 px."); return; }
    if (!inRange(value.layout.field_spacing, 0, 30, true)) { setValidationError("O espaço entre campos deve estar entre 0 e 30 px."); return; }
    setValidationError("");
    await onSave(value);
  };

  return <div className="space-y-5">
    <PageHeader
      eyebrow="Documentos"
      title={value.id ? "Configurar documento" : "Novo documento"}
      subtitle="Defina o conteúdo, a apresentação e visualize o resultado da impressão em tempo real."
      actions={<div className="flex flex-wrap items-center gap-2"><BtnSecondary onClick={onCancel}>Cancelar</BtnSecondary><BtnPrimary onClick={() => { void save(); }} disabled={saving}><Save size={16}/>{saving ? "Salvando..." : "Salvar documento"}</BtnPrimary></div>}
    />
    {(validationError || saveError) && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{validationError || saveError}</div>}
    <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
      <div className="space-y-5">
        <AdminCard>
          <AdminCardContent>
            <h3 className="font-black text-[#0d1b2e]">Configuração</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Nome"><input className={INPUT} value={value.name} onChange={e => setValue(v => ({...v,name:e.target.value}))} placeholder="Ex.: Ordem de Serviço" /></Field>
              <Field label="Tipo"><select className={INPUT} value={value.document_type} onChange={e => setValue(v => ({...v,document_type:e.target.value}))}><option value="OS">Ordem de Serviço</option><option value="ENTRADA">Entrada</option><option value="SAIDA_DEVOLUCAO">Saída / Devolução</option><option value="LAUDO">Laudo técnico</option><option value="COMPROVANTE">Comprovante</option><option value="CUSTOM">Personalizado</option></select></Field>
              <Field label="Descrição" wide><textarea className={cn(INPUT,"min-h-20 resize-y")} value={value.description} onChange={e => setValue(v => ({...v,description:e.target.value}))}/></Field>
              <Field label="Orientação"><select className={INPUT} value={value.orientation} onChange={e => setValue(v => ({...v,orientation:e.target.value as any}))}><option value="portrait">Retrato</option><option value="landscape">Paisagem</option></select></Field>
              <Field label="Papel"><select className={INPUT} value={value.paper_size} disabled><option>A4</option></select></Field>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{(["margin_top","margin_right","margin_bottom","margin_left"] as const).map((key,index)=><Field key={key} label={["Margem superior","Direita","Inferior","Esquerda"][index]}><FIntegerInput value={String(value[key])} onChange={(e:any)=>setValue(v=>({...v,[key]:Number(e.target.value || 0)}))} /></Field>)}</div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">{([['show_logo','Exibir logo'],['show_company_info','Dados da empresa'],['show_page_number','Número da página'],['show_printed_at','Data da impressão'],['is_active','Modelo ativo']] as const).map(([key,label])=><CheckOption key={key} checked={value[key]} label={label} onChange={()=>setValue(v=>({...v,[key]:!v[key]}))}/>)}</div>
            <div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Texto do cabeçalho"><input className={INPUT} value={value.header_text} onChange={e=>setValue(v=>({...v,header_text:e.target.value}))}/></Field><Field label="Texto do rodapé"><input className={INPUT} value={value.footer_text} onChange={e=>setValue(v=>({...v,footer_text:e.target.value}))}/></Field></div>
          </AdminCardContent>
        </AdminCard>

        <AdminCard>
          <AdminCardContent>
            <h3 className="font-black text-[#0d1b2e]">Aparência da impressão</h3>
            <p className="mt-1 text-xs text-[#5a6a82]">Estas configurações são aplicadas igualmente na pré-visualização e no documento impresso.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Fonte"><select className={INPUT} value={value.layout.font_family} onChange={e => setValue(v => ({ ...v, layout: { ...v.layout, font_family: e.target.value as typeof v.layout.font_family } }))}><option value="Arial">Arial</option><option value="Inter">Inter</option><option value="Times New Roman">Times New Roman</option><option value="Courier New">Courier New</option></select></Field>
              <Field label="Estilo das informações"><select className={INPUT} value={value.layout.section_style} onChange={e => setValue(v => ({ ...v, layout: { ...v.layout, section_style: e.target.value as typeof v.layout.section_style } }))}><option value="lines">Linhas</option><option value="boxed">Blocos</option><option value="table">Tabela</option></select></Field>
              <Field label="Texto (pt)"><FIntegerInput value={String(value.layout.body_font_size)} onChange={(e:any)=>setValue(v=>({...v,layout:{...v.layout,body_font_size:Number(e.target.value || 0)}}))} /></Field>
              <Field label="Rótulos (pt)"><FIntegerInput value={String(value.layout.label_font_size)} onChange={(e:any)=>setValue(v=>({...v,layout:{...v.layout,label_font_size:Number(e.target.value || 0)}}))} /></Field>
              <Field label="Título das seções (pt)"><FIntegerInput value={String(value.layout.section_title_font_size)} onChange={(e:any)=>setValue(v=>({...v,layout:{...v.layout,section_title_font_size:Number(e.target.value || 0)}}))} /></Field>
              <Field label="Altura da linha"><FDecimalInput value={String(value.layout.line_height)} decimalPlaces={1} onChange={(e:any)=>setValue(v=>({...v,layout:{...v.layout,line_height:Number(e.target.value || 0)}}))} /></Field>
              <Field label="Espaço entre seções (px)"><FIntegerInput value={String(value.layout.section_spacing)} onChange={(e:any)=>setValue(v=>({...v,layout:{...v.layout,section_spacing:Number(e.target.value || 0)}}))} /></Field>
              <Field label="Espaço entre campos (px)"><FIntegerInput value={String(value.layout.field_spacing)} onChange={(e:any)=>setValue(v=>({...v,layout:{...v.layout,field_spacing:Number(e.target.value || 0)}}))} /></Field>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2"><CheckOption checked={value.layout.show_section_borders} label="Exibir linhas das seções" onChange={() => setValue(v => ({ ...v, layout: { ...v.layout, show_section_borders: !v.layout.show_section_borders } }))} /><CheckOption checked={value.layout.show_field_borders} label="Exibir bordas nos campos" onChange={() => setValue(v => ({ ...v, layout: { ...v.layout, show_field_borders: !v.layout.show_field_borders } }))} /></div>
          </AdminCardContent>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader>
            <div><h3 className="font-black text-[#0d1b2e]">Campos</h3><p className="mt-1 text-xs text-[#5a6a82]">Marque os dados que farão parte deste documento.</p></div>
            <span className="rounded-full bg-[#edf3ff] px-2.5 py-1 text-xs font-bold text-[#0057e7]">{selectedCount} selecionados</span>
          </AdminCardHeader>
          <div className="divide-y divide-[#0d1b2e]/7">{PRINT_FIELD_REGISTRY.map(section=>{const open=expanded.has(section.key);const count=section.fields.filter(f=>value.selectedFields.has(f.key)).length;return <div key={section.key}><div className="flex items-center gap-2 px-4 py-3"><button type="button" onClick={()=>setExpanded(s=>{const n=new Set(s);n.has(section.key)?n.delete(section.key):n.add(section.key);return n;})} className="p-1 text-[#5a6a82]">{open?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</button><button type="button" onClick={()=>toggleSection(section.key)} className={cn("flex h-5 w-5 items-center justify-center rounded border",count===section.fields.length?"border-[#0057e7] bg-[#0057e7] text-white":"border-[#b8c3d1] bg-white")}>{count===section.fields.length&&<Check size={13}/>}</button><button type="button" onClick={()=>setExpanded(s=>new Set(s).add(section.key))} className="flex-1 text-left"><span className="font-bold text-[#0d1b2e]">{section.label}</span><span className="ml-2 text-xs text-[#7a889c]">{count}/{section.fields.length}</span></button></div>{open&&<div className="grid gap-2 bg-[#f8fafc] px-5 py-4 md:grid-cols-2">{section.fields.map(field=><CheckOption key={field.key} checked={value.selectedFields.has(field.key)} label={field.label} detail={field.key} onChange={()=>toggleField(field.key)}/>)}</div>}</div>})}</div>
        </AdminCard>
      </div>

      <aside className="space-y-4 2xl:sticky 2xl:top-4 2xl:self-start">
        <AdminCard>
          <AdminCardHeader>
            <div className="flex items-center gap-2"><Eye size={18} className="text-[#0057e7]"/><div><h3 className="font-black text-[#0d1b2e]">Pré-visualização</h3><p className="text-xs text-[#5a6a82]">Atualizada enquanto você configura.</p></div></div>
            <span className="rounded-full bg-[#edf3ff] px-2.5 py-1 text-xs font-bold text-[#0057e7]">{selectedCount} campos</span>
          </AdminCardHeader>
          <div className="max-h-[calc(100vh-15rem)] overflow-auto bg-slate-100 p-4"><PrintTemplatePreview template={value} compact /></div>
        </AdminCard>
        <AdminCard className="p-4 text-sm text-[#5a6a82]">
          <div className="flex flex-wrap gap-x-5 gap-y-1"><span><b className="text-[#0d1b2e]">{selectedSections.length}</b> seções</span><span><b className="text-[#0d1b2e]">{selectedCount}</b> campos</span><span>{value.paper_size} · {value.orientation === "portrait" ? "Retrato" : "Paisagem"}</span></div>
        </AdminCard>
      </aside>
    </div>
  </div>;
}

function Field({label,children,wide=false}:{label:string;children:React.ReactNode;wide?:boolean}){return <label className={cn("block",wide&&"md:col-span-2")}><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</span>{children}</label>}
function CheckOption({checked,label,detail,onChange}:{checked:boolean;label:string;detail?:string;onChange:()=>void}){return <AdminCard className="p-0 shadow-none"><button type="button" onClick={onChange} className="flex w-full items-start gap-2.5 p-3 text-left hover:bg-[#f8fafc]"><span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",checked?"border-[#0057e7] bg-[#0057e7] text-white":"border-[#b8c3d1]")}>{checked&&<Check size={13}/>}</span><span><span className="block text-sm font-bold text-[#0d1b2e]">{label}</span>{detail&&<code className="mt-0.5 block break-all text-[9px] text-[#8491a3]">{detail}</code>}</span></button></AdminCard>}
