export const SAC_OAUTH_CALLBACK='https://wmjmtcjpunmzvonlkjcu.supabase.co/functions/v1/sac-digital-oauth';
export const SAC_OPERATOR_SCOPES=['profile','operator','protocol','edit','write','send'];
export function authorizationUrl(clientId,state) {
 const url=new URL('https://auth2.sac.digital/oauth/authorize');
 url.search=new URLSearchParams({client_id:clientId,redirect_uri:SAC_OAUTH_CALLBACK,response_type:'code',scope:SAC_OPERATOR_SCOPES.join(' '),state}).toString();
 return url.toString();
}
export function returnPath(path) {
 if(typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\?#\x00-\x1f\x7f]/.test(path) || path.length>500) throw Error('Endereço de retorno inválido.');
 return path;
}
export function resultUrl(path,result,organizationId) {
 const url=new URL(returnPath(path),'https://unionworld.com.br');
 if(url.origin!=='https://unionworld.com.br') throw Error('Endereço de retorno inválido.');
 url.search=new URLSearchParams({sac_oauth:result,sac_oauth_org:organizationId}).toString();
 return url.toString();
}
export function tokenForm(credentials,grant) {
 return new URLSearchParams({...grant,client_id:credentials.clientId,client_secret:credentials.clientSecret});
}
export function tokenPayload(body,now=Date.now()) {
 const expires=Number(body.expires_in);
 if(typeof body.access_token!=='string' || !body.access_token || typeof body.refresh_token!=='string' || !body.refresh_token || !Number.isFinite(expires) || expires<=0 || expires>604800) throw Object.assign(Error('A SAC retornou uma autorização incompleta.'),{code:'operator_auth_contract_unverified'});
 const scopes=typeof body.scope==='string'?body.scope.split(/\s+/):Array.isArray(body.scopes)?body.scopes:null;
 if(scopes && SAC_OPERATOR_SCOPES.some(scope=>!scopes.includes(scope))) throw Object.assign(Error('A SAC não autorizou os escopos de atendimento solicitados.'),{code:'operator_scope_missing'});
 return {access_token:body.access_token,refresh_token:body.refresh_token,expires_at:new Date(now+expires*1000).toISOString(),refresh_expires_at:new Date(now+30*86400000).toISOString()};
}
export async function stateHash(state) {
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(state));
 return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function exchangeToken(credentials,grant,fetcher=fetch) {
 let response;
 try {response=await fetcher('https://auth2.sac.digital/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:tokenForm(credentials,grant).toString(),signal:AbortSignal.timeout(15000)});}
 catch {throw Object.assign(Error('A Central da SAC está indisponível. Tente novamente.'),{code:'operator_session_unavailable'});}
 let body;
 try {body=await response.json();} catch {throw Object.assign(Error('Resposta inválida da Central SAC.'),{code:'operator_session_unavailable'});}
 if(!response.ok || body.error || body.status===false || body.success===false) {
  const invalid=['invalid_grant','invalid_client','unauthorized_client'].includes(String(body.error || body.type));
  throw Object.assign(Error(invalid?'A autorização SAC expirou ou foi recusada. Clique em Autorizar Operador.':'A SAC não concluiu a autorização. Tente novamente.'),{code:invalid?'operator_authorization_required':'operator_session_unavailable'});
 }
 return tokenPayload(body);
}
