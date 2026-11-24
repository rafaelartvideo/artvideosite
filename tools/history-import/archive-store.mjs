// Server-only archive index. Requires Node >= 22.13, rclone crypt and a private local disk.
// No HTTP listener, CRM writes, credentials, or browser access. The future authenticated API
// must enforce organization membership, import permissions and verified account ownership.
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { chmodSync, lstatSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { projectHistorical,timestampMicros,historyId,normalizeArchiveTimestamp } from "./history-page.mjs";
import { validatePackageId, validateDestination, validateIndex, validatePayload, nextJobState, packageContactLimit, BULK_INDEX_MAX_BYTES } from "./archive-contract.mjs";
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
export function openArchiveStore(filename,read,{sourceOffsets}={}){
  if(sourceOffsets===undefined){
    const config=new URL("./source-offsets.json",import.meta.url);
    sourceOffsets=filename!==":memory:"&&existsSync(config)?JSON.parse(readFileSync(config,"utf8")):{};
  }
  if(!sourceOffsets||typeof sourceOffsets!=="object"||Array.isArray(sourceOffsets))throw Error("Configuração de fusos inválida.");
  for(const [packageId,offset] of Object.entries(sourceOffsets)){
    validatePackageId(packageId);
    if(typeof offset!=="string"||!/^[-+](?:0\d|1[0-4]):[0-5]\d$/.test(offset))throw Error("Fuso de pacote inválido.");
  }
  sourceOffsets=Object.freeze({...sourceOffsets});
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
    "CREATE INDEX IF NOT EXISTS archive_pending ON entries(job_id,state,contact_key)",
    "CREATE TABLE IF NOT EXISTS bulk_runs(job_id TEXT PRIMARY KEY REFERENCES jobs(id),actor TEXT NOT NULL,state TEXT NOT NULL,after_key TEXT,processed INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL DEFAULT 0,linked INTEGER NOT NULL DEFAULT 0,bound INTEGER NOT NULL DEFAULT 0,review INTEGER NOT NULL DEFAULT 0,renamed INTEGER NOT NULL DEFAULT 0,started_at TEXT NOT NULL,updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), actor TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS bindings(organization_id TEXT NOT NULL, account_phone TEXT NOT NULL, contact_id TEXT NOT NULL, phone TEXT NOT NULL, job_id TEXT NOT NULL, contact_key TEXT NOT NULL, actor TEXT NOT NULL, confirmed_at TEXT NOT NULL, PRIMARY KEY(job_id,contact_key), FOREIGN KEY(job_id,contact_key) REFERENCES entries(job_id,contact_key))",
    "CREATE INDEX IF NOT EXISTS history_bindings_lookup ON bindings(organization_id,account_phone,contact_id,phone)",
    "CREATE TABLE IF NOT EXISTS history_messages(job_id TEXT NOT NULL,contact_key TEXT NOT NULL,id TEXT NOT NULL,sent_micros INTEGER NOT NULL,protocol_id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(job_id,contact_key,id),FOREIGN KEY(job_id,contact_key) REFERENCES entries(job_id,contact_key))",
    "CREATE INDEX IF NOT EXISTS history_messages_page ON history_messages(job_id,contact_key,sent_micros DESC,id DESC)",
    "CREATE INDEX IF NOT EXISTS history_messages_protocol ON history_messages(job_id,contact_key,protocol_id,sent_micros DESC,id DESC)",
    "CREATE TABLE IF NOT EXISTS history_protocols(job_id TEXT NOT NULL,contact_key TEXT NOT NULL,id TEXT NOT NULL,opened_micros INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(job_id,contact_key,id),FOREIGN KEY(job_id,contact_key) REFERENCES entries(job_id,contact_key))",
    "CREATE INDEX IF NOT EXISTS history_protocols_page ON history_protocols(job_id,contact_key,opened_micros DESC,id DESC)",
    "CREATE TABLE IF NOT EXISTS history_assets(job_id TEXT NOT NULL,contact_key TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,available INTEGER NOT NULL,metadata TEXT NOT NULL,PRIMARY KEY(job_id,contact_key,id),FOREIGN KEY(job_id,contact_key) REFERENCES entries(job_id,contact_key))",
    "CREATE TABLE IF NOT EXISTS history_shared(job_id TEXT NOT NULL,contact_key TEXT NOT NULL,category TEXT NOT NULL,id TEXT NOT NULL,sent_micros INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(job_id,contact_key,category,id),FOREIGN KEY(job_id,contact_key) REFERENCES entries(job_id,contact_key))",
    "CREATE INDEX IF NOT EXISTS history_shared_page ON history_shared(job_id,contact_key,category,sent_micros DESC,id DESC)",
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
      if(summary.package_id!==packageId||!packageContactLimit(summary)||!Number.isInteger(summary.contacts)||summary.contacts<1||summary.contacts>packageContactLimit(summary))throw Error("Pacote privado não reconhecido.");
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
    const rows=read(packageId,"indice-privado.jsonl",summary.stage==="union_history_bulk_packaging"?BULK_INDEX_MAX_BYTES:2*1024*1024).toString("utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
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
    return tx(()=>{
      const j=job(id,organizationId),bulk=db.prepare("SELECT state FROM bulk_runs WHERE job_id=?").get(id);
      if(bulk&&(action!=="rollback"||!["completed","cancelled"].includes(bulk.state)))throw Error("Use os controles da importação automática.");
      const next=nextJobState(j.state,action);state(id,next);audit(id,actor,action);return next;
    });
  }
  function status(id,org){
    const j=job(id,org);
    const counts=db.prepare("SELECT state,COUNT(*) AS count FROM entries WHERE job_id=? GROUP BY state").all(id);
    const totals={messages:0,protocols:0,media_available:0,media_pending:0},verified={...totals};
    // Aggregate in SQLite; never materialize the full private index on every poll.
    const cols=Object.keys(totals).map(k=>"coalesce(sum(json_extract(metadata,'$."+k+"')),0) AS "+k).join(",");
    for(const row of db.prepare("SELECT state,"+cols+" FROM entries WHERE job_id=? GROUP BY state").all(id)){
      for(const k of Object.keys(totals)){totals[k]+=Number(row[k]);if(row.state==="verified")verified[k]+=Number(row[k]);}
    }
    return {id:j.id,state:j.state,account_phone:j.account_phone,total:j.total,updated_at:j.updated_at,counts,totals,verified,bound:Number(db.prepare("SELECT count(*) AS n FROM bindings WHERE job_id=?").get(id).n),bulk:db.prepare("SELECT state,processed,created,linked,bound,review,renamed,started_at,updated_at FROM bulk_runs WHERE job_id=?").get(id)||null};
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
    const {j,e}=claim;let verifiedMetadata=null,projected=null,protocols=null,assets=null,shared=null;
    try{
      const metadata=JSON.parse(e.metadata), payload=readPayload(j.package_id,metadata);
      const sourceOffset=sourceOffsets[j.package_id]||null;
      // Once any contact was indexed, a resume must use the same date policy.
      const prior=db.prepare("SELECT metadata FROM entries WHERE job_id=? AND state='verified' LIMIT 1").get(j.id);
      if(prior&&(JSON.parse(prior.metadata).source_offset||null)!==sourceOffset)throw Error("Fuso do lote alterado.");
      const name=typeof payload.contact.display_name==="string"?payload.contact.display_name.slice(0,200):"";
      projected=projectHistorical(payload,{organizationId:j.organization_id,conversationId:null,sourceOffset});
      // Preserve private manifests for both linked and independently recovered attachments.
      assets=payload.media.map(m=>({id:m.url_sha256,kind:typeof m.type==="string"?m.type:"unknown",available:m.available===true,mime:typeof m.mime==="string"?m.mime:"",size_bytes:m.available?m.size_bytes:null,sha256:m.available?m.sha256:null,rclone_relative_key:m.available?m.rclone_relative_key:null,original_at:typeof m.original_at==="string"&&Number.isFinite(Date.parse(m.original_at))?m.original_at:null,linked_to_message:m.linked_to_message===true}));
      const ids=new Set(),counts=new Map();
      for(const m of projected)counts.set(m.protocol_id,(counts.get(m.protocol_id)||0)+1);
      protocols=payload.protocols.map(p=>{
        const id=historyId(p.protocol_key);
        if(ids.has(id))throw Error("Colisão de protocolo.");
        ids.add(id);
        // Original metadata only; never manufacture dates or operational protocol numbers.
        const opened=typeof p.original_opened_at==="string"&&p.original_opened_at.trim()?normalizeArchiveTimestamp(p.original_opened_at,sourceOffset):null;
        const closed=typeof p.original_closed_at==="string"&&p.original_closed_at.trim()?normalizeArchiveTimestamp(p.original_closed_at,sourceOffset):null;
        return {id,opened_at:opened,closed_at:closed,original_status:typeof p.original_status==="string"?p.original_status:null,message_count:counts.get(id)||0};
      });
      // A gallery row per asset, including independently recovered files. Dates are
      // original when known; an internal epoch cursor sorts undated items last.
      const linked=new Map();
      for(const m of projected)for(const a of m.attachments){
        const old=linked.get(a.id);
        if(!old||timestampMicros(m.sent_at)>timestampMicros(old.sent_at))linked.set(a.id,m);
      }
      shared=[];
      const epoch="1970-01-01T00:00:00.000Z",validDate=at=>{try{return normalizeArchiveTimestamp(at,sourceOffset)}catch{return null}};
      for(const a of assets){
        const m=linked.get(a.id), at=validDate(a.original_at)||m?.sent_at||null;
        const mime=a.mime.toLowerCase(), kind=mime.startsWith("image/")?(a.kind==="sticker"?"sticker":"image"):mime.startsWith("video/")?"video":mime.startsWith("audio/")?"audio":(["image","audio","video","sticker"].includes(a.kind)?a.kind:"file");
        const id=historyId(sha(Buffer.from("asset:"+a.id)));
        const row={id,history_key:a.id,read_only:true,organization_id:j.organization_id,sent_at:at||epoch,unknown_date:!at,direction:m?.direction||null,protocol_id:m?.protocol_id||null,body_text:"",sender_name:null,delivery_status:null,message_type:kind,attachments:[{id:a.id,kind,mime:a.mime,available:a.available}]};
        shared.push({category:kind==="file"?"documents":"media",row});
      }
      for(const m of projected){
        const links=[...new Set([...(m.links||[]),...((m.body_text||"").match(/https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi)||[])])].filter(v=>/^(https?:\/\/|www\.)/i.test(v));
        if(links.length)shared.push({category:"links",row:{...m,attachments:[],body_text:links.join("\n"),message_type:"text"}});
      }
      verifiedMetadata=JSON.stringify({...metadata,historical_name:name,source_offset:sourceOffset});
    }catch{/* Never log private payload or paths. */}
    tx(()=>{
      const current=job(j.id,j.organization_id);
      if(current.state==="pausing"||current.state==="cancelling"){state(j.id,current.state==="pausing"?"paused":"cancelled");return}
      if(current.state!=="running")return;
      if(!verifiedMetadata||!projected||!protocols||!assets||!shared){state(j.id,"failed");audit(j.id,"worker","validation_failed");return}
      const insert=db.prepare("INSERT INTO history_messages VALUES (?,?,?,?,?,?)");
      const insertProtocol=db.prepare("INSERT INTO history_protocols VALUES (?,?,?,?,?)");
      for(const m of projected)insert.run(j.id,e.contact_key,m.id,timestampMicros(m.sent_at),m.protocol_id,JSON.stringify(m));
      for(const p of protocols)insertProtocol.run(j.id,e.contact_key,p.id,p.opened_at?timestampMicros(p.opened_at):0n,JSON.stringify(p));
      const insertAsset=db.prepare("INSERT INTO history_assets VALUES (?,?,?,?,?,?)");
      for(const a of assets)insertAsset.run(j.id,e.contact_key,a.id,a.kind,a.available?1:0,JSON.stringify(a));
      const insertShared=db.prepare("INSERT INTO history_shared VALUES (?,?,?,?,?,?)");
      for(const {category,row} of shared)insertShared.run(j.id,e.contact_key,category,row.id,timestampMicros(row.sent_at),JSON.stringify(row));
      db.prepare("INSERT INTO history_index_ready VALUES (?,?)").run(j.id,e.contact_key);
      db.prepare("UPDATE entries SET state='verified',metadata=? WHERE job_id=? AND contact_key=? AND state='pending'").run(verifiedMetadata,j.id,e.contact_key);
      state(j.id,"queued");
    });
    return true;
  }
  // Only the server-side reconciliation flow can authorize a binding.
  // No names or messages are loaded by the management preview.
  function candidates(id,org,after=null,limit=100){
    const j=job(id,org);
    if(j.state!=="completed")throw Error("Valide primeiro o lote.");
    if(after!==null&&!/^[a-f0-9]{32}$/.test(after))throw Error("Cursor inválido.");
    if(!Number.isInteger(limit)||limit<1||limit>100)throw Error("Limite inválido.");
    const rows=db.prepare(
      "SELECT e.contact_key,e.phone,e.state,b.contact_id,json_extract(e.metadata,'$.historical_name') AS historical_name FROM entries e LEFT JOIN bindings b ON b.job_id=e.job_id AND b.contact_key=e.contact_key WHERE e.job_id=? AND e.contact_key>? ORDER BY e.contact_key LIMIT ?"
    ).all(id,after||"",limit+1);
    const entries=rows.slice(0,limit);
    for(const row of entries){
      const variants=[row.phone];
      if(/^55[1-9][0-9]9[6-9][0-9]{7}$/.test(row.phone))variants.push(row.phone.slice(0,4)+row.phone.slice(5));
      if(/^55[1-9][0-9][6-9][0-9]{7}$/.test(row.phone))variants.push(row.phone.slice(0,4)+"9"+row.phone.slice(4));
      row.identity_conflict=variants.some(phone=>Boolean(db.prepare(
        "SELECT 1 FROM entries e JOIN jobs j ON j.id=e.job_id WHERE j.organization_id=? AND j.account_phone=? AND e.phone=? AND NOT(e.job_id=? AND e.contact_key=?) AND j.state NOT IN ('cancelled','rolled_back') LIMIT 1"
      ).get(org,j.account_phone,phone,id,row.contact_key)));
    }
    return {account_phone:j.account_phone,entries,next_after:rows.length>limit?entries.at(-1).contact_key:null};
  }
  function bulkControl({id,organizationId,actor,command}){
    if(!actor)throw Error("Responsável obrigatório.");
    return tx(()=>{
      const j=job(id,organizationId),old=db.prepare("SELECT * FROM bulk_runs WHERE job_id=?").get(id);
      if(command==="start"){
        if(old||!["prepared","queued","running","completed","paused","failed"].includes(j.state))throw Error("Importação indisponível.");
        if(["prepared","paused","failed"].includes(j.state))state(id,"queued");
        db.prepare("INSERT INTO bulk_runs(job_id,actor,state,started_at,updated_at) VALUES (?,?,'running',?,?)").run(id,actor,now(),now());
      }else{
        if(!old)throw Error("Importação automática inexistente.");
        if(command==="pause"&&old.state==="running"){
          if(j.state==="queued")state(id,"paused");
          if(j.state==="running")state(id,"pausing");
          db.prepare("UPDATE bulk_runs SET state='paused',updated_at=? WHERE job_id=?").run(now(),id);
        }else if(command==="resume"&&(["paused","failed"].includes(old.state)||old.state==="running"&&j.state==="failed")&&j.state!=="pausing"){
          if(["paused","failed","prepared"].includes(j.state))state(id,"queued");
          db.prepare("UPDATE bulk_runs SET state='running',actor=?,updated_at=? WHERE job_id=?").run(actor,now(),id);
        }else if(command==="cancel"&&["running","paused","failed"].includes(old.state)){
          if(["queued","paused","failed","prepared"].includes(j.state))state(id,"cancelled");
          if(["running","pausing"].includes(j.state))state(id,"cancelling");
          db.prepare("UPDATE bulk_runs SET state='cancelled',updated_at=? WHERE job_id=?").run(now(),id);
        }else throw Error("Transição automática inválida.");
      }
      audit(id,actor,"bulk_"+command);
      return {state:db.prepare("SELECT state FROM bulk_runs WHERE job_id=?").get(id).state};
    });
  }
  function bulkContext(id,organizationId){
    const j=job(id,organizationId),run=db.prepare("SELECT * FROM bulk_runs WHERE job_id=?").get(id);
    if(j.state!=="completed"||run?.state!=="running")throw Error("Conciliação indisponível.");
    return {id,organizationId,accountPhone:j.account_phone,actor:run.actor,after:run.after_key};
  }
  function auditIntegrity(id,org){
    const summary=status(id,org);
    if(summary.state!=="completed")throw Error("Conclua a validação antes de auditar.");
    const actual={
      messages:Number(db.prepare("SELECT count(*) AS n FROM history_messages WHERE job_id=?").get(id).n),
      protocols:Number(db.prepare("SELECT count(*) AS n FROM history_protocols WHERE job_id=?").get(id).n),
      media_available:Number(db.prepare("SELECT count(*) AS n FROM history_assets WHERE job_id=? AND available=1").get(id).n),
      media_pending:Number(db.prepare("SELECT count(*) AS n FROM history_assets WHERE job_id=? AND available=0").get(id).n)
    };
    const indexed=Number(db.prepare("SELECT count(*) AS n FROM history_index_ready WHERE job_id=?").get(id).n);
    const duplicateMessages=Number(db.prepare("SELECT coalesce(sum(n-1),0) AS n FROM (SELECT count(*) AS n FROM history_messages WHERE job_id=? GROUP BY id HAVING count(*)>1)").get(id).n);
    const duplicateProtocols=Number(db.prepare("SELECT coalesce(sum(n-1),0) AS n FROM (SELECT count(*) AS n FROM history_protocols WHERE job_id=? GROUP BY id HAVING count(*)>1)").get(id).n);
    const verified=summary.counts.find(row=>row.state==="verified")?.count||0;
    const review=summary.counts.find(row=>row.state==="review")?.count||0;
    return {id,total:summary.total,verified,review,indexed,bound:summary.bound,expected:summary.verified,actual,duplicateMessages,duplicateProtocols,
      index_matches:verified===indexed&&Object.keys(actual).every(k=>actual[k]===summary.verified[k])&&duplicateMessages===0&&duplicateProtocols===0,
      media_binary_verified:false,backup_modified:false};
  }
  function bulkWork(){
    const row=db.prepare("SELECT j.id,j.organization_id FROM bulk_runs b JOIN jobs j ON j.id=b.job_id WHERE b.state='running' AND j.state='completed' ORDER BY b.updated_at,j.id LIMIT 1").get();
    return row?bulkContext(row.id,row.organization_id):null;
  }
  function bulkCommit(work,result){
    return tx(()=>{
      const current=bulkContext(work.id,work.organizationId);
      if(current.after!==work.after||current.actor!==work.actor)throw Error("Checkpoint alterado.");
      const expected=candidates(work.id,work.organizationId,work.after,5);
      if(!Array.isArray(result?.entries)||result.entries.length!==expected.entries.length||result.next_after!==expected.next_after)throw Error("Resultado de lote inválido.");
      const counts={created:0,linked:0,bound:0,review:0,renamed:0};
      for(let i=0;i<expected.entries.length;i++){
        const entry=result.entries[i];
        if(entry.contact_key!==expected.entries[i].contact_key||!["created","linked","bound","review"].includes(entry.state))throw Error("Resultado de contato inválido.");
        if(entry.state!=="review"&&!expected.entries[i].contact_id)throw Error("Vínculo não confirmado no índice.");
        counts[entry.state]++;if(entry.renamed===true)counts.renamed++;
      }
      db.prepare("UPDATE bulk_runs SET after_key=?,processed=processed+?,created=created+?,linked=linked+?,bound=bound+?,review=review+?,renamed=renamed+?,state=?,updated_at=? WHERE job_id=?")
        .run(expected.next_after||expected.entries.at(-1)?.contact_key||work.after,result.entries.length,counts.created,counts.linked,counts.bound,counts.review,counts.renamed,expected.next_after?"running":"completed",now(),work.id);
      if(!expected.next_after)audit(work.id,work.actor,"bulk_completed");
    });
  }
  function bulkFail(work){
    tx(()=>{
      const row=db.prepare("SELECT state,after_key,actor FROM bulk_runs WHERE job_id=?").get(work.id);
      if(row?.state==="running"&&row.after_key===work.after&&row.actor===work.actor){
        db.prepare("UPDATE bulk_runs SET state='failed',updated_at=? WHERE job_id=?").run(now(),work.id);
        audit(work.id,"worker","bulk_failed");
      }
    });
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
  function boundIndex({organizationId,accountPhone,contactPhone,contactId}){
    const destination=validateDestination(organizationId,accountPhone);
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(contactId||"")||!/^[1-9][0-9]{9,14}$/.test(contactPhone||""))throw Error("Identidade inválida.");
    const matches=db.prepare("SELECT b.job_id,b.contact_key,r.contact_key AS ready FROM bindings b JOIN jobs j ON j.id=b.job_id JOIN entries e ON e.job_id=b.job_id AND e.contact_key=b.contact_key LEFT JOIN history_index_ready r ON r.job_id=b.job_id AND r.contact_key=b.contact_key WHERE b.organization_id=? AND j.organization_id=? AND b.account_phone=? AND j.account_phone=? AND b.contact_id=? AND b.phone=? AND e.phone=? AND e.state='verified' AND j.state='completed' LIMIT 2").all(destination.organizationId,destination.organizationId,accountPhone,accountPhone,contactId,contactPhone,contactPhone);
    if(matches.length===0)return null;
    if(matches.length!==1||!matches[0].ready)throw Error("Índice indisponível; revisão necessária.");
    return matches[0];
  }
  // Internal manifest resolution only. Never return this object to HTTP clients.
  function assetBound(scope,assetId){
    if(typeof assetId!=="string"||!/^[a-f0-9]{64}$/.test(assetId))throw Error("Anexo inválido.");
    const bound=boundIndex(scope);
    if(!bound)return null;
    const row=db.prepare("SELECT metadata FROM history_assets WHERE job_id=? AND contact_key=? AND id=? AND available=1").get(bound.job_id,bound.contact_key,assetId);
    return row?JSON.parse(row.metadata):null;
  }
  // Scope is supplied ONLY by a server that has authorized the exact conversation.
  // Read pages from local indexed rows: no R2 reads or full-contact decompression.
  function pageBound({organizationId,accountPhone,contactPhone,contactId,conversationId,before=null,protocolId=null,limit=60,kind="messages",category=null}){
    const destination=validateDestination(organizationId,accountPhone);
    const uuid=v=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
    if(!uuid(contactId)||!uuid(conversationId)||!/^[1-9][0-9]{9,14}$/.test(contactPhone||"")||!Number.isSafeInteger(limit)||limit<1||limit>100||!["messages","protocols","shared"].includes(kind)||protocolId!==null&&!uuid(protocolId)||before!==null&&(!uuid(before.id)||typeof before.sent_at!=="string"))throw Error("Página inválida.");
    const cutoff=before===null?null:timestampMicros(before.sent_at);
    const bound=boundIndex({organizationId:destination.organizationId,accountPhone,contactPhone,contactId});
    if(!bound)return {items:[],hasMore:false,nextCursor:null};
    const {job_id,contact_key}=bound, time=kind==="protocols"?"opened_micros":"sent_micros", table=kind==="protocols"?"history_protocols":kind==="shared"?"history_shared":"history_messages";
    if(kind!=="messages"&&protocolId!==null)throw Error("Filtro inválido.");
    let sql="SELECT body FROM "+table+" WHERE job_id=? AND contact_key=?";
    const params=[job_id,contact_key];
    if(kind==="shared"){if(!["media","documents","links"].includes(category))throw Error("Categoria inválida.");sql+=" AND category=?";params.push(category)}
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
    return {items,hasMore:rows.length>items.length,nextCursor:last?{sent_at:kind!=="protocols"?last.sent_at:last.opened_at||"1970-01-01T00:00:00.000Z",id:last.id}:null};
  }
  function lookup({organizationId,accountPhone,contactPhone}){
    validateDestination(organizationId,accountPhone);
    if(typeof contactPhone!=="string"||!/^[1-9][0-9]{9,14}$/.test(contactPhone))throw Error("Contato inválido.");
    const matches=db.prepare("SELECT j.package_id,e.metadata FROM entries e JOIN jobs j ON j.id=e.job_id WHERE j.organization_id=? AND j.account_phone=? AND e.phone=? AND e.state='verified' AND j.state='completed' LIMIT 2").all(organizationId,accountPhone,contactPhone);
    // Refuse ambiguous matches instead of combining distinct identities.
    if(matches.length>1)throw Error("Contato exige revisão.");
    return matches.length===1?readPayload(matches[0].package_id,JSON.parse(matches[0].metadata)):null;
  }
  return {grantPackage,prepare,control,status,list,events,tick,lookup,candidates,bindContact,lookupBound,pageBound,assetBound,auditIntegrity,bulkControl,bulkContext,bulkWork,bulkCommit,bulkFail,close:()=>db.close()};
}
