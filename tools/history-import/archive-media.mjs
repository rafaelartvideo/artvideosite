// Short-lived opaque media capabilities; the private R2 path never leaves this process.
// Each asset is fully verified before any bytes are returned. A small bounded disk
// cache is tied to the ticket, and every GET rechecks the current archive binding.
import { randomBytes,createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream,createWriteStream } from "node:fs";
import { mkdtemp,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
const MAX_BYTES=64*1024*1024;
const SAFE_MIME=/^(?:image\/(?:jpeg|png|gif|webp)|audio\/(?:mpeg|mp4|ogg|wav|webm|aac|x-wav)|video\/(?:mp4|webm|quicktime)|application\/pdf)$/;
export function mediaRange(header,size){
 if(!Number.isSafeInteger(size)||size<0)throw Error("Tamanho inválido.");
 if(header===undefined)return {start:0,end:size-1,partial:false};
 const m=typeof header==="string"&&/^bytes=(\d{0,16})-(\d{0,16})$/.exec(header);
 if(!m||!size||(!m[1]&&!m[2]))return null;
 const a=m[1]?Number(m[1]):null,b=m[2]?Number(m[2]):null;
 if(a!==null&&!Number.isSafeInteger(a)||b!==null&&!Number.isSafeInteger(b))return null;
 const start=a===null?Math.max(0,size-b):a,end=a===null||b===null?size-1:Math.min(b,size-1);
 if(start>=size||end<start)return null;
 return {start,end,partial:true};
}
export function makeAssetReader({rclone="rclone",config}){
 return async function read(asset,path){
   if(!config||!Number.isSafeInteger(asset.size_bytes)||asset.size_bytes<0||asset.size_bytes>MAX_BYTES||!(/^[a-f0-9]{64}$/).test(asset.sha256))throw Error("Anexo inválido.");
   const parts=typeof asset.rclone_relative_key==="string"?asset.rclone_relative_key.split("/"):null;
   if(!parts||parts.length!==4||parts[0]!=="contatos"||parts[2]!=="anexos"||parts.some(s=>!s||s==="."||s===".."||/[\\:\x00-\x1f\x7f]/.test(s)))throw Error("Anexo inválido.");
   const proc=spawn(rclone,["--config",config,"cat","sac-crypt:backup-sac-lotes/"+parts.join("/"),"--retries","1","--contimeout","10s","--timeout","45s"],{stdio:["ignore","pipe","ignore"],windowsHide:true});
   const completed=new Promise((resolve,reject)=>{proc.once("error",reject);proc.once("close",code=>code===0?resolve():reject(Error("Leitura privada falhou.")))});
   // Attach a handler immediately: spawn errors must never crash the process.
   completed.catch(()=>{});
   const timer=setTimeout(()=>proc.kill("SIGKILL"),75000);timer.unref();
   let bytes=0;const hash=createHash("sha256");
   try{
     await Promise.all([completed,pipeline(proc.stdout,new Transform({transform(chunk,_,cb){
       bytes+=chunk.length;
       if(bytes>asset.size_bytes||bytes>MAX_BYTES)return cb(Error("Limite de arquivo."));
       hash.update(chunk);cb(null,chunk);
     }}),createWriteStream(path,{flags:"wx",mode:0o600}))]);
     if(bytes!==asset.size_bytes||hash.digest("hex")!==asset.sha256)throw Error("Integridade divergente.");
   }finally{clearTimeout(timer);if(proc.exitCode===null)proc.kill("SIGKILL")}
 };
}
export function createMediaService({resolveAsset,readAsset,clock=Date.now,ttlMs=120000,maxTickets=512,maxCached=4,maxDownloads=2}){
 const tickets=new Map();let downloads=0;
 const cleanup=async()=>{
   const now=clock();
   for(const [token,t] of tickets)if(t.expires<=now&&!t.active&&!t.loading){
     tickets.delete(token);if(t.dir)await rm(t.dir,{recursive:true,force:true}).catch(()=>{});
   }
 };
 const timer=setInterval(()=>void cleanup(),15000);timer.unref();
 function issue(scope,assetId,download=false){
   const asset=resolveAsset(scope,assetId);
   if(!asset||!Number.isSafeInteger(asset.size_bytes)||asset.size_bytes<0||asset.size_bytes>MAX_BYTES)throw Error("Anexo indisponível.");
   if(tickets.size>=maxTickets)throw Error("Limite temporário de mídia.");
   const token=randomBytes(32).toString("hex"),expires=clock()+ttlMs;
   tickets.set(token,{scope:{...scope},assetId,sha:asset.sha256,size:asset.size_bytes,download:download===true,expires,active:0,loading:null,dir:null});
   return {token,expires_at:new Date(expires).toISOString()};
 }
 const fail=(res,status)=>{res.writeHead(status,{"Cache-Control":"no-store","Content-Length":"0","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"});res.end()};
 async function serve(req,res,token){
   await cleanup();
   if(!/^[a-f0-9]{64}$/.test(token||""))return fail(res,404);
   const t=tickets.get(token);
   if(!t||clock()>=t.expires)return fail(res,404);
   let asset=resolveAsset(t.scope,t.assetId);
   if(!asset||asset.sha256!==t.sha||asset.size_bytes!==t.size)return fail(res,404);
   const range=mediaRange(req.headers.range,t.size);
   if(!range){res.writeHead(416,{"Content-Range":"bytes */"+t.size,"Cache-Control":"no-store","Content-Length":"0"});return res.end()}
   t.active++;
   try{
     if(!t.dir&&!t.loading){
       if(downloads>=maxDownloads||[...tickets.values()].filter(v=>v.dir||v.loading).length>=maxCached)return fail(res,503);
       downloads++;
       t.loading=(async()=>{
         const dir=await mkdtemp(join(tmpdir(),"union-history-"));
         try{await readAsset(asset,join(dir,"asset"));t.dir=dir}
         catch(e){await rm(dir,{recursive:true,force:true});throw e}
       })().finally(()=>{downloads--;t.loading=null});
     }
     if(t.loading)await t.loading;
     // A rollback while the binary was being verified must invalidate delivery.
     asset=resolveAsset(t.scope,t.assetId);
     if(!asset||asset.sha256!==t.sha||asset.size_bytes!==t.size||clock()>=t.expires)return fail(res,404);
     const mime=SAFE_MIME.test(asset.mime||"")?asset.mime:"application/octet-stream";
     const headers={"Content-Type":mime,"Content-Length":String(range.end-range.start+1),"Accept-Ranges":"bytes","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; sandbox","Access-Control-Allow-Origin":"*","Access-Control-Expose-Headers":"Content-Length, Content-Range, Accept-Ranges","Content-Disposition":(t.download||mime==="application/octet-stream"?"attachment":"inline")};
     if(range.partial)headers["Content-Range"]="bytes "+range.start+"-"+range.end+"/"+t.size;
     res.writeHead(range.partial?206:200,headers);
     if(req.method==="HEAD"||!t.size){res.end();return}
     await pipeline(createReadStream(join(t.dir,"asset"),{start:range.start,end:range.end}),res);
   }catch{if(!res.headersSent)fail(res,502);else res.destroy()}
   finally{t.active--;await cleanup()}
 }
 return {issue,serve,close:async()=>{clearInterval(timer);for(const t of tickets.values())t.expires=0;await cleanup()}};
}
