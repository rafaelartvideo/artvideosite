const failure=(code,message)=>Object.assign(Error(message),{code});
const emailKey=value=>typeof value==='string'?value.trim().toLowerCase():'';

const idKey=value=>typeof value==='string'?value.trim():typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?String(value):'';

// This JWT came directly from the SAC OAuth token exchange on the server.
// It can corroborate the bound Operator ID only when the trusted Operator
// profile endpoint accepted that bearer. Never accept client-supplied claims.
export function operatorIdFromAccessToken(token) {
 try {
  const parts=typeof token==='string'?token.split('.'):[];
  if(parts.length!==3 || !parts[1] || parts[1].length>8192) return '';
  const claims=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
  if(!claims || typeof claims!=='object' || Array.isArray(claims)) return '';
  const ids=[claims.operator_id,claims.operator?.id,claims.sub].map(idKey).filter(Boolean);
  return new Set(ids).size===1?ids[0] || '':'';
 } catch {return '';}
}

// The SAC may authorize an Operator without returning ID or email.
// The OAuth state already binds consent to this Union user and Operator link.
// The callback validates the SAC Operator profile before invoking this helper.
// Only an explicit, conflicting provider ID prevents saving a valid grant.
export async function assertOperatorIdentity(profile,expectedId) {
 const boundId=idKey(expectedId);
 if(!boundId) throw failure('operator_auth_contract_unverified','O vínculo do Operador está incompleto na Union.');
 if(!profile || typeof profile!=='object' || Array.isArray(profile) || profile.status===false || profile.success===false) {
  throw failure('operator_profile_incompatible','A SAC não aceitou o perfil de Operador.');
 }
 const info=profile.info && typeof profile.info==='object' && !Array.isArray(profile.info)?profile.info:null;
 const ids=info?[info.id,info.operator_id,info.operator?.id].map(idKey).filter(Boolean):[];
 if(new Set(ids).size>1) throw failure('operator_auth_contract_unverified','A SAC retornou IDs conflitantes para o Operador.');
 if(ids.length && ids[0]!==boundId) throw failure('operator_identity_mismatch','A conta autorizada não corresponde ao Operador vinculado. Entre na SAC com o Operador correto.');
 return boundId;
}

export async function fetchSacOperatorDirectory(credentials,fetcher=fetch,clientToken) {
 const request=async(path,init={})=>{
  const response=await fetcher('https://api.sac.digital/v2/client'+path,{...init,signal:AbortSignal.timeout(15000)});
  const body=await response.json();
  if(!response.ok || body.status===false || body.success===false) throw Error('Cadastro de Operadores indisponível.');
  return body;
 };
 const login=clientToken ? {token:clientToken} : await request('/auth2/login',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({client:credentials.clientId,password:credentials.clientSecret,scopes:['operator']})});
 if(typeof login.token!=='string' || !login.token.trim()) throw Error('Acesso ao cadastro indisponível.');
 const list=[];
 for(let page=1;page<=100;page++) {
  const body=await request('/operator/all?p='+page,{headers:{Authorization:'Bearer '+login.token,Accept:'application/json'}});
  if(!Array.isArray(body.list)) throw Error('Cadastro de Operadores inválido.');
  list.push(...body.list);
  if(body.list.length===0 || body.has_more===false || body.pager?.has_more===false) return list;
 }
 throw Error('Cadastro de Operadores incompleto.');
}
