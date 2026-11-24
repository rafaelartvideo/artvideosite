// Build the new manifest from existing normalized archive files, not the raw SAC backup.
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { lstatSync, readdirSync, readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { validatePackageId, validateIndex, validatePayload, BULK_MAX_CONTACTS, BULK_INDEX_MAX_BYTES } from "./archive-contract.mjs";

try{
  const root=realpathSync(process.argv[2]||""),id=validatePackageId(process.argv[3]);
  if(!process.argv[2]||process.argv.slice(4).some(a=>a!=="--write"))throw Error("usage");
  const source=join(root,"historicos"),stat=lstatSync(source);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error("source");
  const files=readdirSync(source).sort();
  if(!files.length||files.length>BULK_MAX_CONTACTS||files.some(f=>!(/^[a-f0-9]{32}\.json\.gz$/).test(f)))throw Error("files");
  const summary={version:1,stage:"union_history_bulk_packaging",package_id:id,contacts:files.length,messages:0,protocols:0,media_recovered:0,media_pending:0,incoming:0,outgoing:0,system:0};
  const rows=[];
  for(const file of files){
    const path=join(source,file),st=lstatSync(path);
    if(st.isSymbolicLink()||!st.isFile()||st.size<1||st.size>16*1024*1024)throw Error("file");
    const bytes=readFileSync(path),payload=JSON.parse(gunzipSync(bytes,{maxOutputLength:64*1024*1024}).toString("utf8"));
    const available=payload.media.filter(m=>m.available===true).length;
    const row={contact_key:file.slice(0,32),phone_normalized:payload.contact.phone_normalized,file:"historicos/"+file,sha256:createHash("sha256").update(bytes).digest("hex"),bytes:bytes.length,messages:payload.messages.length,protocols:payload.protocols.length,media:payload.media.length,media_available:available,media_pending:payload.media.length-available};
    validatePayload(payload,row);
    rows.push(row);summary.messages+=row.messages;summary.protocols+=row.protocols;summary.media_recovered+=row.media_available;summary.media_pending+=row.media_pending;
    for(const m of payload.messages)summary[m.direction]++;
  }
  const checked=validateIndex(rows,summary,id);
  const jsonl=rows.map(r=>JSON.stringify(r)).join("\n")+"\n";
  if(Buffer.byteLength(jsonl)>BULK_INDEX_MAX_BYTES)throw Error("index_size");
  const indexPath=join(root,"indice-privado.jsonl"),summaryPath=join(root,"resumo-seguro.json");
  if(process.argv.includes("--write")){
    if(existsSync(indexPath)||existsSync(summaryPath))throw Error("existing_manifest");
    // Summary is written last; the package cannot be granted until both exist.
    writeFileSync(indexPath,jsonl,{flag:"wx",mode:0o600});
    writeFileSync(summaryPath,JSON.stringify(summary,null,2)+"\n",{flag:"wx",mode:0o600});
  }
  console.log(JSON.stringify({success:true,contacts:summary.contacts,messages:summary.messages,protocols:summary.protocols,duplicate_phone_entries:checked.filter(r=>r.requires_review).length,media_recovered:summary.media_recovered,media_pending:summary.media_pending,manifest_written:process.argv.includes("--write"),source_modified:false}));
}catch{
  console.error("FALHA SEGURA: pacote normalizado ou manifesto inválido. Nenhum arquivo histórico foi alterado.");
  process.exitCode=1;
}
