// Cursor helpers for the authorized Edge Function; no database or storage access.
export function timestampMicros(value){
  if(typeof value!=="string")throw Error("Data inválida.");
  const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/i.exec(value);
  if(!match)throw Error("Data inválida.");
  const milliseconds=Date.parse(match[1]+match[3]);
  if(!Number.isFinite(milliseconds))throw Error("Data inválida.");
  return BigInt(milliseconds)*1000n+BigInt((match[2]||"").padEnd(6,"0"));
}
const keyId=id=>{
  if(typeof id!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))throw Error("Identificador inválido.");
  return id;
};
export function compareHistory(a,b){
  const left=timestampMicros(a.sent_at),right=timestampMicros(b.sent_at);
  if(left!==right)return left>right?-1:1;
  const ai=keyId(a.id),bi=keyId(b.id);
  return ai===bi?0:ai>bi?-1:1;
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
