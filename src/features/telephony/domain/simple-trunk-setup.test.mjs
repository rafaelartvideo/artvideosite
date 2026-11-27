import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformWithEsbuild} from 'vite';
import {spawnSync} from 'node:child_process';
const sourcePath='src/features/telephony/domain/simple-trunk-setup.ts';
const org='11111111-1111-4111-8111-111111111111';const extension='22222222-2222-4222-8222-222222222222';
const empty=()=>({schema_version:1,routing_enabled:false,...Object.fromEntries(['providers','contracts','connections','trunks','capacity_pools','dids','groups','outbound_routes'].map(key=>[key,[]]))});
async function model(){const code=await transformWithEsbuild(readFileSync(sourcePath,'utf8').replace(/^import type .*;$/gm,''),sourcePath,{loader:'ts'});return import('data:text/javascript;base64,'+Buffer.from(code.code).toString('base64'));}
function idFactory(){let i=10;return()=>`33333333-3333-4333-8333-${String(i++).padStart(12,'0')}`;}
const input=()=>({name:'Linha comercial',host:'sip.example.com',username:'101',extensionIds:[extension],contractLimit:3});
test('one simple form builds the existing graph without secret or automatic activation',async()=>{const m=await model();const original=empty();const {document,connectionId}=m.prepareSimpleTrunk(original,org,input(),[extension],idFactory());assert.equal(original.connections.length,0);assert.equal(document.routing_enabled,false);for(const key of ['providers','contracts','connections','trunks','groups','outbound_routes'])assert.equal(document[key].length,1,key);assert.equal(document.connections[0].id,connectionId);assert.equal(document.connections[0].auth_mode,'registration');assert.equal(document.connections[0].port,5060);assert.equal(document.connections[0].inbound_enabled,false);assert.deepEqual(document.groups[0].extension_ids,[extension]);assert.equal(document.capacity_pools.length,6);assert.ok(document.capacity_pools.every(pool=>pool.shared_limit===3&&pool.confidence==='contract'));assert.doesNotMatch(JSON.stringify(document),/password|secret/);
const result=spawnSync(process.platform==='win32'?'python':'python3',['-c',"import sys,json;sys.path.insert(0,'scripts/union-pbx-agent');from universal_telephony import validate_document;v=json.load(sys.stdin);validate_document(v['document'],v['org'])"],{input:JSON.stringify({org,document}),encoding:'utf8'});assert.equal(result.status,0,result.stderr);});
test('unknown entitlement remains unknown at all levels',async()=>{const m=await model();const {document}=m.prepareSimpleTrunk(empty(),org,{...input(),contractLimit:null},[extension],idFactory());assert.ok(document.capacity_pools.every(pool=>pool.shared_limit===null&&pool.confidence==='unknown'));assert.equal(document.routing_enabled,false);});
test('second account reuses compatible contract and authorizations without raising any upper limit',async()=>{const m=await model();const ids=idFactory();const first=m.prepareSimpleTrunk(empty(),org,{...input(),contractLimit:1},[extension],ids).document;const before=structuredClone(first);const second=m.prepareSimpleTrunk(first,org,{...input(),username:'102',contractLimit:10},[extension],ids).document;assert.deepEqual(first,before);assert.equal(second.providers.length,1);assert.equal(second.contracts.length,1);assert.equal(second.groups.length,1);assert.equal(second.outbound_routes.length,1);assert.equal(second.groups[0].members.length,2);assert.deepEqual(second.groups[0].extension_ids,[extension]);for(const pool of first.capacity_pools)assert.deepEqual(second.capacity_pools.find(row=>row.id===pool.id),pool);});
test('unsafe and ambiguous quick setups are refused rather than overriding configuration',async()=>{const m=await model();for(const change of [{host:'sip.example.com;evil=yes'},{extensionIds:['foreign']},{extensionIds:[]},{contractLimit:0},{contractLimit:1.5},{contractLimit:10001}])assert.throws(()=>m.prepareSimpleTrunk(empty(),org,{...input(),...change},[extension],idFactory()));assert.throws(()=>m.prepareSimpleTrunk({...empty(),routing_enabled:true},org,input(),[extension],idFactory()),/Desative/);const ids=idFactory();const doc=m.prepareSimpleTrunk(empty(),org,input(),[extension],ids).document;assert.throws(()=>m.prepareSimpleTrunk(doc,org,{...input(),username:'101'},[extension],ids),/já/);assert.throws(()=>m.prepareSimpleTrunk(doc,org,{...input(),username:'102',referenceConnectionId:'foreign'},[extension],ids));});
test('simple setup is the default and the technical wizard is opt-in',async()=>{const ui=readFileSync('src/features/telephony/presentation/UnionPbxUniversalTelephony.tsx','utf8');assert.match(ui,/\[advanced,setAdvanced\]=useState\(false\)/);assert.match(ui,/UnionPbxSimpleTrunkSetup/);assert.match(ui,/Configuração avançada/);assert.match(ui,/advanced&&/);const form=readFileSync('src/features/telephony/presentation/UnionPbxSimpleTrunkSetup.tsx','utf8');assert.match(form,/Servidor SIP/);assert.match(form,/Usuário SIP/);assert.match(form,/Senha SIP/);assert.match(form,/setPassword\(''\)/);assert.match(form,/confirmed/);assert.doesNotMatch(form,/localStorage|sessionStorage|console\./);assert.ok((await transformWithEsbuild(form,'simple.tsx',{loader:'tsx',jsx:'automatic'})).code);});


test('custom and conflicting destination rules are preserved and require advanced setup',async()=>{const m=await model();const ids=idFactory();const doc=m.prepareSimpleTrunk(empty(),org,input(),[extension],ids).document;doc.outbound_routes[0].destination_pattern='e164_prefix';doc.outbound_routes[0].prefix='55';const before=structuredClone(doc);assert.throws(()=>m.prepareSimpleTrunk(doc,org,{...input(),username:'102'},[extension],ids),/Avançado/);assert.deepEqual(doc,before);});

test('simple screen renders credentials and authorizations without the nine-step wizard',async()=>{
 const React=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');const m=await model();
 const source=readFileSync('src/features/telephony/presentation/UnionPbxSimpleTrunkSetup.tsx','utf8').replace(/^import .*;$/gm,'');const compiled=await transformWithEsbuild(source,'simple-render.tsx',{loader:'tsx',jsx:'transform',jsxFactory:'React.createElement'});
 const make=new Function('React','useRef','useState','Eye','EyeOff','AdminButton','FInput','prepareSimpleTrunk','prepareSimpleTrunkEdit','SimpleTrunkSetupError',compiled.code.replace(/^export /gm,'')+'\nreturn UnionPbxSimpleTrunkSetup;');
 const Button=({children,variant,...props})=>React.createElement('button',props,children);const Input=({label,hint,...props})=>React.createElement('label',null,label,React.createElement('input',props));
 const Form=make(React,React.useRef,React.useState,()=>React.createElement('svg'),()=>React.createElement('svg'),Button,Input,m.prepareSimpleTrunk,m.prepareSimpleTrunkEdit,m.SimpleTrunkSetupError);
 const html=renderToStaticMarkup(React.createElement(Form,{organizationId:org,document:empty(),extensions:[{id:extension,label:'Ramal 301'}],disabled:false,onSave:async()=>true,onAdvanced(){}}));
 for(const text of ['Servidor SIP','Usuário SIP','Senha SIP','Ramal 301','Salvar linha'])assert.ok(html.includes(text),text);assert.doesNotMatch(html,/Etapa 1 de 9|Conferir e ativar/);assert.match(html,/type="password"/);
});

test('editing SIP credentials preserves routing graph and connection identity',async()=>{
 const m=await model();const ids=idFactory();const first=m.prepareSimpleTrunk(empty(),org,input(),[extension],ids);
 const original=m.prepareSimpleTrunk(first.document,org,{...input(),username:'102'},[extension],ids).document;
 const before=structuredClone(original);
 const same=m.prepareSimpleTrunkEdit(original,first.connectionId,{...input(),port:5060,transport:'udp'});
 assert.deepEqual(same.document,original);assert.equal(same.identityChanged,false);
 const edited=m.prepareSimpleTrunkEdit(original,first.connectionId,{name:'New name',host:'sip.example.com',username:'103',port:5061,transport:'tls'});
 assert.equal(edited.connectionId,first.connectionId);assert.equal(edited.identityChanged,true);assert.equal(edited.document.connections[0].username,'103');assert.equal(edited.document.connections[0].port,5061);
 assert.deepEqual(edited.document.connections[1],before.connections[1]);
 for(const key of ['providers','contracts','trunks','capacity_pools','dids','groups','outbound_routes'])assert.deepEqual(edited.document[key],before[key],key);
 assert.deepEqual(original,before);
 assert.throws(()=>m.prepareSimpleTrunkEdit(original,first.connectionId,{...input(),username:'102'}),/outra linha/);
 assert.throws(()=>m.prepareSimpleTrunkEdit({...original,routing_enabled:true},first.connectionId,input()),/Desative/);
 assert.throws(()=>m.prepareSimpleTrunkEdit(original,'foreign',input()),/indisponível/);
 assert.throws(()=>m.prepareSimpleTrunkEdit(original,first.connectionId,{...input(),host:'bad;host'}),/Confira/);
 const source=readFileSync('src/features/telephony/presentation/UnionPbxSimpleTrunkSetup.tsx','utf8');
 assert.ok(source.includes('Nova senha SIP'));assert.ok(source.includes('password?{[prepared.connectionId]:password}:{}'));assert.ok(source.includes('setPassword(\'\')'));
});

test('SIP password visibility is local, masked by default and reset after editing',async()=>{
 for(const path of ['src/features/telephony/presentation/UnionPbxSimpleTrunkSetup.tsx','src/features/telephony/presentation/UnionPbxUniversalTelephony.tsx']){
  const source=readFileSync(path,'utf8');
  assert.match(source,/const \[showPassword,setShowPassword\]=useState\(false\)/);
  assert.match(source,/type=\{showPassword\?"text":"password"\}/);
  assert.match(source,/onClick=\{\(\)=>setShowPassword\(value=>!value\)\}/);
  assert.match(source,/setPassword\(''\);setShowPassword\(false\)/);
  assert.match(source,/aria-label=\{showPassword\?"Ocultar senha":"Mostrar senha"\}/);
  assert.ok((await transformWithEsbuild(source,path,{loader:'tsx',jsx:'automatic'})).code);
 }
});

test('provider-issued short SIP passwords are supported without weakening config safety',()=>{
 const source=readFileSync('src/features/telephony/application/universal-telephony.ts','utf8');
 assert.match(source,/invalid_credential/);
 assert.match(source,/\{1,256\}/);
 assert.match(source,/SIP credential format unsupported/);
 const ui=readFileSync('src/features/telephony/presentation/UnionPbxUniversalTelephony.tsx','utf8');
 assert.match(ui,/failure.code==='invalid_credential'\)\{lock.current=false;\}/);
});
