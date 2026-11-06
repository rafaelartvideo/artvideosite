import type { CustomField } from "../domain/order-rules";
import { Section } from "@/shared/ui/admin/AdminLayout";
const input="w-full min-w-0 rounded-lg border border-border bg-card p-3 text-sm text-foreground";
export function OrderCustomValues({fields,values,onChange,editing}:{fields:CustomField[];values:Record<string,any>;onChange:(v:Record<string,any>)=>void;editing:boolean}){
 const shown=fields.filter(field=>field.mode!=="hidden"||(editing&&values[field.key]!=null));
 if(!shown.length)return null;
 const update=(key:string,value:any)=>onChange({...values,[key]:value});
 return <Section title="Campos personalizados">
  <div className="grid gap-3 sm:grid-cols-2">
   {shown.map(field=><label key={field.key} className="min-w-0 space-y-1">
    <span className="block text-xs font-semibold text-foreground">{field.label}
     {field.mode==="required"&&field.stage==="create"&&!editing&&<span className="text-red-600"> *</span>}
    </span>
    {field.type==="select"?<select className={input} value={String(values[field.key]||"")} onChange={e=>update(field.key,e.target.value)}>
     <option value="">Selecionar...</option>{(field.options||[]).map(option=><option key={option} value={option}>{option}</option>)}
    </select>:field.type==="checkbox"?<input className="h-5 w-5 accent-primary" type="checkbox" checked={values[field.key]===true||values[field.key]==="true"} onChange={e=>update(field.key,e.target.checked)}/>
    :<input className={input} type={field.type==="date"?"date":field.type==="number"?"number":"text"}
     value={String(values[field.key]??"")} onChange={e=>update(field.key,e.target.value)}/>}
   </label>)}
  </div>
 </Section>;
}
