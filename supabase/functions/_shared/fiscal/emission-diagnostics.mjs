// Platform-only projection. Diagnostic response fields are untrusted provider data.
// No raw credentials, documents, customer data or arbitrary provider text are returned.
const MODEL_KEYS = new Set(["55","65","NFSE","nfe","nfce","nfse"]);
const SAFE_KEYS = new Set(["model","modelo","code","codigo","status","state","ready","enabled","available","valid","configured","supported","blocked","ok","pending","pendencias","requirements","checks","certificate","certificado","credentialing","credenciamento","profile","perfil","series","serie","environment","ambiente","coverage","cobertura","authorizer","autorizador","diagnosis","diagnostic","reason","reasons","errors","warnings","issues"]);
const SAFE_ENUM = /^[\p{L}\p{N}_ .:/()-]{1,100}$/u;
// The provider returns human-readable issues, not just short enum values.
// Only expose text in the diagnostic issue path, never arbitrary response fields.
function issueText(value){
  if(typeof value!=="string")return null;
  const clean=value.replace(/[\p{Cc}\p{Cf}]/gu," ").replace(/\s+/g," ").trim();
  if(!clean || /(?:\bBearer\s+|-----BEGIN|https?:\/\/|\b(?:senha|password|token|secret|segredo|csc|chave\s+privada|api[_ -]?key)\s*[:=])/iu.test(clean))return null;
  return clean.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,"[oculto]")
    .replace(/\b[A-Za-z0-9_+/=-]{24,}\b/g,"[oculto]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,"[oculto]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,"[oculto]")
    .slice(0,500);
}
function projectIssue(value){
  if(typeof value==="string")return issueText(value);
  if(value&&typeof value==="object"&&!Array.isArray(value)){
    return issueText(value.message??value.mensagem??value.description??value.descricao??value.reason??value.code);
  }
  return null;
}
function project(value,depth=0){
  if(depth>5)return null;
  if(typeof value==="boolean" || (typeof value==="number"&&Number.isSafeInteger(value)&&Math.abs(value)<1000000))return value;
  if(typeof value==="string")return SAFE_ENUM.test(value)?value:null;
  if(Array.isArray(value))return value.slice(0,30).map(v=>project(v,depth+1));
  if(value&&typeof value==="object"){
    return Object.fromEntries(Object.entries(value).filter(([k])=>SAFE_KEYS.has(k)||MODEL_KEYS.has(k)).slice(0,40).map(([k,v])=>[k,k==="issues"&&Array.isArray(v)?v.slice(0,30).map(projectIssue):project(v,depth+1)]));
  }
  return null;
}
export function summarizeEmissionBootstrap(data,expectedCnpj,companyId){
  const models=data?.launch?.diagnosis?.models;
  if(!models||typeof models!=="object")throw new Error("FISCAL_BOOTSTRAP_SCHEMA_UNRECOGNIZED");
  const company=data?.company;
  // Only an explicit company object can corroborate identity; never infer it
  // from the requested ID or any unrelated document/profile fields.
  const reported=typeof company?.cnpj==="string"?company.cnpj.replace(/\D/g,""):"";
  const reportedId=Number(company?.id);
  const identity=reported && reported!==expectedCnpj || Number.isSafeInteger(reportedId)&&reportedId>0&&reportedId!==companyId
    ?"mismatch":reported===expectedCnpj&&reportedId===companyId?"confirmed":"unverified";
  const profiles=data?.catalog?.profiles;
  return {identity,models:identity==="mismatch"?null:project(models),profileCount:Array.isArray(profiles)?profiles.length:null};
}
