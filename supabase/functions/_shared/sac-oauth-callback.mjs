import { exchangeToken, resultUrl, stateHash, SAC_OAUTH_CALLBACK } from './sac-oauth.mjs';
import { assertOperatorIdentity, fetchSacOperatorDirectory } from './sac-operator-identity.mjs';
export async function handleSacOAuthCallback(request,admin,{fetcher=fetch,openSocket,profileAccepted,operatorTokenError}) {
 const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Type':'text/plain; charset=utf-8'};
 if(request.method!=='GET') return new Response('Método não permitido.',{status:405,headers});
 const url=new URL(request.url);
 const state=url.searchParams.get('state') || '';
 if(!/^[0-9a-f]{64}$/.test(state)) return new Response('Autorização inválida. Volte à Union e clique em Autorizar Operador.',{status:400,headers});
 const consumed=await admin.rpc('sac_digital_oauth_consume_state',{p_state_hash:await stateHash(state)});
 if(consumed.error) return new Response('Serviço indisponível. Inicie uma nova autorização na Union.',{status:503,headers});
 if(!consumed.data) return new Response('Autorização expirada, já utilizada ou perfil alterado. Volte à Union e clique em Autorizar Operador.',{status:400,headers});
 const context=consumed.data;
 let result='success';
 let socket=null;
 let leased=false;
 let stage='credentials';
 const ownerId=crypto.randomUUID();
 try {
  if(url.searchParams.has('error')) throw Object.assign(Error('Consentimento recusado.'),{code:'access_denied'});
  const code=url.searchParams.get('code');
  if(!code || code.length>4096) throw Object.assign(Error('Código ausente.'),{code:'authorization_failed'});
  const loaded=await admin.rpc('sac_digital_service_credentials',{p_organization_id:context.organization_id});
  if(loaded.error || !loaded.data?.enabled || loaded.data.client_id!==context.client_id) throw Error('Credencial alterada.');
  const credentials={clientId:loaded.data.client_id,clientSecret:loaded.data.client_secret};
  stage='token_exchange';
  const tokens=await exchangeToken(credentials,{grant_type:'authorization_code',redirect_uri:SAC_OAUTH_CALLBACK,code},fetcher);
  if(operatorTokenError(tokens.access_token)) throw Object.assign(Error('Perfil ausente.'),{code:'operator_authorization_required'});
  const lease=await admin.rpc('sac_digital_acquire_operator_lease',{p_organization_id:context.organization_id,p_operator_id:context.operator_id,p_owner_id:ownerId});
  if(lease.error || lease.data!==true) throw Object.assign(Error('Sessão em uso.'),{code:'operator_session_busy'});
  leased=true;
  stage='operator_profile';
  socket=await openSocket(tokens.access_token);
  const profile=await fetcher('https://api.sac.digital/v2/operator/perfil/info',{
   headers:{Authorization:`Bearer ${tokens.access_token}`,Accept:'application/json'},signal:AbortSignal.timeout(15000),
  });
  const body=await profile.json();
  if(!profileAccepted(body,profile.status)) throw Object.assign(Error('Perfil não autorizado.'),{code:'operator_profile_incompatible'});
  stage='profile_identity';
  await assertOperatorIdentity(body,context.operator_id,()=>fetchSacOperatorDirectory(credentials,fetcher));
  stage='session_save';
  const saved=await admin.rpc('sac_digital_operator_session_set',{
   p_organization_id:context.organization_id,p_user_id:context.user_id,p_operator_id:context.operator_id,
   p_binding_version:context.binding_version,p_client_id:context.client_id,p_tokens:tokens,
  });
  if(saved.error) throw Error('Não foi possível salvar a sessão.');
 } catch(error) {
  const code=String(error?.code || 'authorization_failed');
  result=['access_denied','operator_authorization_required','operator_scope_missing','operator_profile_incompatible','operator_identity_mismatch','operator_auth_contract_unverified','operator_session_unavailable','operator_session_busy'].includes(code)?code:'authorization_failed';
  // Never log provider response, code, token, secret or callback query.
  console.warn('[SAC OAuth] Authorization rejected',{organization_id:context.organization_id,type:result,stage});
 } finally {
  socket?.close();
  if(leased) {
   try {await admin.rpc('sac_digital_release_operator_lease',{p_organization_id:context.organization_id,p_operator_id:context.operator_id,p_owner_id:ownerId});} catch { /* bounded lease expires on transport failure */ }
  }
 }
 return new Response(null,{status:303,headers:{...headers,Location:resultUrl(context.return_path,result,context.organization_id)}});
}
