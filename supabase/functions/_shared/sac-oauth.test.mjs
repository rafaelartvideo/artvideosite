import test from 'node:test';
import assert from 'node:assert/strict';
import * as oauth from './sac-oauth.mjs';
test('authorization uses code, state and only Operator scopes on the official Central',()=>{
 const url=new URL(oauth.authorizationUrl('client','random-state'));
 assert.equal(url.origin,'https://auth2.sac.digital');assert.equal(url.pathname,'/oauth/authorize');
 assert.equal(url.searchParams.get('response_type'),'code');assert.equal(url.searchParams.get('state'),'random-state');
 assert.equal(url.searchParams.get('redirect_uri'),'https://unionworld.com.br/sac.php');
 assert.equal(url.searchParams.get('scope'),'profile operator protocol edit write send');
});
test('token forms encode secrets and authorization codes without changing them',()=>{
 const form=oauth.tokenForm({clientId:'c',clientSecret:'secret&+'},{grant_type:'authorization_code',redirect_uri:oauth.SAC_OAUTH_CALLBACK,code:'code+&'});
 assert.equal(form.get('client_secret'),'secret&+');assert.equal(form.get('code'),'code+&');
 assert.equal(form.get('grant_type'),'authorization_code');
});
test('return target cannot redirect outside the Union or inject another origin',()=>{
 assert.equal(oauth.returnPath('/admin/ferramentas/sac-digital'),'/admin/ferramentas/sac-digital');
 for(const path of ['//evil.test','/\t/evil.test','/\u0000/evil.test','/\\evil.test','https://evil.test','bad','/admin?token=secret']) assert.throws(()=>oauth.returnPath(path));
});
test('tokens need both grants, expiry and operational scopes; supplier errors do not leak',()=>{
 const token=oauth.tokenPayload({access_token:'a',refresh_token:'r',expires_in:604800,scope:'profile operator protocol edit write send'},0);
 assert.equal(token.expires_at,'1970-01-08T00:00:00.000Z');assert.equal(token.refresh_expires_at,'1970-01-31T00:00:00.000Z');
 assert.throws(()=>oauth.tokenPayload({access_token:'a',expires_in:1}),/incompleta/);
 assert.throws(()=>oauth.tokenPayload({access_token:'a',refresh_token:'r',expires_in:1,scope:'manager'}),/escopos/);
});
test('authorization result contains no codes or provider response',()=>{
 const result=oauth.resultUrl('/admin/ferramentas/sac-digital','operator_identity_mismatch','org');
 const url=new URL(result);assert.equal(url.origin,'https://unionworld.com.br');
 assert.equal(url.searchParams.get('sac_oauth'),'operator_identity_mismatch');
 assert.equal(url.searchParams.has('code'),false);
});

import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('./sac-oauth-session.ts',import.meta.url),'utf8');
const session=await import('data:text/javascript;base64,'+Buffer.from(source.replace("'./sac-oauth.mjs'",JSON.stringify(new URL('./sac-oauth.mjs',import.meta.url).href))).toString('base64'));
const context={organizationId:'org',userId:'user',operatorId:'op',bindingVersion:'version'};
const credentials={clientId:'client',clientSecret:'secret'};
test('existing Operator authorization is reused without creating new SAC sessions',async()=>{
 let renewed=false;
 const token=await session.authorizedOperatorToken({rpc:async()=>({data:{access_token:'saved',expires_at:new Date(Date.now()+600000).toISOString()}})},context,credentials,async()=>{renewed=true;});
 assert.equal(token,'saved');assert.equal(renewed,false);
});
test('expired authorization renews with the saved refresh grant and persists rotation',async()=>{
 let stored,grant;
 const token=await session.authorizedOperatorToken({rpc:async(name,args)=>name.endsWith('_get')?{data:{access_token:'old',expires_at:new Date(0).toISOString(),refresh_token:'refresh-old',refresh_expires_at:new Date(Date.now()+600000).toISOString()}}:(stored=args,{error:null})},context,credentials,async(url,request)=>{
  grant=new URLSearchParams(request.body);return Response.json({access_token:'new',refresh_token:'refresh-new',expires_in:604800});
 });
 assert.equal(grant.get('grant_type'),'refresh_token');assert.equal(grant.get('refresh_token'),'refresh-old');
 assert.equal(stored.p_tokens.refresh_token,'refresh-new');assert.equal(token,'new');
 assert.equal(stored.p_user_id,'user');assert.equal(stored.p_operator_id,'op');
});
test('missing authorization requires consent, with no application login fallback',async()=>{
 let fetched=false;
 await assert.rejects(session.authorizedOperatorToken({rpc:async()=>({data:null})},context,credentials,async()=>{fetched=true;}),e=>e.code==='operator_authorization_required');
 assert.equal(fetched,false);
});
test('revoked refresh requires consent; supplier details never enter the error',async()=>{
 await assert.rejects(oauth.exchangeToken(credentials,{grant_type:'refresh_token',refresh_token:'sensitive'},async()=>Response.json({error:'invalid_grant',error_description:'sensitive secret contents'},{status:400})),e=>e.code==='operator_authorization_required' && !e.message.includes('sensitive'));
});
test('network failure preserves the stored authorization for a later retry',async()=>{
 await assert.rejects(oauth.exchangeToken(credentials,{grant_type:'refresh_token',refresh_token:'r'},async()=>{throw Error('private request details');}),e=>e.code==='operator_session_unavailable' && !e.message.includes('private'));
});

import {handleSacOAuthCallback} from './sac-oauth-callback.mjs';
function callbackFixture(profileId='op') {
 let consumed=false,closed=false,saved=null,released=false,exchanges=0;
 const admin={rpc:async(name,args)=>{
  if(name==='sac_digital_oauth_consume_state') {if(consumed)return {data:null};consumed=true;return {data:{organization_id:'org',user_id:'user',operator_id:'op',binding_version:'version',client_id:'client',return_path:'/admin/sac'}};}
  if(name==='sac_digital_service_credentials') return {data:{enabled:true,client_id:'client',client_secret:'secret'}};
  if(name==='sac_digital_acquire_operator_lease') return {data:true};
  if(name==='sac_digital_release_operator_lease') {released=true;return {data:null};}
  if(name==='sac_digital_operator_session_set') {saved=args;return {error:null};}
  throw Error('Unknown RPC');
 }};
 const deps={operatorTokenError:()=>null,profileAccepted:(body,status)=>status===200&&body.status===true,openSocket:async()=>({close:()=>{closed=true;}}),fetcher:async url=>{
  if(url.endsWith('/oauth/token')) {exchanges++;return Response.json({access_token:'private-access',refresh_token:'private-refresh',expires_in:604800});}
  return Response.json({status:true,info:{id:profileId}});
 }};
 return {admin,deps,inspect:()=>({saved,closed,released,exchanges})};
}
const callbackRequest=()=>new Request(oauth.SAC_OAUTH_CALLBACK+'?state='+ 'a'.repeat(64)+'&code=private-code');
test('callback saves the validated Operator for the initiating user, releases lease and hides credentials',async()=>{
 const f=callbackFixture();const response=await handleSacOAuthCallback(callbackRequest(),f.admin,f.deps);
 assert.equal(response.status,303);assert.equal(new URL(response.headers.get('Location')).searchParams.get('sac_oauth'),'success');
 assert.equal(f.inspect().saved.p_user_id,'user');assert.equal(f.inspect().saved.p_operator_id,'op');
 assert.equal(f.inspect().closed,false);assert.equal(f.inspect().released,true);
 assert.equal(response.headers.get('Location').includes('private'),false);
 assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
});
test('another Operator or Manager cannot authorize the bound attendance identity',async()=>{
 const f=callbackFixture('other');const response=await handleSacOAuthCallback(callbackRequest(),f.admin,f.deps);
 assert.equal(new URL(response.headers.get('Location')).searchParams.get('sac_oauth'),'operator_identity_mismatch');
 assert.equal(f.inspect().saved,null);assert.equal(f.inspect().released,true);
});
test('replayed state is refused before any second grant exchange',async()=>{
 const f=callbackFixture();await handleSacOAuthCallback(callbackRequest(),f.admin,f.deps);
 const replay=await handleSacOAuthCallback(callbackRequest(),f.admin,f.deps);
 assert.equal(replay.status,400);assert.equal(f.inspect().exchanges,1);
});
test('refused consent creates no Operator session',async()=>{
 const f=callbackFixture();const response=await handleSacOAuthCallback(new Request(oauth.SAC_OAUTH_CALLBACK+'?state='+ 'a'.repeat(64)+'&error=access_denied'),f.admin,f.deps);
 assert.equal(new URL(response.headers.get('Location')).searchParams.get('sac_oauth'),'access_denied');
 assert.equal(f.inspect().exchanges,0);assert.equal(f.inspect().saved,null);
});
const gateway=await import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL('./sac-gateway.ts',import.meta.url),'utf8')).toString('base64'));
test('read/save RPC failures and incomplete OAuth grants are rejected before any attendance mutation',async()=>{
 for(const failure of ['read','save','payload']) {
  let transported=false,recorded;
  const admin={rpc:async name=>{
   if(name.endsWith('_get')) return failure==='read'?{error:{message:'db failure'}}:{data:{expires_at:new Date(0).toISOString(),refresh_expires_at:new Date(Date.now()+600000).toISOString(),refresh_token:'r'}};
   return {error:{message:'save failure'}};
  }};
  const result=await gateway.executeSacOperation({mode:'operator',method:'PATCH',path:'/operator/att/select/P123',protocol:'P123'}, {
   authorize:async()=>true,begin:async()=>({id:'A',state:'prepared',created:true}),lease:async()=>true,
   operator:async()=>session.authorizedOperatorToken(admin,context,credentials,async()=>Response.json(failure==='payload'?{access_token:'a',expires_in:30}:{access_token:'a',refresh_token:'r',expires_in:30})),
   transport:async()=>{transported=true;},record:async(id,state)=>{recorded=state;},release:async()=>{},
  });
  assert.equal(result.outcome,'rejected',failure);assert.equal(recorded,'rejected',failure);assert.equal(transported,false);
 }
});

test('SAC profile without info.id is confirmed against its unique Operator email in the company directory',async()=>{
 const f=callbackFixture();
 const original=f.deps.fetcher;
 f.deps.fetcher=async(url,request)=>{
  if(url.endsWith('/oauth/token')) return original(url,request);
  if(url.endsWith('/client/auth2/login')) return Response.json({status:true,token:'directory-token'});
  if(url.includes('/client/operator/all')) return Response.json({status:true,list:[{id:'op',name:'Atendente',email:'operator@example.test'}],has_more:false});
  return Response.json({status:true,info:{name:'Atendente',email:'Operator@Example.Test',departments:[]}});
 };
 const response=await handleSacOAuthCallback(callbackRequest(),f.admin,f.deps);
 assert.equal(new URL(response.headers.get('Location')).searchParams.get('sac_oauth'),'success');
 assert.equal(f.inspect().saved.p_operator_id,'op');
});

test('valid Operator authorization is saved when the optional notification WebSocket closes or is unavailable',async()=>{
 const f=callbackFixture();
 f.deps.openSocket=async()=>{throw Object.assign(Error('notification socket closed'),{code:'operator_session_unavailable'});};
 const response=await handleSacOAuthCallback(callbackRequest(),f.admin,f.deps);
 assert.equal(new URL(response.headers.get('Location')).searchParams.get('sac_oauth'),'success');
 assert.equal(f.inspect().saved.p_operator_id,'op');
 assert.equal(f.inspect().released,true);
});
