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
 const client={rpc(name,args){calls.push({name,args});return {abortSignal(signal){calls.at(-1).signal=signal;return name==='pbx_list_agents'?{data:[{id:'agent-a',enabled:true}],error:null}:response;}};}};
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

test('central linkage preflight blocks missing/disabled agents and checks again before saving',async()=>{
 const source=readFileSync(app,'utf8').replace(/^import .*;$/gm,'');
 const compiled=await transformWithEsbuild('const pbxRequest = globalThis.__centralRequest;\n'+source,app,{loader:'ts'});
 globalThis.__centralRequest=async(work,_label,options)=>{if(options.signal?.aborted)throw new DOMException('Cancelled','AbortError');return work(options.signal);};
 const mod=await import('data:text/javascript;base64,'+Buffer.from(compiled.code).toString('base64'));
 let agents=[];let denied=false;let saveError=null;const calls=[];
 const client={rpc(name,args){calls.push({name,args});return {abortSignal(signal){calls.at(-1).signal=signal;return name==='pbx_list_agents'?{data:agents,error:denied?{code:'42501',message:'secret-private'}:null}:{data:{},error:saveError};}};}};
 const expected='Central desta empresa ainda não vinculada. A administração Union precisa concluir a vinculação em Integrações → PABX.';
 assert.equal(await mod.hasUniversalTelephonyCentral(client,'org-a'),false);
 await assert.rejects(()=>mod.saveUniversalTelephony(client,'org-a',0,mod.emptyUniversalDocument(),{}),error=>error instanceof mod.UniversalTelephonyError&&error.code==='central_unlinked'&&error.message===expected);
 assert.equal(calls.some(call=>call.name==='pbx_save_universal_telephony'),false);
 agents=[{id:'disabled',enabled:false}];assert.equal(await mod.hasUniversalTelephonyCentral(client,'org-a'),false);
 agents=[{id:'enabled',enabled:true}];const controller=new AbortController();
 assert.equal(await mod.hasUniversalTelephonyCentral(client,'org-a',controller.signal),true);
 await mod.saveUniversalTelephony(client,'org-a',0,mod.emptyUniversalDocument(),{},controller.signal);
 assert.deepEqual(calls.slice(-2).map(call=>call.name),['pbx_list_agents','pbx_save_universal_telephony']);
 assert.equal(calls.at(-2).args.p_organization_id,'org-a');assert.equal(calls.at(-2).signal,controller.signal);
 denied=true;await assert.rejects(()=>mod.hasUniversalTelephonyCentral(client,'org-b'),error=>error.code==='permission_denied'&&!error.message.includes('private'));denied=false;
 const before=calls.length;controller.abort();await assert.rejects(()=>mod.saveUniversalTelephony(client,'org-a',0,mod.emptyUniversalDocument(),{},controller.signal),{name:'AbortError'});assert.equal(calls.length,before);
 saveError={code:'40001',message:'password=private'};await assert.rejects(()=>mod.saveUniversalTelephony(client,'org-a',0,mod.emptyUniversalDocument(),{}),error=>error.code==='revision_conflict'&&!error.message.includes('private'));
 saveError={code:'23514',message:'password=private'};await assert.rejects(()=>mod.saveUniversalTelephony(client,'org-a',0,mod.emptyUniversalDocument(),{}),error=>error.code==='invalid_configuration'&&!error.message.includes('private'));
 assert.equal(mod.universalTelephonyErrorMessage(new Error('private')), 'Alteração sem confirmação. Atualize antes de repetir.');
 delete globalThis.__centralRequest;
});

test('central linkage gates simple and advanced credentials while preserving refresh and tenant guards',()=>{
 const source=readFileSync(ui,'utf8');
 assert.match(source,/hasUniversalTelephonyCentral\(supabase,organizationId,controller.signal\)/);
 assert.match(source,/centralOrganization===organizationId/);
 assert.match(source,/setCentralOrganization\(null\)/);
 assert.match(source,/disabled=\{[^}]*!centralLinked[^}]*\}/);
 assert.match(source,/catch\(failure\)/);assert.match(source,/universalTelephonyErrorMessage\(failure\)/);
 assert.match(source,/epoch!==generation.current/);assert.match(source,/Refresh remains required before another write/);
});

test('central linkage and pending credentials are invalidated when the authenticated user changes',()=>{
 const source=readFileSync(ui,'utf8');
 assert.match(source,/centralUser===user\?\.id/);
 assert.match(source,/\[organizationId,user\?\.id,reload\]/);
 assert.match(source,/key=\{`\$\{organizationId\}-\$\{user\?\.id\}-\$\{reload\}`\}/);
});
