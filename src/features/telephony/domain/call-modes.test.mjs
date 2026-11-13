import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync,readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';
const base='src/features/telephony/';
async function load(){
 const path=base+'application/call-modes.ts'; assert.ok(existsSync(path),'call-mode helpers exist');
 const dependency=await transformWithEsbuild(readFileSync(base+'application/pbx-request.ts','utf8'),'request.ts',{loader:'ts'});
 const source=readFileSync(path,'utf8').replace(/from ['"]\.\/pbx-request['"]/g,`from 'data:text/javascript;base64,${Buffer.from(dependency.code).toString('base64')}'`);
 const {code}=await transformWithEsbuild(source,path,{loader:'ts'});return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
function client(data,error=null){return {rpc(name,args){return {abortSignal(signal){return Promise.resolve({data,error});}}}};}
test('applied permission wins over a pending desired mode and bindings cannot cross tenants',async()=>{
 const m=await load(); const value=await m.myCallMode(client({internal_mode:'both',external_mode:'receive_only',desired_internal_mode:'receive_only',desired_external_mode:'make_only',mode:'both',desired_mode:'receive_only',status:'pending',can_make_calls:true,can_receive_calls:true}),'org','endpoint');
 assert.equal(m.canOriginate(value,'internal'),true);assert.equal(m.canOriginate(value,'external'),false);assert.equal(value.desired_mode,'receive_only');
 assert.equal(m.boundCallMode('other','endpoint',{organizationId:'org',endpoint:'endpoint',value}),null);
 assert.equal(m.boundCallMode('org','other',{organizationId:'org',endpoint:'endpoint',value}),null);
 assert.equal(m.boundCallMode('org','endpoint',{organizationId:'org',endpoint:'endpoint',value}),value);
});
test('invalid arguments never send a request and backend errors stay generic',async()=>{
 const m=await load();let sent=0;const c={rpc(){sent++;throw Error('secret')}};
 await assert.rejects(m.setExtensionCallMode(c,'org','ext','bad',0),/inválid/i);
 await assert.rejects(m.setExtensionCallMode(c,'org','ext','both',-1),/inválid/i);
 await assert.rejects(m.myCallMode(c,'','endpoint'),/inválid/i);assert.equal(sent,0);
 await assert.rejects(m.myCallMode(client(null,{message:'secret'}),'org','endpoint'),e=>!e.message.includes('secret'));
 await assert.rejects(m.listExtensionCallModes(client([{organization_id:'foreign'}]),'org'),/confirm/i);
});
test('call-mode query is bounded and respects cancellation',async()=>{
 const m=await load();let signal;const c={rpc(){return {abortSignal(s){signal=s;return new Promise(()=>{});}}}};
 await assert.rejects(m.myCallMode(c,'org','endpoint',{timeoutMs:5}),/confirm/i);assert.equal(signal.aborted,true);
 const controller=new AbortController();controller.abort();await assert.rejects(m.myCallMode(c,'org','endpoint',{signal:controller.signal}),/confirm/i);
});
test('all browser origination paths guard applied mode without changing incoming controls',async()=>{
 const path=base+'presentation/UnionPbxToolPage.tsx',source=readFileSync(path,'utf8');
 for(const name of ['callEcho','callInternal']) assert.match(source,new RegExp(`const ${name} = [\\s\\S]*?if \\(!canMakeInternalCalls\\)`));
 assert.match(source,/const originateExternal = [\s\S]*?if \(!canMakeExternalCalls\)/);
 assert.match(source,/internal \? canMakeInternalCalls : canMakeExternalCalls/);
 assert.match(source,/const requestCall = [\s\S]*?if \(!canMakeExternalCalls\)/);
 assert.match(source,/disabled=\{!canMakeExternalCalls \|\| registration !== "registered"/);
 assert.match(source,/myCallMode\(/);assert.match(source,/30_000/);assert.match(source,/Só recebe/);
 await transformWithEsbuild(source,path,{loader:'tsx'});
 const ext=base+'presentation/UnionPbxExtensionsPage.tsx';const editor=readFileSync(ext,'utf8');
 assert.match(editor,/p?setExtensionCallMode\(/);assert.match(editor,/can_manage/);assert.match(editor,/applied_\$\{scope\}_mode/);assert.match(editor,/Chamadas internas/);assert.match(editor,/Chamadas externas/);
 assert.match(editor,/policy\.status !== "failed"/);assert.match(editor,/Tentar novamente/);
 await transformWithEsbuild(editor,ext,{loader:'tsx'});
});

test('all nine internal/external combinations remain independent and save atomically',async()=>{
 const m=await load();
 for(const internal_mode of ['both','receive_only','make_only']) for(const external_mode of ['both','receive_only','make_only']){
  const value=await m.myCallMode(client({internal_mode,external_mode,desired_internal_mode:internal_mode,desired_external_mode:external_mode,status:'applied'}),'org','endpoint');
  assert.equal(m.canOriginate(value,'internal'),internal_mode!=='receive_only');
  assert.equal(m.canOriginate(value,'external'),external_mode!=='receive_only');
  let sent;const c={rpc(name,args){sent={name,args};return {abortSignal(){return Promise.resolve({data:9,error:null});}}}};
  await m.setExtensionCallMode(c,'org','ext',{internal_mode,external_mode},8);
  assert.deepEqual(sent,{name:'pbx_set_extension_call_modes_v2',args:{p_organization_id:'org',p_extension_id:'ext',p_internal_mode:internal_mode,p_external_mode:external_mode,p_expected_revision:8}});
 }
});
