// Server-only archive index. Requires Node >= 22.13, rclone crypt and a private local disk.
// No HTTP listener, CRM writes, credentials, or browser access. The future authenticated API
// must enforce organization membership, import permissions and verified account ownership.
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { chmodSync, lstatSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
    "CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), actor TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL)"
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
    return {id:j.id,state:j.state,account_phone:j.account_phone,total:j.total,updated_at:j.updated_at,counts};
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
    const {j,e}=claim;let valid=false;
    try{readPayload(j.package_id,JSON.parse(e.metadata));valid=true}catch{/* Never log private payload or paths. */}
    tx(()=>{
      const current=job(j.id,j.organization_id);
      if(current.state==="pausing"||current.state==="cancelling"){state(j.id,current.state==="pausing"?"paused":"cancelled");return}
      if(current.state!=="running")return;
      if(!valid){state(j.id,"failed");audit(j.id,"worker","validation_failed");return}
      db.prepare("UPDATE entries SET state='verified' WHERE job_id=? AND contact_key=? AND state='pending'").run(j.id,e.contact_key);
      state(j.id,"queued");
    });
    return true;
  }
  function lookup({organizationId,accountPhone,contactPhone}){
    validateDestination(organizationId,accountPhone);
    if(typeof contactPhone!=="string"||!/^[1-9][0-9]{9,14}$/.test(contactPhone))throw Error("Contato inválido.");
    const matches=db.prepare("SELECT j.package_id,e.metadata FROM entries e JOIN jobs j ON j.id=e.job_id WHERE j.organization_id=? AND j.account_phone=? AND e.phone=? AND e.state='verified' AND j.state='completed' LIMIT 2").all(organizationId,accountPhone,contactPhone);
    // Refuse ambiguous matches instead of combining distinct identities.
    if(matches.length>1)throw Error("Contato exige revisão.");
    return matches.length===1?readPayload(matches[0].package_id,JSON.parse(matches[0].metadata)):null;
  }
  return {grantPackage,prepare,control,status,list,events,tick,lookup,close:()=>db.close()};
}
