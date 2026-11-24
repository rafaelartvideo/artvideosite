import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {writeFile,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {createMediaService,makeAssetReader,mediaRange} from "./archive-media.mjs";
const bytes=Buffer.from("private media fixture");
const asset={sha256:createHash("sha256").update(bytes).digest("hex"),size_bytes:bytes.length,mime:"audio/mpeg",rclone_relative_key:"contatos/fixture/anexos/fixture.mp3"};
test("strict byte ranges support playback and reject invalid requests",()=>{
 assert.deepEqual(mediaRange("bytes=2-4",10),{start:2,end:4,partial:true});
 assert.deepEqual(mediaRange("bytes=-3",10),{start:7,end:9,partial:true});
 assert.deepEqual(mediaRange("bytes=6-",10),{start:6,end:9,partial:true});
 assert.equal(mediaRange("bytes=10-",10),null);
 assert.equal(mediaRange("bytes=1-2,3-4",10),null);
 assert.equal(mediaRange("bytes=-0",10),null);
});
test("opaque media ticket supports range requests, caches verified bytes and rejects revocation/expiry",async()=>{
 let now=10000,allowed=true,reads=0;
 const service=createMediaService({clock:()=>now,ttlMs:1000,resolveAsset:(scope,id)=>allowed&&scope.org==="one"&&id==="asset"?asset:null,readAsset:async(_,path)=>{reads++;await writeFile(path,bytes,{mode:0o600})}});
 const server=createServer((req,res)=>void service.serve(req,res,req.url.slice(1)));
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 const base="http://127.0.0.1:"+server.address().port+"/";
 try{
   assert.throws(()=>service.issue({org:"other"},"asset"));
   const {token}=service.issue({org:"one"},"asset");
   assert.match(token,/^[a-f0-9]{64}$/);
   const first=await fetch(base+token,{headers:{range:"bytes=0-6"}});
   assert.equal(first.status,206);
   assert.equal(await first.text(),"private");
   assert.equal(first.headers.get("content-range"),"bytes 0-6/"+bytes.length);
   assert.equal(first.headers.get("cache-control"),"private, no-store");
   const second=await fetch(base+token);
   assert.equal(await second.text(),bytes.toString());
   assert.equal(reads,1);
   assert.equal((await fetch(base+"0".repeat(64))).status,404);
   allowed=false;
   assert.equal((await fetch(base+token)).status,404);
   allowed=true;now+=1001;
   assert.equal((await fetch(base+token)).status,404);
 }finally{await service.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
});
test("R2 reader checks complete binary length and hash, blocks unsafe paths",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"history-reader-test-"));
 try{
   const fake=join(dir,"fake-rclone");
   await writeFile(fake,"#!/bin/sh\nprintf 'private media fixture'\n",{mode:0o700});
   const read=makeAssetReader({rclone:fake,config:"unused"});
   await read(asset,join(dir,"good"));
   await assert.rejects(read({...asset,sha256:"0".repeat(64)},join(dir,"bad")));
   await assert.rejects(read({...asset,size_bytes:2},join(dir,"short")));
   await assert.rejects(read({...asset,rclone_relative_key:"contatos/../anexos/fixture"},join(dir,"unsafe")));
 }finally{await rm(dir,{recursive:true,force:true})}
});
