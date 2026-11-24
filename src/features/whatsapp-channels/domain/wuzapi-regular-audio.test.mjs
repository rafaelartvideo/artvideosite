import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";

const bridge = readFileSync(new URL("../../../../services/union-wuzapi-bridge/server.mjs", import.meta.url), "utf8");

async function mediaHarness(provider) {
  const sessions=new Map(),calls=[];
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const source=bridge.replace(/^import .*;\r?\n/gm, "").split("createServer(async (req, res) => {")[0];
  const api=await new AsyncFunction("deps",`
    const {process,mkdir,readFile,join,createHash,fetch}=deps;
    ${source}
    return {operate,pending:()=>typeof mediaPending==='undefined'?null:mediaPending};
  `)({
    process:{env:{UNION_WUZAPI_BRIDGE_SECRET:"s".repeat(32),WUZAPI_ADMIN_TOKEN:"a".repeat(16)}},
    mkdir:async()=>{},join,createHash,
    readFile:async path=>JSON.stringify(sessions.get(path.match(/([a-f0-9-]{36})\.json$/)?.[1])),
    fetch:async (url,options)=>{
      assert.match(url,/^http:\/\/127\.0\.0\.1:18080\/chat\/download(image|audio|video|document|sticker)$/);
      const call={url,token:options.headers.Token,body:JSON.parse(options.body)};
      calls.push(call);
      const data=await provider(call,calls.length);
      return {ok:true,json:async()=>({data})};
    },
  });
  const id="10000000-0000-4000-8000-000000000001",org="20000000-0000-4000-8000-000000000001";
  const install=(connection=id,token="token-a",organization=org,ready=true)=>
    sessions.set(connection,{organization_id:organization,token,ready});
  install();
  return {...api,calls,install,id,org,download:(overrides={})=>api.operate({
    action:"download_media",connection_id:id,organization_id:org,media_type:"audio",media_mime:"audio/ogg",
    download_url:"https://mmg.whatsapp.net/v/example?token=original",media_key:"key-a",
    file_sha256:"sha-a",file_enc_sha256:"enc-a",file_length:12,...overrides,
  })};
}

test("media download burst shares only pending provider work and retains no completed media",async()=>{
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const h=await mediaHarness(async()=>{await gate;return {Data:"data:audio/ogg;base64,Y W J j\n"};});
  const requests=Array.from({length:20},()=>h.download());
  await new Promise(resolve=>setImmediate(resolve));
  const count=h.calls.length;
  release();
  const results=await Promise.all(requests);
  assert.equal(count,1,"20 simultaneous downloads must use one provider request");
  assert.ok(results.every(result=>result.ok===true&&result.base64==="YWJj"));
  assert.equal(h.pending().size,0,"fulfilled media must not remain in bridge tracking");
  await h.download();
  assert.equal(h.calls.length,2,"later requests must re-download instead of caching media bytes");
});

test("media singleflight separates every normalized provider field and session scope",async()=>{
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const h=await mediaHarness(async()=>{await gate;return {Data:"YWJj"};});
  const requests=[h.download(),h.download({file_length:"12"})];
  const variants=[{media_key:"key-b"},{file_sha256:"sha-b"},{file_enc_sha256:"enc-b"},
    {media_mime:"audio/mpeg"},{file_length:13},{download_url:"https://mmg.whatsapp.net/v/example?token=other"},
    {download_url:"https://media.fbcdn.net/v/example?token=original"},{media_type:"file"}];
  requests.push(...variants.map(fields=>h.download(fields)));
  await new Promise(resolve=>setImmediate(resolve));
  h.install(h.id,"token-b");
  requests.push(h.download());
  await new Promise(resolve=>setImmediate(resolve));
  const otherOrg="20000000-0000-4000-8000-000000000002";
  await assert.rejects(h.download({organization_id:otherOrg}),/session_mismatch/);
  h.install(h.id,"token-b",otherOrg);
  requests.push(h.download({organization_id:otherOrg}));
  const otherId="10000000-0000-4000-8000-000000000002";
  h.install(otherId,"token-b",otherOrg);
  requests.push(h.download({connection_id:otherId,organization_id:otherOrg}));
  await new Promise(resolve=>setImmediate(resolve));
  const count=h.calls.length;
  release();
  await Promise.all(requests);
  assert.equal(count,12,"normalized length can share; every distinct payload/session must stay separate");
  assert.equal(h.pending().size,0);
});

test("media validation and session readiness run before joining pending downloads",async()=>{
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const h=await mediaHarness(async()=>{await gate;return {Data:"YWJj"};});
  const request=h.download();
  await new Promise(resolve=>setImmediate(resolve));
  for(const fields of [
    {download_url:"https://evil.example/v/example"},{download_url:"https://mmg.whatsapp.net:444/v/example"},
    {download_url:"https://mmg.whatsapp.net/v/example#fragment"},{download_url:"https://mmg.whatsapp.net/not-media"},
    {media_key:""},{file_length:6*1048576},
  ])await assert.rejects(h.download(fields),/bad_request/);
  h.install(h.id,"token-a",h.org,false);
  await assert.rejects(h.download(),/session_not_ready/);
  release();
  await request;
  assert.equal(h.calls.length,1);
});

test("failed or invalid media responses release shared pending work for a fresh retry",async()=>{
  for(const fail of [()=>{throw new Error("provider_error");},()=>({Data:"invalid!"})]){
    let release;
    const gate=new Promise(resolve=>{release=resolve;});
    const h=await mediaHarness(async(_call,number)=>{
      if(number===1){await gate;return fail();}
      return {Data:"YWJj"};
    });
    const requests=Promise.allSettled([h.download(),h.download()]);
    await new Promise(resolve=>setImmediate(resolve));
    release();
    const results=await requests;
    assert.ok(results.every(result=>result.status==="rejected"));
    assert.equal(h.calls.length,1);
    assert.equal(h.pending().size,0);
    assert.deepEqual(await h.download(),{ok:true,base64:"YWJj"});
    assert.equal(h.calls.length,2);
  }
});

test("pending media tracking is bounded without rejecting legitimate overflow downloads",async()=>{
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const h=await mediaHarness(async()=>{await gate;return {Data:"YWJj"};});
  const requests=Array.from({length:140},(_,i)=>h.download({media_key:"key-"+i}));
  await new Promise(resolve=>setImmediate(resolve));
  requests.push(h.download({media_key:"key-0"}));
  await new Promise(resolve=>setImmediate(resolve));
  const count=h.calls.length,pending=h.pending();
  const keys=pending?[...pending.keys()]:[];
  release();
  await Promise.all(requests);
  assert.equal(count,140,"overflow must keep existing pending requests joinable");
  assert.equal(keys.length,128,"overflow bypasses tracking, without evicting in-flight owners");
  assert.ok(keys.every(key=>/^[a-f0-9]{64}$/.test(key)),"tracking retains digest keys only");
  assert.equal(h.pending().size,0);
});

// Execute the production dispatcher and provider adapter without opening a
// listening socket or touching real session files/provider credentials.
async function contactHarness(provider) {
  let now = 1000000;
  const sessions = new Map();
  const calls = [];
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const source = bridge.replace(/^import .*;\r?\n/gm, "").split("createServer(async (req, res) => {")[0];
  const api = await new AsyncFunction("deps", `
    const {process,mkdir,readFile,join,createHash,fetch,Date}=deps;
    ${source}
    return {operate, contactsCache};
  `)({
    process:{env:{UNION_WUZAPI_BRIDGE_SECRET:"s".repeat(32),WUZAPI_ADMIN_TOKEN:"a".repeat(16)}},
    mkdir:async()=>{}, join, createHash,
    readFile:async path => {
      const id = path.match(/([a-f0-9-]{36})\.json$/)?.[1];
      if (!sessions.has(id)) throw Object.assign(new Error("missing"),{code:"ENOENT"});
      return JSON.stringify(sessions.get(id));
    },
    Date:{now:()=>now},
    fetch:async (url,options) => {
      assert.equal(url,"http://127.0.0.1:18080/user/contacts");
      calls.push(options.headers.Token);
      const data = await provider(options.headers.Token,calls.length);
      return {ok:true,json:async()=>({data})};
    },
  });
  const org = "20000000-0000-4000-8000-000000000001";
  const id = "10000000-0000-4000-8000-000000000001";
  const jid = "5511999999999@s.whatsapp.net";
  const install = (connection=id,token="token-a",organization=org) =>
    sessions.set(connection,{organization_id:organization,token,ready:true});
  install();
  return {...api,calls,install,id,org,jid,advance:ms=>{now+=ms;},
    lookup:(overrides={})=>api.operate({action:"contact_lookup",connection_id:id,organization_id:org,chat_jid:jid,...overrides})};
}

test("contact directory burst shares one provider fetch across different recipients", async()=>{
  let release;
  const gate = new Promise(resolve=>{release=resolve;});
  const h = await contactHarness(async()=>{await gate;return {
    "5511999999999@s.whatsapp.net":{FullName:" Saved ",PushName:"Wrong",BusinessName:"Business"},
    "5511888888888@lid":{FirstName:" First ",PushName:"Wrong"},
  };});
  const requests = Array.from({length:20},(_,i)=>h.lookup(i%2?{chat_jid:"5511888888888@lid"}:{}));
  await new Promise(resolve=>setImmediate(resolve));
  release();
  const results = await Promise.all(requests);
  assert.equal(h.calls.length,1,"20 concurrent lookups must download one directory");
  assert.deepEqual(results[0],{ok:true,name:"Saved",source:"saved"});
  assert.deepEqual(results[1],{ok:true,name:"First",source:"saved"});
  await h.lookup();
  assert.equal(h.calls.length,1);
});

test("contact directory cache isolates tenant and rotated token, including overlapping responses", async()=>{
  let release;
  const gate = new Promise(resolve=>{release=resolve;});
  const h = await contactHarness(async token=>{
    if(token==="token-a")await gate;
    return {"5511999999999@s.whatsapp.net":{PushName:token}};
  });
  const old = h.lookup();
  await new Promise(resolve=>setImmediate(resolve));
  h.install(h.id,"token-b");
  const fresh = await h.lookup();
  assert.equal(fresh.name,"token-b");
  release();
  assert.equal((await old).name,"token-a");
  assert.equal((await h.lookup()).name,"token-b");
  assert.equal(h.calls.length,2);
  const otherOrg = "20000000-0000-4000-8000-000000000002";
  await assert.rejects(h.lookup({organization_id:otherOrg}),/session_mismatch/);
  h.install(h.id,"token-b",otherOrg);
  await h.lookup({organization_id:otherOrg});
  assert.equal(h.calls.length,3);
  assert.ok([...h.contactsCache.keys()].every(key=>!key.includes("token-")),"keys must not retain raw credentials");
});

test("failed contact directory fetch is shared only while pending and retried afterwards", async()=>{
  let release;
  const gate = new Promise(resolve=>{release=resolve;});
  const h = await contactHarness(async (_token,number)=>{
    if(number===1){await gate;throw new Error("provider_error");}
    return {};
  });
  const results = Promise.allSettled([h.lookup(),h.lookup()]);
  await new Promise(resolve=>setImmediate(resolve));
  release();
  assert.ok((await results).every(result=>result.status==="rejected"));
  assert.equal(h.calls.length,1);
  assert.deepEqual(await h.lookup(),{ok:true,name:null,source:null});
  assert.equal(h.calls.length,2);
});

test("contact directory expires after five minutes and evicts old directories by capacity", async()=>{
  const h = await contactHarness(async()=>({"5511999999999@s.whatsapp.net":{PushName:"Push",BusinessName:"Business"}}));
  assert.equal((await h.lookup()).name,"Push");
  h.advance(299999);
  await h.lookup();
  assert.equal(h.calls.length,1);
  h.advance(1);
  await h.lookup();
  assert.equal(h.calls.length,2);
  for(let i=2;i<=80;i++){
    const connection="10000000-0000-4000-8000-"+String(i).padStart(12,"0");
    h.install(connection);
    await h.lookup({connection_id:connection});
  }
  const before = h.calls.length;
  await h.lookup();
  assert.equal(h.calls.length,before+1,"oldest directory is evicted");
  h.advance(300000);
  await h.lookup();
  assert.equal(h.contactsCache.size,1,"expired directories are removed on access");
});

test("large contact directories respect a retained-memory budget and retain name precedence", async()=>{
  const directory = Object.fromEntries(Array.from({length:7000},(_,i)=>[
    String(5511000000000+i)+"@s.whatsapp.net",{FullName:"N".repeat(160),FirstName:"F".repeat(160),PushName:"P".repeat(160),BusinessName:"B".repeat(160),Unneeded:"X".repeat(1000)},
  ]));
  directory["5511999999999@s.whatsapp.net"]={BusinessName:"Business"};
  const h = await contactHarness(async()=>directory);
  assert.deepEqual(await h.lookup(),{ok:true,name:"Business",source:"push"});
  await h.lookup();
  assert.equal(h.calls.length,2,"a directory over budget must be returned without retention");
  assert.equal(h.contactsCache.size,0);
});

test("contact directory memory budget evicts large completed entries while keeping recent hits", async()=>{
  const directory = Object.fromEntries(Array.from({length:2000},(_,i)=>[
    String(5511000000000+i)+"@s.whatsapp.net",{FullName:"N".repeat(160),FirstName:"F".repeat(160),PushName:"P".repeat(160),BusinessName:"B".repeat(160)},
  ]));
  const h = await contactHarness(async()=>directory);
  await h.lookup();
  for(let i=2;i<=4;i++){
    const connection="10000000-0000-4000-8000-"+String(i).padStart(12,"0");
    h.install(connection);
    await h.lookup({connection_id:connection});
  }
  assert.equal(h.calls.length,4);
  const latest="10000000-0000-4000-8000-000000000004";
  await h.lookup({connection_id:latest});
  assert.equal(h.calls.length,4,"recent directory remains cached");
  await h.lookup();
  assert.equal(h.calls.length,5,"byte pressure evicts before reaching entry capacity");
});

test("cached contact normalization preserves missing, hidden, push and saved-name results", async()=>{
  const contacts = {
    "5511999999999@s.whatsapp.net":{Found:false,FullName:"Hidden"},
    "5511888888888@s.whatsapp.net":{FullName:" ",FirstName:"First",PushName:"Push",BusinessName:"Business"},
    "5511777777777@s.whatsapp.net":{PushName:" Push ",BusinessName:"Business"},
    "5511666666666@s.whatsapp.net":{FullName:" N".repeat(170)},
  };
  const h = await contactHarness(async()=>contacts);
  assert.deepEqual(await h.lookup(),{ok:true,name:null,source:null});
  assert.deepEqual(await h.lookup(),{ok:true,name:null,source:null});
  assert.deepEqual(await h.lookup({chat_jid:"5511888888888@s.whatsapp.net"}),{ok:true,name:"First",source:"saved"});
  assert.deepEqual(await h.lookup({chat_jid:"5511777777777@s.whatsapp.net"}),{ok:true,name:"Push",source:"push"});
  assert.equal((await h.lookup({chat_jid:"5511666666666@s.whatsapp.net"})).name.length,160);
  assert.deepEqual(await h.lookup({chat_jid:"5511555555555@s.whatsapp.net"}),{ok:true,name:null,source:null});
  await assert.rejects(h.lookup({chat_jid:"invalid"}),/bad_request/);
  assert.equal(h.calls.length,1);
});

test("cached short names do not retain a huge provider string backing store",()=>{
  const script = `
    import assert from "node:assert/strict";
    import {createHash} from "node:crypto";
    import {join} from "node:path";
    const bridge=${JSON.stringify(bridge)};
    ${contactHarness.toString()}
    const h=await contactHarness(async()=>({
      "5511999999999@s.whatsapp.net":{FullName:"N".repeat(24*1024*1024)+"!"},
    }));
    global.gc();
    const baseline=process.memoryUsage().heapUsed;
    await h.lookup();
    // Let the completed request release its raw directory and promise result.
    await new Promise(resolve=>setImmediate(resolve));
    for(let i=0;i<3;i++)global.gc();
    const retained=process.memoryUsage().heapUsed-baseline;
    assert.equal((await h.lookup()).name,"N".repeat(160));
    assert.equal(h.calls.length,1);
    console.log(JSON.stringify({retained}));
  `;
  const child=spawnSync(process.execPath,["--expose-gc","--input-type=module"],{
    input:script,encoding:"utf8",timeout:15000,maxBuffer:1000000,
  });
  assert.equal(child.status,0,child.stderr);
  const {retained}=JSON.parse(child.stdout.trim());
  assert.ok(retained<8*1024*1024,`one cached 160-character name retained ${retained} bytes`);
});

test("detached cached names preserve a lone surrogate at the UTF-16 truncation boundary",async()=>{
  const h=await contactHarness(async()=>({
    "5511999999999@s.whatsapp.net":{FullName:"A".repeat(159)+"\ud800"+"Z".repeat(1000000)},
  }));
  const expected="A".repeat(159)+"\ud800";
  assert.equal((await h.lookup()).name,expected);
  assert.equal((await h.lookup()).name,expected);
  assert.equal(h.calls.length,1);
});

test("WuzAPI sends an ordinary playable MP3 attachment, never a PTT voice note", () => {
  assert.match(bridge, /const toPlayableAudio = async input =>/);
  assert.match(bridge, /"-c:a","libmp3lame","-b:a","96k"/);
  assert.match(bridge, /const seconds=inspectMp3\(bytes\)/);
  assert.match(bridge, /outgoingMime=audio\?"audio\/mpeg":mime/);
  assert.match(bridge, /MimeType:"audio\/mpeg",PTT:false,Seconds:audio\.seconds/);
  assert.doesNotMatch(bridge, /PTT:true|audio\/ogg; codecs=opus/);
  assert.match(bridge, /media_too_large/);
  assert.match(bridge, /audio_conversion_failed/);
});

test("FFmpeg can encode a valid MP3 audio attachment from a browser-like recording", t => {
  const version = spawnSync("ffmpeg", ["-version"], { encoding:"utf8", timeout:5000 });
  if(version.error || version.status !== 0) return t.skip("FFmpeg unavailable on this runner");

  const input = spawnSync("ffmpeg", [
    "-hide_banner","-loglevel","error","-f","lavfi",
    "-i","sine=frequency=440:duration=1.5",
    "-ac","1","-c:a","libopus","-f","webm","pipe:1",
  ], { timeout:15000, maxBuffer:2_000_000 });
  if(input.status !== 0 || !input.stdout?.length) return t.skip("FFmpeg runner lacks WebM/Opus");

  const result = spawnSync("ffmpeg", [
    "-hide_banner","-loglevel","error","-nostdin","-i","pipe:0",
    "-map","0:a:0","-vn","-ac","1","-ar","44100",
    "-c:a","libmp3lame","-b:a","96k",
    "-id3v2_version","0","-write_xing","0","-f","mp3","pipe:1",
  ], { input:input.stdout, timeout:15000, maxBuffer:2_000_000 });
  if(result.status !== 0 || !result.stdout?.length) {
    assert.fail("MP3 conversion failed; verify FFmpeg has libmp3lame installed");
  }
  assert.equal(result.stdout[0],0xff,"MPEG audio frame sync starts the output");
  assert.equal(result.stdout[1] & 0xfe,0xfa,"Output contains MPEG1 Layer III frames");

  const probe=spawnSync("ffprobe",[
    "-v","error","-show_entries","stream=codec_name",
    "-of","default=noprint_wrappers=1:nokey=1","pipe:0",
  ],{input:result.stdout,timeout:8000,encoding:"utf8"});
  if(!probe.error) {
    assert.equal(probe.status,0);
    assert.match(probe.stdout,/mp3/);
  }
});


test("verified LID aliases reuse one directory fetch and never guess between conflicting names",async()=>{
  const pn="5511999999999@s.whatsapp.net";
  const alt="551199999999@s.whatsapp.net";
  const lid="123456789012@lid";
  const h=await contactHarness(async()=>({
    [pn]:{FullName:"Nome confirmado"},
    [alt]:{FullName:"Outro nome"},
  }));
  assert.deepEqual(await h.lookup({chat_jid:lid,body_text:JSON.stringify([pn])}),
    {ok:true,name:"Nome confirmado",source:"saved"});
  assert.deepEqual(await h.lookup({chat_jid:lid,body_text:JSON.stringify([pn,alt])}),
    {ok:true,name:null,source:null});
  assert.deepEqual(await h.lookup({chat_jid:lid,body_text:""}),
    {ok:true,name:null,source:null});
  assert.equal(h.calls.length,1);
});
