import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';

async function fixture({authenticated=true,allowed=true,remainingSeconds=300}={}) {
 const calls=[]; let handler;
 globalThis.__recordingAccessClient=(_url,key)=>key==='anon'?{
  auth:{getUser:async()=>({data:{user:authenticated?{id:crypto.randomUUID()}:null},error:authenticated?null:{}})},
  rpc:async(name,args)=>{calls.push({name,args});return {data:allowed?{path:'00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.wav',expires_at:new Date(Date.now()+remainingSeconds*1000).toISOString()}:null};},
 }:{storage:{from:bucket=>({createSignedUrl:async(path,seconds)=>{calls.push({bucket,path,seconds});return {data:{signedUrl:'https://test.supabase.co/storage/v1/object/sign/'+bucket+'/'+path+'?token=private'}};}})}};
 globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'}[name])},serve:fn=>{handler=fn;}};
 const file='supabase/functions/union-pbx-recording-access/index.ts';
 const source=readFileSync(file,'utf8').replace(/^import .*createClient.*;$/m,'const createClient=globalThis.__recordingAccessClient;');
 const {code}=await transformWithEsbuild(source,file,{loader:'ts'});
 await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'#'+crypto.randomUUID());
 return {calls,send:()=>handler(new Request('https://test.supabase.co/functions/v1/union-pbx-recording-access',{method:'POST',headers:{Authorization:'Bearer signed-session','Content-Type':'application/json',Origin:'https://unionworld.com.br'},body:JSON.stringify({recording_id:'00000000-0000-4000-8000-000000000002'})}))};
}
test('private playback requires verified user session before checking recording rights',async()=>{
 const f=await fixture({authenticated:false});assert.equal((await f.send()).status,401);assert.deepEqual(f.calls,[]);
});
test('playback URL cannot outlive the configured retention expiry',async()=>{
 const f=await fixture({remainingSeconds:10});assert.equal((await f.send()).status,200);
 assert.ok(f.calls[1].seconds>=1&&f.calls[1].seconds<=8);
 const expired=await fixture({remainingSeconds:0});assert.equal((await expired.send()).status,403);
 assert.equal(expired.calls.some(x=>x.bucket),false);
});
test('forbidden or expired recording does not mint a storage URL',async()=>{
 const f=await fixture({allowed:false});assert.equal((await f.send()).status,403);assert.equal(f.calls.some(x=>x.bucket),false);
});
test('authorized playback mints exactly a sixty second private URL',async()=>{
 const f=await fixture();const response=await f.send();assert.equal(response.status,200);
 assert.deepEqual(f.calls[0],{name:'pbx_authorize_recording_playback',args:{p_recording_id:'00000000-0000-4000-8000-000000000002'}});
 assert.equal(f.calls[1].seconds,60);assert.equal(f.calls[1].bucket,'pbx-call-recordings');
 assert.equal(response.headers.get('Cache-Control'),'no-store');
});
