import { useEffect, useMemo, useState } from 'react';
import { SAC_ENDPOINTS } from '../../../../supabase/functions/_shared/sac-contracts.mjs';
import { fieldVisible, formValues, resultItems, initialValues, recordContext, friendlyEntries, actionLabel } from '../domain/resource-ui.mjs';
import { operateSacDigitalResource, sacDigitalMediaUrl, type SacDigitalResourceResult } from '../infrastructure/sac-digital.repository';
import { AdminButton, BtnSecondary } from '@/shared/ui/admin/AdminLayout';

type Field = { name:string; label:string; type:string; required?:boolean; options?:any[]; when?:unknown };
const inputClass='admin-input w-full rounded-lg border border-border bg-card px-3 py-2 text-sm';
export function StructuredEditor({field,value,onChange}:{field:Field;value:any;onChange:(v:any)=>void}) {
  if(field.type==='variables') return <div className="space-y-2">{['body','header','buttons'].map(section=><div key={section}><p className="text-xs">{({body:'Corpo',header:'Cabeçalho',buttons:'Botões'})[section]}</p>{(value?.[section]||[]).map((v:any,index:number)=><div key={index} className="flex gap-2"><input className={inputClass} aria-label={`Valor ${index+1} — ${section}`} value={v} onChange={e=>onChange({...value,[section]:value[section].map((item:any,i:number)=>i===index?e.target.value:item)})}/><BtnSecondary onClick={()=>onChange({...value,[section]:value[section].filter((_:any,i:number)=>i!==index)})}>Remover</BtnSecondary></div>)}<BtnSecondary onClick={()=>onChange({...value,[section]:[...(value?.[section]||[]),'']})}>Adicionar variável</BtnSecondary></div>)}</div>;
  const rows=Array.isArray(value)?value:[];
  const update=(index:number,patch:any)=>onChange(rows.map((r:any,i:number)=>i===index?{...r,...patch}:r));
  const labels:Record<string,string>={texto:'Texto',imagem:'Imagem',audio:'Áudio',video:'Vídeo',pdf:'PDF',contato:'Contato',localizacao:'Localização',template:'Template'};
  return <div className="space-y-2">{rows.map((row:any,index:number)=><div key={index} className="space-y-2 rounded border border-border p-2">
    <select aria-label="Tipo de conteúdo" className={inputClass} value={row.type||'texto'} onChange={e=>update(index,{type:e.target.value,value:['contato','localizacao'].includes(e.target.value)?[]:''})}>{Object.entries(labels).map(([type,label])=><option key={type} value={type}>{label}</option>)}</select>
    {['contato','localizacao'].includes(row.type)?(row.type==='contato'?['Nome','Telefone']:['Endereço','Latitude','Longitude']).map((label,position)=><input key={label} aria-label={label} placeholder={label} className={inputClass} value={row.value?.[position]||''} onChange={e=>{const values=[...(Array.isArray(row.value)?row.value:[])];values[position]=e.target.value;update(index,{value:values});}}/>):<textarea aria-label={row.type==='texto'?'Mensagem':'Conteúdo'} className={inputClass} placeholder={row.type==='texto'?'Mensagem':row.type==='template'?'Identificador do template aprovado':'https://…'} value={row.value||''} onChange={e=>update(index,{value:e.target.value})}/>}
    {['imagem','video','pdf'].includes(row.type)&&<input className={inputClass} aria-label="Legenda" placeholder="Legenda opcional" value={row.caption||''} onChange={e=>update(index,{caption:e.target.value})}/>}
    <BtnSecondary onClick={()=>onChange(rows.filter((_:any,i:number)=>i!==index))}>Remover</BtnSecondary>
  </div>)}<BtnSecondary onClick={()=>onChange([...rows,{type:'texto',value:''}])}>Adicionar conteúdo</BtnSecondary>{rows.length>0&&<div className="rounded bg-muted p-3 text-sm"><strong>Prévia</strong>{rows.map((r:any,i:number)=><p key={i}>{labels[r.type]}: {Array.isArray(r.value)?r.value.join(' · '):r.value}{r.caption?` · ${r.caption}`:''}</p>)}</div>}</div>;
}
function DetailValue({value}:{value:any}) {
  if(value===null||value===undefined)return <span>—</span>;
  if(typeof value==='boolean')return <span>{value?'Sim':'Não'}</span>;
  if(typeof value==='object')return <div className="space-y-1">{friendlyEntries(value).map(([key,v])=><div key={key}><span className="text-muted-foreground">{key}: </span><DetailValue value={v}/></div>)}</div>;
  const url=sacDigitalMediaUrl(String(value));
  if(url&&/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url))return <img src={url} alt="Mídia do recurso" className="max-h-48 rounded"/>;
  if(url&&/\.(mp3|ogg|wav)(\?|$)/i.test(url))return <audio controls src={url}/>;
  if(url&&/\.(mp4|webm)(\?|$)/i.test(url))return <video controls src={url} className="max-h-48"/>;
  return url?<a href={url} target="_blank" rel="noreferrer" className="underline">Abrir arquivo</a>:<span className="break-words">{String(value)}</span>;
}
export function SacDigitalResources({organizationId,hasPermission,protocol,onInsertAnswer}:{organizationId:string;hasPermission:(p:string)=>boolean;protocol?:string;onInsertAnswer?:(text:string)=>void}) {
  const endpoints=SAC_ENDPOINTS as any[];
  const labels:Record<string,string>={'1':'Transmissão','3':'Status',todos:'Todos os contatos',contatos:'Contatos selecionados',grupos:'Grupos',sexo:'Gênero',etiquetas:'Etiquetas',M:'Masculino',F:'Feminino',I:'Não informado',text:'Texto',image:'Imagem',audio:'Áudio',video:'Vídeo',file:'Arquivo',map:'Localização',vcard:'Contato',template:'Template aprovado'};
  const areas=useMemo(()=>[...new Set(endpoints.map(e=>e.area))],[]);
  const [record,setRecord]=useState<any>(null);
  const [parent,setParent]=useState<any>({});
  const [unavailable,setUnavailable]=useState<Record<string,string>>({});
  const defaultAction=(items:any[])=>items.find(e=>e.method==='GET'&&!e.fields.some((f:Field)=>f.required&&f.name!=='p'))||items.find(e=>e.method==='GET')||items[0];
  const [area,setArea]=useState<string>(areas.includes('Contatos')?'Contatos':areas[0]||'');
  const available=endpoints.filter(e=>e.area===area);
  const [selectedId,setSelectedId]=useState<number>(defaultAction(available)?.id);
  const endpoint=available.find(e=>e.id===selectedId)||available[0];
  const [values,setValues]=useState<Record<string,any>>(() => initialValues(endpoint?.fields||[],protocol));
  const [result,setResult]=useState<SacDigitalResourceResult|null>(null);
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false); const [confirm,setConfirm]=useState(false);
  const uncertain=error.includes('Confirmação pendente');
  const read=endpoint?.method==='GET';
  const privateCredential=endpoint?.fields.some((f:Field)=>/password|credential|secret/i.test(f.name));
  const allowed=!privateCredential && hasPermission(read?'sac_digital.messages.view':/campanh|sms|telefon/i.test(area)?'sac_digital.settings.manage':endpoint?.scopes?.includes('send')?'sac_digital.messages.send':'sac_digital.protocols.manage');
  const change=(name:string,value:any)=>{setValues(v=>({...v,[name]:value}));setConfirm(false);};
  const execute=async(nextPage?:unknown)=>{if(!endpoint||!allowed||busy||uncertain)return;setBusy(true);setError('');try { const submitted=formValues(endpoint.fields,values); if(nextPage!==undefined)submitted[endpoint.fields.some((f:Field)=>f.name==='p')?'p':'page']=nextPage; const response=await operateSacDigitalResource(organizationId,endpoint.id,submitted);setResult(response);setConfirm(false); }catch(caught){const text=caught instanceof Error?caught.message:'Não foi possível concluir a operação.';setError(text);if(/permission_denied|notmodule|sem permissão|m[oó]dulo.*indispon/i.test(text))setUnavailable(v=>({...v,[area]:text}));}finally{setBusy(false);}};
  const chooseAction=(action:any,row?:any)=>{const nextParent={...parent,...(endpoint.id===19&&row?.id?{groupId:row.id}:{}),...(endpoint.id===45&&row?.id?{couponId:row.id}:{})};setParent(nextParent);setSelectedId(action.id);setValues(row?recordContext(action.fields,row,area,protocol,{sourceEndpointId:endpoint.id,parent:nextParent}):initialValues(action.fields,protocol));setResult(null);setError('');setConfirm(false);};
  useEffect(()=>{const first=defaultAction(endpoints.filter(e=>e.area===area));if(!first||first.method!=='GET'||first.fields.some((f:Field)=>f.required&&f.name!=='p')||!hasPermission('sac_digital.messages.view'))return;let cancelled=false;setBusy(true);operateSacDigitalResource(organizationId,first.id,initialValues(first.fields,protocol)).then(response=>{if(!cancelled)setResult(response);}).catch(caught=>{if(!cancelled){const text=caught instanceof Error?caught.message:'Área indisponível.';setError(text);if(/permission_denied|notmodule|sem permissão/i.test(text))setUnavailable(v=>({...v,[area]:text}));}}).finally(()=>{if(!cancelled)setBusy(false);});return()=>{cancelled=true;};},[area,organizationId]);
  return <section aria-label="Recursos SAC Digital" className="space-y-4 rounded-lg border border-border bg-card p-4">
    <div className="flex flex-wrap gap-2">{areas.map(name=><BtnSecondary key={name} onClick={()=>{setArea(name);setRecord(null);setParent({});const first=defaultAction(endpoints.filter(e=>e.area===name));setSelectedId(first?.id);setValues(initialValues(first?.fields||[],protocol));setResult(null);setError('');setConfirm(false);}}>{name}</BtnSecondary>)}</div>
    <div className="flex flex-wrap gap-2" aria-label={`Ações de ${area}`}>{available.map(action=><BtnSecondary key={action.id} disabled={busy} onClick={()=>chooseAction(action,record)}>{actionLabel(action)}</BtnSecondary>)}</div>
    {record&&<div className="rounded bg-muted p-3 text-sm"><p className="font-semibold">{record.name||record.title||record.titulo||record.number||record.code||'Registro selecionado'}</p><BtnSecondary onClick={()=>{setRecord(null);setValues(initialValues(endpoint?.fields||[],protocol));}}>Limpar seleção</BtnSecondary></div>}
    {unavailable[area]&&<p role="status" className="rounded bg-muted p-3 text-sm">Esta área não está disponível para sua conta. {unavailable[area]}</p>}
    <p className="text-sm text-muted-foreground">{endpoint?.purpose}</p>
    {!allowed&&<p role="status" className="text-sm">{privateCredential ? "Credenciais são gerenciadas nas configurações privadas da integração." : "Você não tem permissão para executar este recurso."}</p>}
    <form className="space-y-3" onSubmit={event=>{event.preventDefault();if(!read&&!confirm){setConfirm(true);return;}void execute();}}>
    {(endpoint?.fields||[]).filter((f:Field)=>!privateCredential && fieldVisible(f,values)).map((field:Field)=><label key={field.name} className="block space-y-1 text-sm font-semibold">{field.label}{field.required?' *':''}{/^(id|contact|group|protocol|protocolo|code|coupon|operator|department|channel)$|_id$/.test(field.name)&&!values[field.name]&&<span className="block text-xs font-normal text-muted-foreground">Selecione um registro na lista ou informe seu identificador SAC.</span>}
      {field.type==='content'||field.type==='variables'?<StructuredEditor field={field} value={values[field.name]} onChange={v=>change(field.name,v)}/>:
      field.type==='boolean'?<input type="checkbox" checked={!!values[field.name]} onChange={e=>change(field.name,e.target.checked)}/>:
      field.type==='select'?<select required={field.required} className={inputClass} value={values[field.name]||''} onChange={e=>change(field.name,e.target.value)}><option value="">Selecionar</option>{(field.options||[]).map((o:any)=><option key={o.value??o} value={o.value??o}>{o.label??((field.name==='tipo_campanha'||field.name==='tipo_filtro'||field.name==='type'||field.name==='sexo_filtro')?labels[String(o)]:undefined)??o}</option>)}</select>:
      field.type==='textarea'?<textarea required={field.required} className={inputClass} value={values[field.name]||''} onChange={e=>change(field.name,e.target.value)}/>:
      <input required={field.required} type={field.type==='number'?'number':'text'} className={inputClass} value={Array.isArray(values[field.name])?values[field.name].join(', '):values[field.name]??''} placeholder={field.type==='array'?'Identificadores separados por vírgula':undefined} onChange={e=>change(field.name,field.type==='array'?e.target.value.split(',').map(v=>v.trim()).filter(Boolean):e.target.value)}/>}
    </label>)}
    {confirm&&<p role="alert" className="rounded border border-amber-500 p-3 text-sm">Confirme “{endpoint.title}”. Esta operação altera dados ou inicia uma ação na SAC Digital.</p>}
    <AdminButton type="submit" loading={busy} disabled={!allowed||uncertain}>{read?'Consultar':confirm?'Confirmar operação':'Continuar'}</AdminButton>
    {confirm&&<BtnSecondary onClick={()=>setConfirm(false)}>Cancelar</BtnSecondary>}
    </form>
    {error&&<p role="alert" className="rounded border border-red-400 p-3 text-sm">{error}</p>}
    {result&&<div aria-live="polite" className="space-y-2"><p className="text-sm">{read?'Resultado da consulta':result.outcome==='unknown'?'Confirmação pendente. Não repita a operação.':['accepted','queued'].includes(result.outcome||'')?'Operação aceita; aguarde a confirmação da SAC.':'Operação concluída pela SAC Digital.'}</p>
    {resultItems(result.data).length===0?<p className="text-sm text-muted-foreground">Nenhum registro encontrado.</p>:resultItems(result.data).map((item:any,index:number)=><article key={item.id||index} className="space-y-2 rounded border border-border p-3 text-sm"><DetailValue value={item}/><div className="flex gap-2">{(item.id||item.code||item.protocol)&&<><BtnSecondary onClick={()=>{setRecord(item);setValues(recordContext(endpoint.fields,item,area,protocol,{sourceEndpointId:endpoint.id,parent}));}}>Selecionar {item.name||item.title||item.code||'registro'}</BtnSecondary>{available.filter(action=>action.id!==endpoint.id&&action.fields.some((f:Field)=>/^(id|contact|group|protocol|protocolo|code|coupon|operator|department|channel)$|_id$/.test(f.name))).map(action=><BtnSecondary key={action.id} onClick={()=>{setRecord(item);chooseAction(action,item);}}>{actionLabel(action)}</BtnSecondary>)}</>}{onInsertAnswer&&/resposta/i.test(area)&&<BtnSecondary onClick={()=>onInsertAnswer(String(item.text||item.message||item.content||item.body||''))}>Inserir no atendimento</BtnSecondary>}</div></article>)}
    {result.has_more&&result.next_page!=null&&<BtnSecondary disabled={busy} onClick={()=>void execute(result.next_page)}>Próxima página</BtnSecondary>}</div>}
  </section>;
}
