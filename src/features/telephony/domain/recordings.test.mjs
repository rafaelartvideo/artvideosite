import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';
async function load() {
 const request = await transformWithEsbuild(readFileSync('src/features/telephony/application/pbx-request.ts','utf8'),'pbx-request.ts',{loader:'ts'});
 const source = readFileSync('src/features/telephony/application/recordings.ts','utf8').replace("'./pbx-request'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(request.code).toString('base64')));
 const built = await transformWithEsbuild(source,'recordings.ts',{loader:'ts'});
 return import('data:text/javascript;base64,'+Buffer.from(built.code).toString('base64'));
}
test('recording defaults are off and bounded; disabled drafts work offline',async()=>{
 const api=await load();const d=api.newRecordingPolicy();assert.equal(d.enabled,false);assert.equal(d.notice_enabled,true);
 assert.doesNotThrow(()=>api.validateRecordingPolicy(d,false,false,[]));
 for(const [field,values] of Object.entries({retention_days:[0,91,1.2],quota_bytes:[67108863,10737418241],max_duration_seconds:[299,7201]})) for(const value of values) assert.throws(()=>api.validateRecordingPolicy({...d,[field]:value},false,false,[]));
});
test('enable requires fresh capability, company acknowledgement and purpose but audible notice and consent are optional',async()=>{
 const api=await load();const d={...api.newRecordingPolicy(),enabled:true,scopes:['inbound'],purpose:'Atendimento',legal_basis:'contract',information_reference:'Política da empresa',notice_enabled:false};
 assert.doesNotThrow(()=>api.validateRecordingPolicy(d,true,true,[]));
 for(const patch of [{purpose:''},{legal_basis:null},{information_reference:''},{scopes:[]},{notice_enabled:true},{notice_enabled:true,notice_prompt_id:'other-company'}]) assert.throws(()=>api.validateRecordingPolicy({...d,...patch},true,true,[]));
 assert.throws(()=>api.validateRecordingPolicy(d,false,true,[]));assert.throws(()=>api.validateRecordingPolicy(d,true,false,[]));
 assert.doesNotThrow(()=>api.validateRecordingPolicy({...d,notice_enabled:true,notice_prompt_id:'own'},true,true,['own']));
});
test('save whitelists fields, binds organization and cannot enable after capability becomes unavailable',async()=>{
 const api=await load();const calls=[];let ready=false;
 const client={rpc(name,params){calls.push({name,params});return{abortSignal:async()=>({data:{runtime_ready:ready},error:null})}}};
 const scoped=api.createRecordingsApi(client,'own');const d={...api.newRecordingPolicy(),enabled:true,scopes:['internal'],purpose:'Quality',legal_basis:'legitimate_interest',information_reference:'Policy',notice_enabled:false,revision:'not-written',status:'applied'};
 await assert.rejects(scoped.save(d,true,[]));assert.equal(calls.length,1);ready=true;await scoped.save(d,true,[]);
 const saved=calls.at(-1);assert.equal(saved.params.p_organization_id,'own');assert.equal(saved.name,'pbx_save_recording_policy');assert.equal('revision' in saved.params.p_policy,false);assert.equal('status' in saved.params.p_policy,false);
});
test('playback bounds waits, aborts late responses, rejects foreign URLs and redacts server errors',async()=>{
 const api=await load();let resolve;const c=new AbortController();const calls=[];
 const client={functions:{invoke(name,options){calls.push({name,options});return new Promise(r=>resolve=r)}}};
 const pending=api.createRecordingsApi(client,'own',c.signal).playback('row','https://own.supabase.co');c.abort();resolve({data:{url:'https://own.supabase.co/storage/v1/object/sign/pbx-call-recordings/file?token=secret'},error:null});await assert.rejects(pending);
 assert.equal(calls[0].name,'union-pbx-recording-access');assert.deepEqual(calls[0].options.body,{recording_id:'row'});assert.ok(calls[0].options.signal.aborted);
 for(const result of [{data:{url:'https://foreign.example/file?token=secret'}},{error:{message:'token=secret'}}]) await assert.rejects(api.createRecordingsApi({functions:{invoke:async()=>result}},'own').playback('row','https://own.supabase.co'),e=>!e.message.includes('secret'));
});
test('recordings UI parses and keeps policy, playback permissions and tenant lifecycle separate',async()=>{
 const page=readFileSync('src/features/telephony/presentation/UnionPbxRecordingsPage.tsx','utf8');await transformWithEsbuild(page,'UnionPbxRecordingsPage.tsx',{loader:'tsx'});
 assert.match(page,/hasPermission\('pbx.recordings.manage'\)/);assert.match(page,/hasPermission\('pbx.recordings.view'\)/);assert.doesNotMatch(page,/hasPermission\('pbx.manage'\)/);
 assert.match(page,/key=\{`\$\{activeOrganizationId\}/);assert.match(page,/controller\.abort\(\); scope\.current = null;/);assert.match(page,/media\.pause\(\)/);assert.match(page,/audio\.current\.pause\(\)/);assert.match(page,/removeAttribute\('src'\)/);assert.doesNotMatch(page,/autoPlay|\.storage\./);
 const app=readFileSync('src/app/Admin.tsx','utf8');assert.match(app,/route.subpage === "gravacoes"/);assert.match(app,/canAccessPbxRecordings \? <UnionPbxRecordingsPage/);
 const phone=readFileSync('src/features/telephony/presentation/UnionPbxToolPage.tsx','utf8');assert.match(phone,/section === "gravacoes"\) onRecordings\?\.\(\)/);assert.match(phone,/canRecordings=\{Boolean\(onRecordings\)\}/);assert.equal((app.match(/<UnionPbxToolPage/g)||[]).length,1);
 assert.match(app,/const canAccessPbxModule = canAccessPbxTool \|\|/);
 assert.match(app,/isPageOpen=\{activeTab === "tools" && route.resourceId === "union-pbx"\}/);
 assert.match(app,/\{canAccessPbxTool && user\?\.id && activeOrganizationId &&/);
});
