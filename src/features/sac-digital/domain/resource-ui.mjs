export function mediaMaximum(mime = '') { return (mime.startsWith('image/') ? 1 : mime.startsWith('audio/') ? 3 : 5) * 1024 * 1024; }
export function deliveryLabel(metadata) { const state=String(metadata?.delivery_status || metadata?.status || '').toLowerCase(); return ({read:'Lida',delivered:'Entregue',sent:'Enviada',failed:'Falhou',unknown:'Confirmação pendente',accepted:'Aceita pela SAC',pending:'Pendente',queued:'Na fila',preparing:'Preparando',prepared:'Preparando',rejected:'Recusada',queued:'Na fila da SAC'})[state] || 'Aguardando confirmação'; }
export function fieldVisible(field, values) { if (!field.when) return true; if (typeof field.when === 'function') return field.when(values); const condition=field.when; if(condition.field && condition.values) return condition.values.includes(String(values[condition.field])); if(condition.field) return Array.isArray(condition.value) ? condition.value.includes(values[condition.field]) : values[condition.field] === condition.value; return Object.entries(condition).every(([key,value])=>Array.isArray(value)? value.includes(values[key]):values[key]===value); }
export function formValues(fields, values) { return Object.fromEntries(fields.filter(field=>fieldVisible(field,values)&&values[field.name]!==undefined&&values[field.name]!=='').map(field=>[field.name,field.type==='number'?Number(values[field.name]):field.type==='boolean'?Boolean(values[field.name]):values[field.name]])); }
export function resultItems(data) { if(Array.isArray(data)) return data; if(!data||typeof data!=='object')return data == null ? [] : [{resultado:data}]; for(const value of Object.values(data))if(Array.isArray(value)) return value; return Object.keys(data).length?[data]:[]; }
export function apiDiagnostic(payload) { const text=String(payload?.error||payload?.message||'A SAC Digital não conseguiu concluir a operação.'); return payload?.outcome==='unknown'||payload?.type==='unknown' ? `${text} Confirmação pendente. Não repita a operação; aguarde a reconciliação.` : text; }
export function initialValues(fields,protocol) { return Object.fromEntries(fields.filter(field=>field.name==='p'||/protocol/i.test(field.name)&&protocol).map(field=>[field.name,field.name==='p'?1:protocol])); }
function stable(value){return JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
export class IntentLedger {
 constructor(create=()=>crypto.randomUUID(),storage){this.create=create;this.storage=storage;this.entries=new Map();try{this.entries=new Map(JSON.parse(storage?.getItem('sac-active-intents')||'[]'));}catch{}}
 save(){try{this.storage?.setItem('sac-active-intents',JSON.stringify([...this.entries]));}catch{}}
 begin(body){const key=stable(body);if(!this.entries.has(key)){this.entries.set(key,this.create());this.save();}return this.entries.get(key);}
 finish(body,outcome){if(outcome!=='unknown'){this.entries.delete(stable(body));this.save();}}
}
export function recordContext(fields,row,area,protocol,context={}) {
 const values=initialValues(fields,protocol), parent=context.parent||{};
 if(area==='Grupos de Contatos') {
  const groupId=context.sourceEndpointId===19?row.id:parent.groupId;
  for(const f of fields){if(f.name==='id'&&groupId)values.id=groupId;if(f.name==='contact'){const id=row.contact?.id||row.contact_id||(context.sourceEndpointId===20?row.id:null);if(id)values.contact=id;}}
  return values;
 }
 if(area==='Cupom') {
  const couponId=context.sourceEndpointId===45?row.id:parent.couponId;
  for(const f of fields){if(f.name==='id'&&couponId)values.id=couponId;if(f.name==='code'&&row.code!=null)values.code=row.code;}
  return values;
 }
 for(const f of fields){const name=f.name;if(row[name]!=null)values[name]=row[name];else if(name==='id'&&row.id!=null)values.id=row.id;else if(name==='contact'&&area==='Contatos'&&row.id!=null)values.contact=row.id;else if(row[name]?.id)values[name]=row[name].id;else if(name==='protocol'||name==='protocolo'){if(row.protocol)values[name]=row.protocol;}else if(({operator:'Operadores',department:'Departamentos',channel:'Canais',group:'Grupos de WhatsApp'})[name]===area&&row.id!=null)values[name]=row.id;}
 return values;
}

export function friendlyEntries(value){const labels={id:'Identificador',name:'Nome',title:'Título',titulo:'Título',number:'Número',phone:'Telefone',email:'E-mail',text:'Mensagem',message:'Mensagem',body:'Mensagem',content:'Conteúdo',description:'Descrição',status:'Situação',delivery_state:'Entrega',created_at:'Criado em',updated_at:'Atualizado em',sent_at:'Enviado em',actived:'Ativo',active:'Ativo',online:'Online',department:'Departamento',operator:'Operador',contact:'Contato',channel:'Canal',code:'Código',value:'Valor',price:'Preço',balance:'Saldo',expiration:'Validade',expires_at:'Validade',type:'Tipo',url:'Arquivo',media_url:'Mídia',caption:'Legenda',quantity:'Quantidade',address:'Endereço',city:'Cidade',state:'Estado',groups:'Grupos',tags:'Etiquetas',protocol:'Protocolo',protocolo:'Protocolo',choices:'Opções',total:'Total'};return Object.entries(value||{}).filter(([key])=>Object.hasOwn(labels,key)).map(([key,v])=>[labels[key],v]);}
export function actionLabel(endpoint){const action={Todos:'Listar',Todas:'Listar',All:'Listar',Filtrar:'Buscar',Adicionar:'Adicionar',Criar:'Criar',Editar:'Editar',Remover:'Remover',Consultar:'Consultar',Contato:'Enviar para contato',Direto:'Enviar por número',Perfil:'Ver perfil'};return action[endpoint.title]||endpoint.title;}
export function privateMediaIds(rows){return rows.filter(row=>row.raw_metadata?.temp_storage_bucket==='sac-digital-attachments').slice(-50).map(row=>row.id);}
export function hydrateMedia(rows,urls){return rows.map(row=>row.raw_metadata?.temp_storage_bucket==='sac-digital-attachments'&&typeof urls?.[row.id]==='string'&&urls[row.id]?{...row,media_url:urls[row.id]}:row);}
export function cloudChannel(channel){return /^(cloud|whatsapp_cloud|whatsapp cloud|waba|enterprise)$/i.test(String(channel?.type||channel?.channel_type||channel?.mode||''));}
export function usableChannels(rows){return rows.filter(c=>c.id!=null&&c.actived!==false&&c.active!==false&&c.connected!==false&&!/^(off|offline|inactive|disabled|disconnected|desconectado)$/i.test(String(c.status||c.connection_status||''))&&(!/call.?center/i.test(String(c.type||c.mode||''))||c.primary===false));}
export function approvedTemplates(rows){return rows.filter(t=>(t.id!=null||t.name)&&(!t.status||/^approved|aprovado$/i.test(String(t.status))));}
