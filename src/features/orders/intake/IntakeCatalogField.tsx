import { useId, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
type Option={id:string;name:string};
const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
export function IntakeCatalogField({label,options,selectedId,onSelect,otherValue,onOtherChange,allowOther=false,disabled=false,error}:{label:string;options:Option[];selectedId:string;onSelect:(id:string,name:string)=>void;otherValue?:string;onOtherChange?:(value:string)=>void;allowOther?:boolean;disabled?:boolean;error?:string}){
 const id=useId(),[open,setOpen]=useState(false),[query,setQuery]=useState<string|null>(null);
 const selected=options.find(o=>o.id===selectedId);
 const other=allowOther&&selectedId==="other";
 const filtered=options.filter(o=>normalize(o.name).includes(normalize(query||""))).slice(0,100);
 const choose=(option:Option)=>{onSelect(option.id,option.name);setQuery(null);setOpen(false);};
 const classes="w-full rounded-xl border bg-white px-3 py-3 text-base text-slate-900 outline-none "+(error?"border-red-500":"border-slate-300 focus:border-blue-600");
 return <div className="relative space-y-1.5" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)){setOpen(false);setQuery(null);}}}>
  <label htmlFor={id} className="text-sm font-semibold text-slate-800">{label}<span className="ml-1 text-red-600">*</span></label>
  <div className="relative"><input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open&&!disabled} aria-controls={id+"-options"} aria-required="true" aria-invalid={Boolean(error)} autoComplete="off" disabled={disabled} className={classes+" pr-9"} value={query??(other?"Outro":selected?.name||"")} placeholder="Digite ou selecione..." onFocus={e=>{e.currentTarget.select();setOpen(true);}} onChange={e=>{setQuery(e.target.value);setOpen(true);}} onKeyDown={e=>{if(e.key==="Escape"){setOpen(false);setQuery(null);}if(e.key==="Enter"){e.preventDefault();const exact=filtered.find(o=>normalize(o.name)===normalize(query||""));if(exact||filtered.length===1)choose(exact||filtered[0]);}}}/><ChevronDown size={16} className="pointer-events-none absolute right-3 top-4 text-slate-500"/></div>
  {open&&!disabled&&<div id={id+"-options"} role="listbox" className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
   {filtered.map(o=><button type="button" role="option" aria-selected={o.id===selectedId} key={o.id} onPointerDown={e=>e.preventDefault()} onClick={()=>choose(o)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-blue-50"><Search size={14} className="shrink-0 text-slate-400"/>{o.name}</button>)}
   {!filtered.length&&<p className="px-3 py-2 text-xs text-slate-500">Nenhum cadastro encontrado.</p>}
   {allowOther&&<button type="button" role="option" aria-selected={other} onPointerDown={e=>e.preventDefault()} onClick={()=>{onSelect("other",query?.trim()||"");setQuery(null);setOpen(false);}} className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-semibold text-blue-700">Outro / não encontrado</button>}
  </div>}
  {other&&<input aria-label={label+" informado"} aria-required="true" aria-invalid={Boolean(error)} maxLength={160} className={classes} value={otherValue||""} disabled={disabled} onChange={e=>onOtherChange?.(e.target.value)} placeholder={"Informe "+label.toLowerCase()}/>}
  {error&&<p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
 </div>;
}
