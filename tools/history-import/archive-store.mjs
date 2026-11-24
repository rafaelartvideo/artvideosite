// Server-only archive index. Requires Node >= 22.13, rclone crypt and a private local disk.
// No HTTP listener, CRM writes, credentials, or browser access. The future authenticated API
// must enforce organization membership, import permissions and verified account ownership.
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { chmodSync, lstatSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { projectHistorical,timestampMicros,historyId } from "./history-page.mjs";
import { validatePackageId, validateDestination, validateIndex, validatePayload, nextJobState } from "./archive-contract.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const now=()=>new Date().toISOString();
const packageRoot=id=>"sac-crypt:union-world-historico/piloto/"+validatePackageId(id)+"/";
export function makeReader({rclone="rclone",config}={}){
  if(!config)throw Error("Configuração privada do rclone obrigatória.");
  return (packageId,file,maxBytes)=>{
    const allowed=file==="resumo-seguro.json"||file==="indice-privado.jsonl"||/^historicos\/[a-f0-9]{32}\.json\.gz$/.test(file);
    if(!allowed)throw Error("Caminho de pacote inválido.");
    const result=spawnSync(rclone,["--config",config,"cat",packageRoot(packageId)+file,"--retries","2","--contimeout","10s","--timeout","45s"],{timeout:90000,maxBuffer:maxBytes,encoding:null,windowsHide:true});
    if(result.error||result.status!==0||!Buffer.isBuffer(result.stdout)||result.stdout.length>maxBytes)throw Error("Não foi possível ler o arquivo privado.");
    return result.stdout;
  };
}
export function openArchiveStore(filename,read){
  if(typeof read!=="function")throw Error("Leitor privado obrigatório.");
  if(filename!==":memory:"){
    const dir=dirname(resolve(filename));mkdirSync(dir,{recursive:true,mode:0o700});
    if(lstatSync(dir).isSymbolicLink())throw Error("Diretório privado inválido.");
    if(existsSync(filename)&&(!lstatSync(filename).isFile()||lstatSync(filename).isSymbolicLink()))throw Error("Índice inválido.");
    if((lstatSync(dir).mode&0o077)!==0)throw Error("Diretório do índice deve ter modo 0700.");
  }
  const db=new DatabaseSync(filename);
  if(filename!==":memory:")chmodSync(filename,0o600);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
  db.exec([
    "CREATE TABLE IF NOT EXISTS grants(package_id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, package_id TEXT NOT NULL UNIQUE REFERENCES grants(package_id), organization_id TEXT NOT NULL, account_phone TEXT NOT NULL, actor TEXT NOT NULL, state TEXT NOT NULL, total INTEGER NOT NULL, updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS entries(job_id TEXT NOT NULL REFERENCES jobs(id), contact_key TEXT NOT NULL, phone TEXT NOT NULL, metadata TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', PRIMARY KEY(job_id,contact_key))",
    "CREATE INDEX IF NOT EXISTS archive_lookup ON entries(phone,state,job_id)",
    "CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), actor TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS bindings(organization_id TEXT NOT NULL, account_phone TEXT NOT NULL, contact_id TEXT NOT NULL, phone TEXT NOT NULL, job_id TEXT NOT NULL, contact_key TEXT NOT NULL, actor TEXT NOT NULL, confirmed_at TEXT NOT NULL, PRIMARY KEY(job_id,contact_key), FOREIGN KEY(job_id,contact_key) REFERENCES entries(job_id,contact_key))",
    "CREATE INDEX IF NOT EXISTS history_bindings_lookup ON bindings(organization_id,account_phone,contact_id,phone)",
    "CREATE TABLE IF NOT EXISTS history_messages(job_id TEXT NOT NULL,contact_key TEXT NOT NULL,id TEXT NOT NULL,sent_micros INTEGER NOT NULL,protocol_id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(job_id,contact_key,id),FOREIGN KEY(job_id,contact_key) REFERENCES entries(job_id,contact_key))",
    "CREATE INDEX IF NOT EXISTS history_messages_page ON history_messages(job_id,contact_key,sent_micros DESC,id DESC)",
    "CREATE INDEX IF NOT EXISTS history_messages_protocol ON history_messages(job_id,contact_key,protocol_id,sent_micros DESC,id DESC)",
    "CREATE TABLE IF NOT EXISTS history_protocols(job_id TEXT NOT NULL,contact_key TEXT NOT NULL,id TEXT NOT NULL,opened_micros INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(job_id,contact_key,id),FOREIGN KEY(job_id,contact_key) REFERENCES entries(job_id,contact_key))",
    "CREATE INDEX IF NOT EXISTS history_protocols_page ON history_protocols(job_id,contact_key,opened_micros DESC,id DESC)",
    "CREATE TABLE IF NOT EXISTS history_index_ready(job_id TEXT NOT NULL,contact_key TEXT NOT NULL,PRIMARY KEY(job_id,contact_key),FOREIGN KEY(job_id,contact_key) REFERENCES entries(job_id,contact_key))"
  ].join(";")+";");
  const tx=fn=>{db.exec("BEGIN IMMEDIATE");try{const result=fn();db.exec("COMMIT");return result}catch(e){db.exec("ROLLBACK");throw e}};
  const audit=(id,actor,action)=>db.prepare("INSERT INTO events(job_id,actor,action,created_at) VALUES (?,?,?,?)").run(id,actor,action,now());
  const state=(id,value)=>db.prepare("UPDATE jobs SET state=?,updated_at=? WHERE id=?").run(value,now(),id);
  function job(id,org){
    const row=db.prepare("SELECT * FROM jobs WHERE id=? AND organization_id=?").get(id,org);
    if(!row)throw Error("Importação não encontrada.");return row;
  }
  function grantPackage(packageId,org,actor){
    // Only platform provisioning service may call this; never accept an end-user-supplied grant.
    validatePackageId(packageId);org=validateDestination(org,"550000000000").organizationId;
    if(!actor)throw Error("Responsável obrigatório.");
    const old=db.prepare("SELECT organization_id FROM grants WHERE package_id=?").get(packageId);
    if(old&&old.organization_id!==org)throw Error("Pacote já vinculado a outra empresa.");
    if(!old){
      const summary=JSON.parse(read(packageId,"resumo-seguro.json",65536).toString("utf8"));
      if(summary.package_id!==packageId||summary.stage!=="union_history_pilot_packaging"||summary.version!==1||!Number.isInteger(summary.contacts)||summary.contacts<1||summary.contacts>100)throw Error("Pacote privado não reconhecido.");
    }
    db.prepare("INSERT INTO grants VALUES (?,?,?,?) ON CONFLICT(package_id) DO NOTHING").run(packageId,org,actor,now());
    if(db.prepare("SELECT organization_id FROM grants WHERE package_id=?").get(packageId)?.organization_id!==org)throw Error("Pacote já vinculado a outra empresa.");
  }
  function prepare({packageId,organizationId,accountPhone,actor}){
    const dest=validateDestination(organizationId,accountPhone);organizationId=dest.organizationId;
    validatePackageId(packageId);if(!actor)throw Error("Responsável obrigatório.");
    if(!db.prepare("SELECT 1 FROM grants WHERE package_id=? AND organization_id=?").get(packageId,organizationId))throw Error("Pacote indisponível para esta empresa.");
    const existing=db.prepare("SELECT id,account_phone FROM jobs WHERE package_id=?").get(packageId);
    if(existing){if(existing.account_phone!==accountPhone)throw Error("Pacote já associado a outra conta.");return existing.id}
    const summary=JSON.parse(read(packageId,"resumo-seguro.json",65536).toString("utf8"));
    const rows=read(packageId,"indice-privado.jsonl",2*1024*1024).toString("utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
    const index=validateIndex(rows,summary,packageId);
    return tx(()=>{
      const race=db.prepare("SELECT id,account_phone FROM jobs WHERE package_id=?").get(packageId);
      if(race){if(race.account_phone!==accountPhone)throw Error("Pacote já associado a outra conta.");return race.id}
      const id=randomUUID();
      db.prepare("INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?)").run(id,packageId,organizationId,accountPhone,actor,"prepared",index.length,now());
      const insert=db.prepare("INSERT INTO entries(job_id,contact_key,phone,metadata,state) VALUES (?,?,?,?,?)");
      for(const r of index)insert.run(id,r.contact_key,r.phone_normalized,JSON.stringify(r),r.requires_review?"review":"pending");
      audit(id,actor,"prepare");return id;
    });
  }
  function control({id,organizationId,actor,action}){
    if(!actor)throw Error("Responsável obrigatório.");
    return tx(()=>{const j=job(id,organizationId);const next=nextJobState(j.state,action);state(id,next);audit(id,actor,action);return next});
  }
  function status(id,org){
    const j=job(id,org);
    const counts=db.prepare("SELECT state,COUNT(*) AS count FROM entries WHERE job_id=? GROUP BY state").all(id);
    const totals={messages:0,protocols:0,media_available:0,media_pending:0},verified={...totals};
    for(const e of db.prepare("SELECT metadata,state FROM entries WHERE job_id=?").all(id)){
      const m=JSON.parse(e.metadata);
      for(const k of Object.keys(totals)){totals[k]+=m[k];if(e.state==="verified")verified[k]+=m[k];}
    }
    return {id:j.id,state:j.state,account_phone:j.account_phone,total:j.total,updated_at:j.updated_at,counts,totals,verified,bound:Number(db.prepare("SELECT count(*) AS n FROM bindings WHERE job_id=?").get(id).n)};
  }
  function list(organizationId){
    validateDestination(organizationId,"550000000000");
    const packages=db.prepare("SELECT package_id,created_at FROM grants WHERE organization_id=? ORDER BY created_at DESC LIMIT 100").all(organizationId);
    const jobs=db.prepare("SELECT id FROM jobs WHERE organization_id=? ORDER BY updated_at DESC LIMIT 100").all(organizationId).map(j=>status(j.id,organizationId));
    return {packages,jobs};
  }
  function events(id,org){
    job(id,org);return db.prepare("SELECT actor,action,created_at FROM events WHERE job_id=? ORDER BY id DESC LIMIT 100").all(id);
  }
  function readPayload(packageId,metadata){
    const compressed=read(packageId,metadata.file,16*1024*1024);
    if(compressed.length!==metadata.bytes||sha(compressed)!==metadata.sha256)throw Error("Integridade divergente.");
    return validatePayload(JSON.parse(gunzipSync(compressed,{maxOutputLength:64*1024*1024}).toString("utf8")),metadata);
  }
  // Run only one worker process per index. One contact per transaction; pause/cancel may
  // be requested during remote reads. No lease reclamation until the old worker has stopped.
  function tick(){
    const claim=tx(()=>{
      const j=db.prepare("SELECT * FROM jobs WHERE state IN ('queued','running','pausing','cancelling') ORDER BY updated_at,id LIMIT 1").get();
      if(!j)return null;
      if(j.state==="pausing"||j.state==="cancelling"){state(j.id,j.state==="pausing"?"paused":"cancelled");return {settled:true}}
      const e=db.prepare("SELECT * FROM entries WHERE job_id=? AND state='pending' ORDER BY contact_key LIMIT 1").get(j.id);
      if(!e){state(j.id,"completed");audit(j.id,"worker","completed");return {settled:true}}
      state(j.id,"running");return {j,e};
    });
    if(!claim)return false;if(claim.settled)return true;
    const {j,e}=claim;let verifiedMetadata=null,projected=null,protocols=null;
    try{
      const metadata=JSON.parse(e.metadata), payload=readPayload(j.package_id,metadata);
      const name=typeof payload.contact.display_name==="string"?payload.contact.display_name.slice(0,200):"";
      projected=projectHistorical(payload,{organizationId:j.organization_id,conversationId:null});
      const ids=new Set(),counts=new Map();
      for(const m of projected)counts.set(m.protocol_id,(counts.get(m.protocol_id)||0)+1);
      protocols=payload.protocols.map(p=>{
        const id=historyId(p.protocol_key);
        if(ids.has(id))throw Error("Colisão de protocolo.");
        ids.add(id);
        // Original metadata only; never manufacture dates or operational protocol numbers.
        const opened=typeof p.original_opened_at==="string"&&Number.isFinite(Date.parse(p.original_opened_at))?p.original_opened_at:null;
        const closed=typeof p.original_closed_at==="string"&&Number.isFinite(Date.parse(p.original_closed_at))?p.original_closed_at:null;
        return {id,opened_at:opened,closed_at:closed,original_status:typeof p.original_status==="string"?p.original_status:null,message_count:counts.get(id)||0};
      });
      verifiedMetadata=JSON.stringify({...metadata,historical_name:name});
    }catch{/* Never log private payload or paths. */}
    tx(()=>{
      const current=job(j.id,j.organization_id);
      if(current.state==="pausing"||current.state==="cancelling"){state(j.id,current.state==="pausing"?"paused":"cancelled");return}
      if(current.state!=="running")return;
      if(!verifiedMetadata||!projected||!protocols){state(j.id,"failed");audit(j.id,"worker","validation_failed");return}
      const insert=db.prepare("INSERT INTO history_messages VALUES (?,?,?,?,?,?)");
      const insertProtocol=db.prepare("INSERT INTO history_protocols VALUES (?,?,?,?,?)");
      for(const m of projected)insert.run(j.id,e.contact_key,m.id,timestampMicros(m.sent_at),m.protocol_id,JSON.stringify(m));
      for(const p of protocols)insertProtocol.run(j.id,e.contact_key,p.id,p.opened_at?timestampMicros(p.opened_at):0n,JSON.stringify(p));
      db.prepare("INSERT INTO history_index_ready VALUES (?,?)").run(j.id,e.contact_key);
      db.prepare("UPDATE entries SET state='verified',metadata=? WHERE job_id=? AND contact_key=? AND state='pending'").run(verifiedMetadata,j.id,e.contact_key);
      state(j.id,"queued");
    });
    return true;
  }
  // Only the server-side reconciliation flow can authorize a binding.
  // No names or messages are loaded by the management preview.
  function candidates(id,org){
    const j=job(id,org);
    if(j.state!=="completed")throw Error("Valide primeiro o lote.");
    return {account_phone:j.account_phone,entries:db.prepare(
      "SELECT e.contact_key,e.phone,e.state,b.contact_id,json_extract(e.metadata,'$.historical_name') AS historical_name FROM entries e LEFT JOIN bindings b ON b.job_id=e.job_id AND b.contact_key=e.contact_key WHERE e.job_id=? ORDER BY e.contact_key LIMIT 100"
    ).all(id)};
  }
  function bindContact({id,organizationId,actor,contactKey,contactId,contactPhone,accountPhone}){
    validateDestination(organizationId,accountPhone);
    if(!actor||!/^[a-f0-9]{32}$/.test(contactKey||"")||!/^[a-f0-9-]{36}$/i.test(contactId||""))throw Error("Vínculo inválido.");
    return tx(()=>{
      const j=job(id,organizationId);
      if(j.state!=="completed"||j.account_phone!==accountPhone)throw Error("Importação indisponível.");
      const entry=db.prepare("SELECT phone,state FROM entries WHERE job_id=? AND contact_key=?").get(id,contactKey);
      if(!entry||entry.state!=="verified"||entry.phone!==contactPhone)throw Error("Identidade divergente.");
      const old=db.prepare("SELECT contact_id,phone FROM bindings WHERE job_id=? AND contact_key=?").get(id,contactKey);
      if(old){if(old.contact_id===contactId&&old.phone===contactPhone)return {bound:true};throw Error("Vínculo já confirmado; revisão necessária.")}
      const conflict=db.prepare("SELECT 1 FROM bindings b JOIN jobs j ON j.id=b.job_id WHERE b.organization_id=? AND b.account_phone=? AND (b.contact_id=? OR b.phone=?) AND j.state='completed'").get(organizationId,accountPhone,contactId,contactPhone);
      if(conflict)throw Error("Outro histórico já está vinculado; revisão necessária.");
      db.prepare("INSERT INTO bindings VALUES (?,?,?,?,?,?,?,?)").run(organizationId,accountPhone,contactId,contactPhone,id,contactKey,actor,now());
      audit(id,actor,"contact_binding_confirmed");
      return {bound:true};
    });
  }
  function lookupBound({organizationId,accountPhone,contactPhone,contactId}){
    validateDestination(organizationId,accountPhone);
    if(!/^[1-9][0-9]{9,14}$/.test(contactPhone||"")||!/^[a-f0-9-]{36}$/i.test(contactId||""))throw Error("Identidade inválida.");
    const matches=db.prepare("SELECT j.package_id,e.metadata FROM bindings b JOIN jobs j ON j.id=b.job_id JOIN entries e ON e.job_id=b.job_id AND e.contact_key=b.contact_key WHERE b.organization_id=? AND j.organization_id=? AND b.account_phone=? AND j.account_phone=? AND b.contact_id=? AND b.phone=? AND e.phone=? AND e.state='verified' AND j.state='completed' LIMIT 2").all(organizationId,organizationId,accountPhone,accountPhone,contactId,contactPhone,contactPhone);
    if(matches.length!==1)return null;
    return readPayload(matches[0].package_id,JSON.parse(matches[0].metadata));
  }
  // Scope is supplied ONLY by a server that has authorized the exact conversation.
  // Read pages from local indexed rows: no R2 reads or full-contact decompression.
  function pageBound({organizationId,accountPhone,contactPhone,contactId,conversationId,before=null,protocolId=null,limit=60,kind="messages"}){
    const destination=validateDestination(organizationId,accountPhone);
    const uuid=v=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
    if(!uuid(contactId)||!uuid(conversationId)||!/^[1-9][0-9]{9,14}$/.test(contactPhone||"")||!Number.isSafeInteger(limit)||limit<1||limit>100||!["messages","protocols"].includes(kind)||protocolId!==null&&!uuid(protocolId)||before!==null&&(!uuid(before.id)||typeof before.sent_at!=="string"))throw Error("Página inválida.");
    const cutoff=before===null?null:timestampMicros(before.sent_at);
    const matches=db.prepare("SELECT b.job_id,b.contact_key,r.contact_key AS ready FROM bindings b JOIN jobs j ON j.id=b.job_id JOIN entries e ON e.job_id=b.job_id AND e.contact_key=b.contact_key LEFT JOIN history_index_ready r ON r.job_id=b.job_id AND r.contact_key=b.contact_key WHERE b.organization_id=? AND j.organization_id=? AND b.account_phone=? AND j.account_phone=? AND b.contact_id=? AND b.phone=? AND e.phone=? AND e.state='verified' AND j.state='completed' LIMIT 2").all(destination.organizationId,destination.organizationId,accountPhone,accountPhone,contactId,contactPhone,contactPhone);
    if(matches.length===0)return {items:[],hasMore:false,nextCursor:null};
    if(matches.length!==1||!matches[0].ready)throw Error("Índice indisponível; revisão necessária.");
    const {job_id,contact_key}=matches[0], time=kind==="messages"?"sent_micros":"opened_micros", table=kind==="messages"?"history_messages":"history_protocols";
    if(kind==="protocols"&&protocolId!==null)throw Error("Filtro inválido.");
    let sql="SELECT body FROM "+table+" WHERE job_id=? AND contact_key=?";
    const params=[job_id,contact_key];
    if(protocolId!==null){sql+=" AND protocol_id=?";params.push(protocolId)}
    if(cutoff!==null){sql+=" AND ("+time+"<? OR ("+time+"=? AND id<?))";params.push(cutoff,cutoff,before.id)}
    sql+=" ORDER BY "+time+" DESC,id DESC LIMIT ?";
    const rows=db.prepare(sql).all(...params,limit+1).map(r=>({...JSON.parse(r.body),conversation_id:conversationId}));
    // Limit transferred metadata even for contacts with unusually large messages.
    const items=[];let bytes=0;
    for(const r of rows.slice(0,limit)){
      const size=Buffer.byteLength(JSON.stringify(r));
      if(size>1024*1024)throw Error("Mensagem excede o limite seguro.");
      if(bytes+size>1024*1024)break;
      items.push(r);bytes+=size;
    }
    const last=items.at(-1);
    return {items,hasMore:rows.length>items.length,nextCursor:last?{sent_at:kind==="messages"?last.sent_at:last.opened_at||"1970-01-01T00:00:00.000Z",id:last.id}:null};
  }
  function lookup({organizationId,accountPhone,contactPhone}){
    validateDestination(organizationId,accountPhone);
    if(typeof contactPhone!=="string"||!/^[1-9][0-9]{9,14}$/.test(contactPhone))throw Error("Contato inválido.");
    const matches=db.prepare("SELECT j.package_id,e.metadata FROM entries e JOIN jobs j ON j.id=e.job_id WHERE j.organization_id=? AND j.account_phone=? AND e.phone=? AND e.state='verified' AND j.state='completed' LIMIT 2").all(organizationId,accountPhone,contactPhone);
    // Refuse ambiguous matches instead of combining distinct identities.
    if(matches.length>1)throw Error("Contato exige revisão.");
    return matches.length===1?readPayload(matches[0].package_id,JSON.parse(matches[0].metadata)):null;
  }
  return {grantPackage,prepare,control,status,list,events,tick,lookup,candidates,bindContact,lookupBound,pageBound,close:()=>db.close()};
}
