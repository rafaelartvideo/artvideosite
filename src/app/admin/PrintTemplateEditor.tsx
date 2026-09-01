import React, { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, FileText, Save, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PRINT_FIELD_REGISTRY } from "./printFieldRegistry";
import { cn, INPUT } from "./shared";

export type PrintTemplateEditorValue = {
  id?: string;
  name: string;
  description: string;
  document_type: string;
  is_active: boolean;
  paper_size: string;
  orientation: "portrait" | "landscape";
  margin_top: number;
  margin_right: number;
  margin_bottom: number;
  margin_left: number;
  show_logo: boolean;
  show_company_info: boolean;
  show_page_number: boolean;
  show_printed_at: boolean;
  header_text: string;
  footer_text: string;
  selectedFields: Set<string>;
};

export const emptyPrintTemplateEditorValue = (): PrintTemplateEditorValue => ({
  name: "", description: "", document_type: "CUSTOM", is_active: true,
  paper_size: "A4", orientation: "portrait", margin_top: 12, margin_right: 12, margin_bottom: 12, margin_left: 12,
  show_logo: true, show_company_info: true, show_page_number: false, show_printed_at: true,
  header_text: "", footer_text: "", selectedFields: new Set(),
});

export function PrintTemplateEditor({ initialValue, onCancel, onSaved }: { initialValue: PrintTemplateEditorValue; onCancel: () => void; onSaved: () => void }) {
  const [value, setValue] = useState<PrintTemplateEditorValue>(() => ({ ...initialValue, selectedFields: new Set(initialValue.selectedFields) }));
  const [expanded, setExpanded] = useState<Set<string>>(new Set(PRINT_FIELD_REGISTRY.slice(0, 3).map(section => section.key)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
    if (!value.name.trim()) { setError("Informe o nome do documento."); return; }
    if (!selectedCount) { setError("Selecione pelo menos um campo para o documento."); return; }
    setSaving(true); setError("");
    try {
      const templatePayload = {
        name: value.name.trim(), description: value.description.trim() || null, document_type: value.document_type,
        is_active: value.is_active, paper_size: value.paper_size, orientation: value.orientation,
        margin_top: value.margin_top, margin_right: value.margin_right, margin_bottom: value.margin_bottom, margin_left: value.margin_left,
        show_logo: value.show_logo, show_company_info: value.show_company_info, show_page_number: value.show_page_number,
        show_printed_at: value.show_printed_at, header_text: value.header_text.trim() || null, footer_text: value.footer_text.trim() || null,
      };
      let templateId = value.id;
      if (templateId) {
        const { error: updateError } = await (supabase as any).from("print_templates").update(templatePayload).eq("id", templateId);
        if (updateError) throw updateError;
        const { error: deleteError } = await (supabase as any).from("print_template_sections").delete().eq("template_id", templateId);
        if (deleteError) throw deleteError;
      } else {
        const { data, error: insertError } = await (supabase as any).from("print_templates").insert(templatePayload).select("id").single();
        if (insertError) throw insertError;
        templateId = data.id;
      }
      for (let sectionIndex = 0; sectionIndex < selectedSections.length; sectionIndex++) {
        const section = selectedSections[sectionIndex];
        const { data: sectionRow, error: sectionError } = await (supabase as any).from("print_template_sections").insert({
          template_id: templateId, section_key: section.key, title: section.label, sort_order: sectionIndex,
          columns: section.defaultColumns, is_enabled: true, settings: {},
        }).select("id").single();
        if (sectionError) throw sectionError;
        const fields = section.fields.filter(field => value.selectedFields.has(field.key));
        if (fields.length) {
          const { error: fieldsError } = await (supabase as any).from("print_template_fields").insert(fields.map((field, index) => ({
            template_section_id: sectionRow.id, field_key: field.key, label: field.label, sort_order: index, is_enabled: true, settings: {},
          })));
          if (fieldsError) throw fieldsError;
        }
      }
      onSaved();
    } catch (saveError: any) {
      setError(saveError?.message || "Não foi possível salvar o modelo.");
    } finally { setSaving(false); }
  };

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-bold uppercase tracking-wider text-[#0057e7]">Editor de documento</div><h2 className="mt-1 text-xl font-black text-[#0d1b2e]">{value.id ? "Configurar modelo" : "Novo modelo"}</h2></div><button type="button" onClick={onCancel} className="inline-flex items-center gap-2 self-start rounded-lg border border-[#d8e0eb] bg-white px-3 py-2 text-sm font-bold text-[#42526a]"><X size={15}/> Fechar</button></div>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <section className="rounded-xl border border-[#0d1b2e]/10 bg-white p-5 shadow-sm"><h3 className="font-black text-[#0d1b2e]">Configuração</h3><div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Nome"><input className={INPUT} value={value.name} onChange={e => setValue(v => ({...v,name:e.target.value}))} placeholder="Ex.: Ordem de Serviço" /></Field>
          <Field label="Tipo"><select className={INPUT} value={value.document_type} onChange={e => setValue(v => ({...v,document_type:e.target.value}))}><option value="OS">Ordem de Serviço</option><option value="ENTRADA">Entrada</option><option value="SAIDA_DEVOLUCAO">Saída / Devolução</option><option value="LAUDO">Laudo técnico</option><option value="COMPROVANTE">Comprovante</option><option value="CUSTOM">Personalizado</option></select></Field>
          <Field label="Descrição" wide><textarea className={cn(INPUT,"min-h-20 resize-y")} value={value.description} onChange={e => setValue(v => ({...v,description:e.target.value}))}/></Field>
          <Field label="Orientação"><select className={INPUT} value={value.orientation} onChange={e => setValue(v => ({...v,orientation:e.target.value as any}))}><option value="portrait">Retrato</option><option value="landscape">Paisagem</option></select></Field>
          <Field label="Papel"><select className={INPUT} value={value.paper_size} disabled><option>A4</option></select></Field>
        </div><div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{(["margin_top","margin_right","margin_bottom","margin_left"] as const).map((key,index)=><Field key={key} label={["Margem superior","Direita","Inferior","Esquerda"][index]}><input type="number" min="0" className={INPUT} value={value[key]} onChange={e=>setValue(v=>({...v,[key]:Number(e.target.value)}))}/></Field>)}</div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{([['show_logo','Exibir logo'],['show_company_info','Dados da empresa'],['show_page_number','Número da página'],['show_printed_at','Data da impressão'],['is_active','Modelo ativo']] as const).map(([key,label])=><CheckOption key={key} checked={value[key]} label={label} onChange={()=>setValue(v=>({...v,[key]:!v[key]}))}/>)}</div>
        <div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Texto do cabeçalho"><input className={INPUT} value={value.header_text} onChange={e=>setValue(v=>({...v,header_text:e.target.value}))}/></Field><Field label="Texto do rodapé"><input className={INPUT} value={value.footer_text} onChange={e=>setValue(v=>({...v,footer_text:e.target.value}))}/></Field></div></section>
        <section className="overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white shadow-sm"><div className="border-b border-[#0d1b2e]/8 p-5"><div className="flex items-center justify-between"><div><h3 className="font-black text-[#0d1b2e]">Campos</h3><p className="mt-1 text-xs text-[#5a6a82]">Marque os dados que farão parte deste documento.</p></div><span className="rounded-full bg-[#edf3ff] px-2.5 py-1 text-xs font-bold text-[#0057e7]">{selectedCount} selecionados</span></div></div><div className="divide-y divide-[#0d1b2e]/7">{PRINT_FIELD_REGISTRY.map(section=>{const open=expanded.has(section.key);const count=section.fields.filter(f=>value.selectedFields.has(f.key)).length;return <div key={section.key}><div className="flex items-center gap-2 px-4 py-3"><button type="button" onClick={()=>setExpanded(s=>{const n=new Set(s);n.has(section.key)?n.delete(section.key):n.add(section.key);return n;})} className="p-1 text-[#5a6a82]">{open?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</button><button type="button" onClick={()=>toggleSection(section.key)} className={cn("flex h-5 w-5 items-center justify-center rounded border",count===section.fields.length?"border-[#0057e7] bg-[#0057e7] text-white":"border-[#b8c3d1] bg-white")}>{count===section.fields.length&&<Check size={13}/>}</button><button type="button" onClick={()=>setExpanded(s=>new Set(s).add(section.key))} className="flex-1 text-left"><span className="font-bold text-[#0d1b2e]">{section.label}</span><span className="ml-2 text-xs text-[#7a889c]">{count}/{section.fields.length}</span></button></div>{open&&<div className="grid gap-2 bg-[#f8fafc] px-5 py-4 md:grid-cols-2">{section.fields.map(field=><CheckOption key={field.key} checked={value.selectedFields.has(field.key)} label={field.label} detail={field.key} onChange={()=>toggleField(field.key)}/>)}</div>}</div>})}</div></section>
      </div>
      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start"><div className="rounded-xl border border-[#0d1b2e]/10 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><FileText size={18} className="text-[#0057e7]"/><h3 className="font-black text-[#0d1b2e]">Resumo do layout</h3></div><div className="mt-4 space-y-2 text-sm text-[#5a6a82]"><p><b className="text-[#0d1b2e]">{selectedSections.length}</b> seções</p><p><b className="text-[#0d1b2e]">{selectedCount}</b> campos</p><p>{value.paper_size} · {value.orientation==='portrait'?'Retrato':'Paisagem'}</p></div><div className="mt-4 space-y-1.5">{selectedSections.map(section=><div key={section.key} className="rounded-lg bg-[#f5f7fa] px-3 py-2 text-xs font-bold text-[#42526a]">{section.label} · {section.fields.filter(f=>value.selectedFields.has(f.key)).length}</div>)}</div></div><button type="button" disabled={saving} onClick={save} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0057e7] px-4 py-3 text-sm font-bold text-white hover:bg-[#0046c0] disabled:opacity-50"><Save size={17}/>{saving?'Salvando...':'Salvar modelo'}</button></aside>
    </div>
  </div>;
}

function Field({label,children,wide=false}:{label:string;children:React.ReactNode;wide?:boolean}){return <label className={cn("block",wide&&"md:col-span-2")}><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</span>{children}</label>}
function CheckOption({checked,label,detail,onChange}:{checked:boolean;label:string;detail?:string;onChange:()=>void}){return <button type="button" onClick={onChange} className="flex items-start gap-2.5 rounded-lg border border-[#0d1b2e]/8 bg-white p-3 text-left hover:border-[#0057e7]/25"><span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",checked?"border-[#0057e7] bg-[#0057e7] text-white":"border-[#b8c3d1]")}>{checked&&<Check size={13}/>}</span><span><span className="block text-sm font-bold text-[#0d1b2e]">{label}</span>{detail&&<code className="mt-0.5 block break-all text-[9px] text-[#8491a3]">{detail}</code>}</span></button>}
