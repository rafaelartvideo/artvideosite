import type { CustomField } from "../domain/order-rules";
import { BtnSecondary } from "@/shared/ui/admin/AdminLayout";
const input="w-full min-w-0 rounded-lg border border-border bg-card px-2 py-2 text-sm text-foreground";
export function OrderCustomFieldsEditor({fields,onChange,disabled}:{fields:CustomField[];onChange:(fields:CustomField[])=>void;disabled:boolean}){
 const change=(index:number,patch:Partial<CustomField>)=>onChange(fields.map((f,i)=>i===index?{...f,...patch}:f));
 return <div className="space-y-2">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h3 className="font-semibold text-sm">Campos personalizados</h3>
   <BtnSecondary disabled={disabled||fields.length>=30} onClick={()=>onChange([...fields,{key:"campo_"+crypto.randomUUID().slice(0,8),label:"Novo campo",type:"text",mode:"optional",stage:"create"}])}>Adicionar campo</BtnSecondary>
  </div>
  <p className="text-xs text-muted-foreground">Até 30 campos por regra. Arquivos são enviados após a criação da OS e podem ser exigidos ao iniciar ou concluir o serviço.</p>
  {fields.map((f,i)=><div key={f.key} className="space-y-2 rounded-lg border border-border p-3">
   <div className="flex items-center gap-2">
    <input className={input} disabled={disabled} maxLength={80} aria-label="Nome do campo" value={f.label} onChange={e=>change(i,{label:e.target.value})}/>
    <button disabled={disabled} className="shrink-0 rounded-lg border border-border p-2 text-sm text-red-600" onClick={()=>onChange(fields.filter((_,j)=>i!==j))}>Excluir</button>
   </div>
   <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
    <select className={input} aria-label="Tipo de campo" disabled={disabled} value={f.type} onChange={e=>change(i,{type:e.target.value as CustomField["type"],stage:e.target.value==="file"&&f.stage==="create"?"start":f.stage})}>
     {([["text","Texto"],["number","Número"],["date","Data"],["select","Seleção"],["checkbox","Checkbox"],["file","Arquivo"]] as const).map(([v,label])=><option key={v} value={v}>{label}</option>)}
    </select>
    <select className={input} aria-label="Exigência" disabled={disabled} value={f.mode} onChange={e=>change(i,{mode:e.target.value as CustomField["mode"]})}>
     <option value="required">Obrigatório</option><option value="optional">Opcional</option><option value="hidden">Oculto</option>
    </select>
    <select className={input} aria-label="Quando exigir" disabled={disabled} value={f.stage} onChange={e=>change(i,{stage:e.target.value as CustomField["stage"]})}>
     {f.type!=="file"&&<option value="create">Criar OS</option>}<option value="start">Iniciar serviço</option><option value="finish">Concluir OS</option>
    </select>
   </div>
   {f.type==="select"&&<input className={input} disabled={disabled} aria-label="Opções separadas por vírgula" placeholder="Opção 1, Opção 2"
    value={(f.options||[]).join(", ")} onChange={e=>change(i,{options:e.target.value.split(",").map(x=>x.trim()).filter(Boolean).slice(0,30)})}/>}
  </div>)}
 </div>;
}
