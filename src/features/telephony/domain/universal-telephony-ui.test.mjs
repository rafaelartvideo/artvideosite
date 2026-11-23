import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {transformWithEsbuild} from 'vite';
const app='src/features/telephony/application/universal-telephony.ts';
const ui='src/features/telephony/presentation/UnionPbxUniversalTelephony.tsx';
test('universal gateway and management workspace exist',()=>{assert.ok(existsSync(app));assert.ok(existsSync(ui));});
test('universal capacity never treats unknown as unlimited',async()=>{const source=readFileSync(app,'utf8');const compiled=await transformWithEsbuild(source.replace(/^import .*;$/gm,''),app,{loader:'ts'});const mod=await import('data:text/javascript;base64,'+Buffer.from(compiled.code).toString('base64'));assert.equal(mod.capacityLabel({confidence:'unknown',mode:'shared',shared_limit:8}),'Desconhecida');assert.equal(mod.capacityLabel({confidence:'contract',mode:'shared',shared_limit:8}),'8 compartilhadas');assert.equal(mod.emptyUniversalDocument().routing_enabled,false);});
test('universal UI parses with tenant and secret lifecycle guards',async()=>{const source=readFileSync(ui,'utf8');assert.ok((await transformWithEsbuild(source,ui,{loader:'tsx',jsx:'automatic'})).code);assert.match(source,/controller.abort/);assert.match(source,/setPassword\(''\)/);assert.match(source,/can_activate/);assert.doesNotMatch(source,/localStorage|sessionStorage|console\.|error.message/);assert.match(readFileSync('src/features/telephony/presentation/UnionPbxTrunksPage.tsx','utf8'),/UnionPbxUniversalTelephony/);});
test('gateway uses bounded RPCs, rejects tenant envelopes and never forwards secrets into the document',async()=>{
 const source=readFileSync(app,'utf8').replace(/^import .*;$/gm,'');
 const compiled=await transformWithEsbuild('const pbxRequest = globalThis.__universalRequest;\n'+source,app,{loader:'ts'});
 globalThis.__universalRequest=async(work,_label,options)=>work(options.signal);
 const mod=await import('data:text/javascript;base64,'+Buffer.from(compiled.code).toString('base64'));
 const organization='org-a';let response={data:{organization_id:organization,revision:0,document:mod.emptyUniversalDocument()},error:null};const calls=[];
 const client={rpc(name,args){calls.push({name,args});return {abortSignal(signal){calls.at(-1).signal=signal;return response;}};}};
 const controller=new AbortController();await mod.listUniversalTelephony(client,organization,controller.signal);assert.equal(calls[0].signal,controller.signal);assert.equal(calls[0].name,'pbx_list_universal_telephony');
 response={data:{organization_id:'org-b',revision:0,document:mod.emptyUniversalDocument()},error:null};await assert.rejects(()=>mod.listUniversalTelephony(client,organization));
 const doc=mod.emptyUniversalDocument();doc.connections=[{id:'connection-a'}];response={data:{},error:null};await mod.saveUniversalTelephony(client,organization,3,doc,{'connection-a':'fresh-secret'},controller.signal);assert.equal(calls.at(-1).args.p_expected_revision,3);assert.deepEqual(calls.at(-1).args.p_secrets,{'connection-a':'fresh-secret'});assert.equal(JSON.stringify(calls.at(-1).args.p_document).includes('fresh-secret'),false);
 await assert.rejects(()=>mod.saveUniversalTelephony(client,organization,3,doc,{'other-tenant':'bad'}));
 response={data:null,error:{message:'password=private'}};await assert.rejects(()=>mod.listUniversalTelephony(client,organization),error=>!error.message.includes('private'));
 delete globalThis.__universalRequest;
});

test('universal UI exposes DID source, scoped audit history and named destinations',async()=>{
 const source=readFileSync(ui,'utf8');
 assert.match(source,/did_source/);assert.match(source,/value="request_uri"/);assert.match(source,/value="to_header"/);
 assert.match(source,/data\?\.audit/);assert.match(source,/entry\.revision/);assert.match(source,/entry\.created_at/);assert.match(source,/actors\[entry\.actor_id\]/);
 assert.match(source,/from\('organization_members'\)/);assert.match(source,/\.eq\('organization_id',organizationId\)/);
 assert.doesNotMatch(source,/\$\{item\.destination_id\}/);assert.match(source,/Destino indisponível/);
 assert.ok((await transformWithEsbuild(source,ui,{loader:'tsx',jsx:'automatic'})).code);
});

test('configuration examples use accepted provider units and numeric route prefixes',()=>{const source=readFileSync(ui,'utf8');assert.match(source,/BRL_centavos_minuto/);assert.match(source,/somente dígitos/);assert.doesNotMatch(source,/centavos\/minuto|prefix:'\+'/);});
