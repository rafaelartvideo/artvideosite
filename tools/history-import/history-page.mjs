// Chronological pagination contract shared by the archived and operational histories.
// No storage paths, provider secrets, or implicit deduplication by message text.
export function timestampMicros(value){
  if(typeof value!=="string")throw Error("Data inválida.");
  const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/i.exec(value);
  if(!match)throw Error("Data inválida.");
  const milliseconds=Date.parse(match[1]+match[3]);
  if(!Number.isFinite(milliseconds))throw Error("Data inválida.");
  return BigInt(milliseconds)*1000n+BigInt((match[2]||"").padEnd(6,"0"));
}
// Archive source dates can use a SQL space separator, extra fractional digits,
// or compact explicit UTC offsets. Never infer an absent timezone from the VPS.
// The original exact string stays in the immutable archive; the index uses UTC
// with microsecond precision (the same resolution as Postgres).
export function normalizeArchiveTimestamp(value){
  if(typeof value!=="string")throw Error("Data inválida.");
  const m=/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?(?:[.,](\d{1,12}))?\s*(Z|UTC|GMT|[+-]\d{2}(?::?\d{2})?)$/i.exec(value.trim());
  if(!m)throw Error("Formato de data histórica sem fuso explícito ou incompatível.");
  const zone=m[5].toUpperCase();
  const offset=["Z","UTC","GMT"].includes(zone)?"Z":zone.length===3?zone+":00":zone.length===5?zone.slice(0,3)+":"+zone.slice(3):zone;
  const wall=m[1]+"T"+m[2]+":"+(m[3]||"00");
  const calendar=Date.parse(wall+"Z");
  if(!Number.isFinite(calendar)||new Date(calendar).toISOString().slice(0,19)!==wall)throw Error("Data inválida.");
  const seconds=Date.parse(wall+offset);
  if(!Number.isFinite(seconds))throw Error("Data inválida.");
  return new Date(seconds).toISOString().slice(0,19)+"."+(m[4]||"").padEnd(6,"0").slice(0,6)+"Z";
}

const keyId=id=>{
  if(typeof id!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))throw Error("Identificador inválido.");
  return id;
};
export function historyId(key){
  if(typeof key!=="string"||!/^[a-f0-9]{32,64}$/.test(key))throw Error("Chave inválida.");
  // A disjoint UUID v8 namespace for historical keys, never fabricate delivery receipts.
  // Use the full original key for collision detection in the index.
  return key.slice(0,8)+"-"+key.slice(8,12)+"-8"+key.slice(13,16)+"-a"+key.slice(17,20)+"-"+key.slice(20,32);
}
export function compareHistory(a,b){
  const left=timestampMicros(a.sent_at),right=timestampMicros(b.sent_at);
  if(left!==right)return left>right?-1:1;
  const ai=keyId(a.id),bi=keyId(b.id);
  return ai===bi?0:ai>bi?-1:1;
}
export function mergeHistoryPage(live,archived,before=null,limit=60){
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Array.isArray(live)||!Array.isArray(archived))throw Error("Página inválida.");
  const seen=new Map();
  // Source priority is intentional when exact IDs overlap; matching texts are NOT duplicate IDs.
  for(const item of [...archived,...live]){
    timestampMicros(item.sent_at);keyId(item.id);
    if(before&&compareHistory(item,before)<=0)continue;
    const old=seen.get(item.id);
    if(old&&(old.sent_at!==item.sent_at||old.history_key!==item.history_key))throw Error("Colisão de identidade.");
    seen.set(item.id,item);
  }
  const rows=[...seen.values()].sort(compareHistory);
  const page=rows.slice(0,limit),last=page[page.length-1];
  return {items:page.reverse(),hasMore:rows.length>limit,nextCursor:last?{sent_at:last.sent_at,id:last.id}:null};
}
// Project only metadata needed by a renderer; preserve every attachment and original
// message text. Actual media delivery must be separately authorized and verified.
export function projectHistorical(payload,scope){
  const media=new Map(payload.media.map(m=>[m.url_sha256,m]));
  const ids=new Set();
  return payload.messages.map(m=>{
    const id=historyId(m.import_key);
    if(ids.has(id))throw Error("Colisão de identidade.");
    ids.add(id);
    const attachments=m.media.map(ref=>{
      const item=media.get(ref.url_sha256);
      if(!item)throw Error("Referência inválida.");
      return {id:item.url_sha256,kind:typeof ref.kind==="string"?ref.kind:"unknown",
        mime:typeof item.mime==="string"?item.mime:"",available:item.available===true};
    });
    const sentAt=normalizeArchiveTimestamp(m.at);
    timestampMicros(sentAt);
    return {id,history_key:m.import_key,protocol_id:historyId(m.protocol_key),
      organization_id:scope.organizationId,conversation_id:scope.conversationId,
      sent_at:sentAt,direction:m.direction,body_text:typeof m.text==="string"?m.text:"",
      sender_name:m.sender_original==="operator"&&typeof m.sender_detail_original==="string"?m.sender_detail_original:null,
      attachments,links:Array.isArray(m.links)?m.links.filter(v=>typeof v==="string"):[],
      location:m.location||null,shared_contact:m.shared_contact||null,
      delivery_status:null,read_only:true};
  });
}

// Merge fetched pages without jumping past unseen rows when either source is
// truncated by a byte limit. Both sources must share the same exclusive cursor.
export function mergeFetchedHistoryPages(live,archive,before=null,limit=60){
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error("Página inválida.");
  for(const page of [live,archive]){
    if(!page||!Array.isArray(page.items)||typeof page.hasMore!=="boolean"||page.items.length>limit+1||page.hasMore&&page.items.length===0)throw Error("Página incompleta.");
    for(const item of page.items){
      timestampMicros(item.sent_at);keyId(item.id);
      if(before&&compareHistory(item,before)<=0)throw Error("Cursor divergente.");
    }
  }
  const ordered=[...live.items,...archive.items].sort(compareHistory);
  const ids=new Set();for(const item of ordered){if(ids.has(item.id))throw Error("Colisão de identidade.");ids.add(item.id)}
  const cutoffs=[live,archive].filter(p=>p.hasMore).map(p=>[...p.items].sort(compareHistory).at(-1)).sort(compareHistory);
  const safe=cutoffs.length?ordered.filter(row=>compareHistory(row,cutoffs[0])<=0):ordered;
  const items=safe.slice(0,limit),last=items.at(-1);
  return {items:items.reverse(),hasMore:live.hasMore||archive.hasMore||ordered.length>items.length,nextCursor:last?{sent_at:last.sent_at,id:last.id}:null};
}
