// Read-only deployment preflight; no SQLite database, CRM writes or remote uploads.
// Usage: UNION_HISTORY_RCLONE_CONFIG=/private/rclone.conf node preflight.mjs PACKAGE_ID
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { lstatSync } from "node:fs";
import { makeReader } from "./archive-store.mjs";
import { validatePackageId,validateIndex,validatePayload,BULK_INDEX_MAX_BYTES } from "./archive-contract.mjs";
try{
  const id=validatePackageId(process.argv[2]);
  const config=process.env.UNION_HISTORY_RCLONE_CONFIG;
  if(!config)throw Error("config");
  const st=lstatSync(config);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)throw Error("config_permissions");
  const read=makeReader({config,rclone:process.env.UNION_HISTORY_RCLONE||"rclone"});
  const summary=JSON.parse(read(id,"resumo-seguro.json",65536).toString("utf8"));
  const rows=read(id,"indice-privado.jsonl",summary.stage==="union_history_bulk_packaging"?BULK_INDEX_MAX_BYTES:2*1024*1024).toString("utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const index=validateIndex(rows,summary,id);
  const seen=new Set(),totals={contacts:index.length,protocols:0,messages:0,incoming:0,outgoing:0,system:0,media_recovered:0,media_pending:0};
  for(const row of index){
    const buffer=read(id,row.file,16*1024*1024);
    if(buffer.length!==row.bytes||createHash("sha256").update(buffer).digest("hex")!==row.sha256)throw Error("hash");
    const payload=validatePayload(JSON.parse(gunzipSync(buffer,{maxOutputLength:64*1024*1024}).toString("utf8")),row);
    totals.protocols+=payload.protocols.length;
    totals.messages+=payload.messages.length;
    for(const m of payload.messages){
      if(seen.has(m.import_key))throw Error("duplicate_message");
      seen.add(m.import_key);totals[m.direction]++;
    }
    totals.media_recovered+=row.media_available;
    totals.media_pending+=row.media_pending;
  }
  for(const [key,value] of Object.entries(totals))if(summary[key]!==value)throw Error("totals");
  console.log(JSON.stringify({success:true,package_id:id,files_verified:index.length+2,...totals,media_binary_verified:false,crm_modified:false,remote_modified:false},null,2));
}catch{
  console.error("FALHA SEGURA: leitura privada ou integridade do pacote não confirmada. Nenhum dado modificado.");
  process.exitCode=1;
}
