const failure=(code,message)=>Object.assign(Error(message),{code});
const emailKey=value=>typeof value==='string'?value.trim().toLowerCase():'';

// /operator/perfil/info does not promise an id. Its authenticated email can
// identify an Operator only through a unique match in this company's directory.
export async function assertOperatorIdentity(profile,expectedId,loadOperators) {
 const info=profile?.info;
 if(!info || typeof info!=='object' || Array.isArray(info)) throw failure('operator_auth_contract_unverified','A SAC não confirmou os dados do perfil autorizado.');
 let id=typeof info.id==='string'?info.id.trim():'';
 if(!id) {
  const email=emailKey(info.email);
  if(!email || !email.includes('@')) throw failure('operator_auth_contract_unverified','A SAC não confirmou a identificação do perfil autorizado.');
  let operators;
  try {operators=await loadOperators();} catch {throw failure('operator_session_unavailable','Não foi possível conferir o cadastro de Operadores da SAC. Tente novamente.');}
  if(!Array.isArray(operators)) throw failure('operator_session_unavailable','A SAC não retornou o cadastro de Operadores.');
  const matches=operators.filter(row=>row && emailKey(row.email)===email);
  if(matches.length!==1 || typeof matches[0].id!=='string' || !matches[0].id.trim()) throw failure('operator_auth_contract_unverified','O perfil autorizado não possui uma identificação única no cadastro de Operadores da SAC.');
  id=matches[0].id.trim();
 }
 if(id!==expectedId) throw failure('operator_identity_mismatch','A conta autorizada não corresponde ao Operador vinculado. Entre na SAC com o Operador correto.');
 return id;
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
