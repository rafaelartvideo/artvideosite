// Núcleo do importador de históricos. Sem efeitos no CRM, sem segredos e sem acesso à rede.
// Execute apenas no servidor; estes validadores não substituem autorização multiempresa.
export function validatePackageId(value) {
  if(typeof value!=="string"||!/^[a-f0-9]{20}$/.test(value)) throw Error("Identificador do pacote inválido.");
  return value;
}

export function validateDestination(organizationId,accountPhone) {
  if(typeof organizationId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(organizationId))throw Error("Empresa inválida.");
  if(typeof accountPhone!=="string"||!/^[1-9][0-9]{9,14}$/.test(accountPhone))throw Error("Número de conta inválido.");
  return {organizationId:organizationId.toLowerCase(),accountPhone};
}

export function validateIndex(rows,summary,packageId) {
  validatePackageId(packageId);
  if(!summary||summary.version!==1||summary.stage!=="union_history_pilot_packaging"||summary.package_id!==packageId||!Array.isArray(rows)||rows.length===0||rows.length>100||summary.contacts!==rows.length)throw Error("Pacote de histórico inválido.");
  const seen=new Set(),totals={messages:0,protocols:0,media_recovered:0,media_pending:0},phones=new Map();
  const safe=rows.map(r=>{
    if(!r||!(/^[a-f0-9]{32}$/).test(r.contact_key)||seen.has(r.contact_key)||r.file!=="historicos/"+r.contact_key+".json.gz"||!(/^[a-f0-9]{64}$/).test(r.sha256)||!(/^[1-9][0-9]{9,14}$/).test(r.phone_normalized))throw Error("Índice inválido.");
    seen.add(r.contact_key);
    for(const k of ["messages","protocols","media_available","media_pending","media","bytes"]){
      if(!Number.isSafeInteger(r[k])||r[k]<0)throw Error("Contagens inválidas.");
    }
    if(!r.bytes||r.bytes>16*1024*1024||r.media!==r.media_available+r.media_pending)throw Error("Limites do pacote inválidos.");
    totals.messages+=r.messages; totals.protocols+=r.protocols;totals.media_recovered+=r.media_available;totals.media_pending+=r.media_pending;
    phones.set(r.phone_normalized,(phones.get(r.phone_normalized)||0)+1);
    return {contact_key:r.contact_key,phone_normalized:r.phone_normalized,file:r.file,sha256:r.sha256,bytes:r.bytes,messages:r.messages,protocols:r.protocols,media:r.media,media_available:r.media_available,media_pending:r.media_pending};
  });
  for(const [k,v] of Object.entries(totals))if(summary[k]!==v)throw Error("Totais divergentes.");
  return safe.map(r=>({...r,requires_review:phones.get(r.phone_normalized)>1}));
}

export function validatePayload(payload,index) {
  const p=payload, hex=(s,n)=>typeof s==="string"&&s.length===n&&/^[a-f0-9]+$/.test(s);
  if(!p||p.schema_version!==1||p.scope!=="union_world_historical_archive"||p.contact?.import_key!==index.contact_key||p.contact?.phone_normalized!==index.phone_normalized||!Array.isArray(p.messages)||!Array.isArray(p.protocols)||!Array.isArray(p.media)||p.messages.length!==index.messages||p.protocols.length!==index.protocols||p.media.length!==index.media)throw Error("Histórico divergente do índice.");
  const protocols=new Set(),media=new Map(),messages=new Set();
  for(const r of p.protocols){if(!hex(r.protocol_key,32)||protocols.has(r.protocol_key))throw Error("Protocolo inválido.");protocols.add(r.protocol_key)}
  let available=0;
  for(const m of p.media){
    if(!hex(m.url_sha256,64)||media.has(m.url_sha256)||typeof m.available!=="boolean")throw Error("Manifesto inválido.");
    if(m.available){
      const parts=typeof m.rclone_relative_key==="string"?m.rclone_relative_key.split("/"):[];
      if(parts.length!==4||parts[0]!=="contatos"||parts[2]!=="anexos"||parts.some(s=>!s||s==="."||s===".."||/[\\:\x00-\x1f\x7f]/.test(s))||!hex(m.sha256,64)||!Number.isSafeInteger(m.size_bytes)||m.size_bytes<0)throw Error("Caminho de mídia inválido.");
      available++;
    }
    media.set(m.url_sha256,m);
  }
  if(available!==index.media_available||media.size-available!==index.media_pending)throw Error("Totais de mídia divergentes.");
  for(const m of p.messages){
    if(!hex(m.import_key,40)||messages.has(m.import_key)||!protocols.has(m.protocol_key)||typeof m.at!=="string"||!Number.isFinite(Date.parse(m.at))||!["incoming","outgoing","system"].includes(m.direction)||!Array.isArray(m.media))throw Error("Mensagem inválida.");
    messages.add(m.import_key);
    for(const r of m.media){if(!media.has(r.url_sha256)||r.available!==media.get(r.url_sha256).available)throw Error("Anexo divergente.");}
  }
  return p;
}

export function nextJobState(current,action) {
  const transitions={prepared:{start:"queued",cancel:"cancelled"},queued:{pause:"paused",cancel:"cancelled"},running:{pause:"pausing",cancel:"cancelling"},pausing:{cancel:"cancelling"},paused:{resume:"queued",cancel:"cancelled"},failed:{resume:"queued",cancel:"cancelled"},completed:{rollback:"rolled_back"},cancelled:{rollback:"rolled_back"}};
  const next=transitions[current]?.[action];if(!next)throw Error("Transição de importação não permitida.");return next;
}
