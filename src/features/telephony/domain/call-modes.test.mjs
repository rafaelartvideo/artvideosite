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
 const m=await load(); const value=await m.myCallMode(client({mode:'both',desired_mode:'receive_only',status:'pending',can_make_calls:true,can_receive_calls:true}),'org','endpoint');
 assert.equal(value.can_make_calls,true);assert.equal(value.desired_mode,'receive_only');
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
 for(const name of ['callEcho','callInternal','originateExternal']) assert.match(source,new RegExp(`const ${name} = [\\s\\S]*?if \\(!canMakeCalls\\)`));
 assert.match(source,/onReturnCall=\{rawPhone => \{\s*if \(!canMakeCalls\)/);
 assert.match(source,/const requestCall = [\s\S]*?if \(!canMakeCalls\)/);
 assert.match(source,/disabled=\{!canMakeCalls \|\| registration !== "registered"/);
 assert.match(source,/myCallMode\(/);assert.match(source,/30_000/);assert.match(source,/Só recebe/);
 await transformWithEsbuild(source,path,{loader:'tsx'});
 const ext=base+'presentation/UnionPbxExtensionsPage.tsx';const editor=readFileSync(ext,'utf8');
 assert.match(editor,/p?setExtensionCallMode\(/);assert.match(editor,/can_manage/);assert.match(editor,/applied_mode/);
 assert.match(editor,/policy\.status !== "failed"/);assert.match(editor,/Tentar novamente/);
 await transformWithEsbuild(editor,ext,{loader:'tsx'});
});
