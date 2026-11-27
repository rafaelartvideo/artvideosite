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
// Discover explicit issuer objects only. Never search arbitrary nested documents,
// customers or profiles for matching CNPJs.
function issuerIdentity(data,expectedCnpj,companyId){
  const candidates=[data?.company,data?.issuer,data?.emitente,data?.empresa,
    data?.launch?.company,data?.launch?.issuer,data?.launch?.empresa,
    data?.catalog?.company,data?.context?.company];
  let confirmed=false;
  for(const item of candidates){
    if(!item||typeof item!=="object"||Array.isArray(item))continue;
    const rawCnpj=item.cnpj??item.tax_id??item.taxId;
    const rawId=item.id??item.company_id??item.companyId;
    const cnpj=typeof rawCnpj==="string"?rawCnpj.replace(/\D/g,""):"";
    const id=Number(rawId);
    const hasId=Number.isSafeInteger(id)&&id>0;
    const hasCnpj=/^\d{14}$/.test(cnpj);
    if((hasCnpj&&cnpj!==expectedCnpj)||(hasId&&id!==companyId))return "mismatch";
    if(hasCnpj&&hasId)confirmed=true;
  }
  return confirmed?"confirmed":"unverified";
}
const shortIdentifier=value=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:
  typeof value==="string"&&/^[a-zA-Z0-9_.-]{1,80}$/.test(value)?value:null;
function profileSummary(profile){
  if(!profile||typeof profile!=="object"||Array.isArray(profile))return null;
  const id=shortIdentifier(profile.id??profile.profile_id);
  const version=shortIdentifier(profile.version??profile.profile_version);
  const model=shortIdentifier(profile.model??profile.modelo);
  const catalogCode=shortIdentifier(profile.catalog_code);
  return {id,version,model,catalogCode,
    status:shortIdentifier(profile.status),
    // Key names help recognize the actual provider schema without returning
    // arbitrary profile payloads, tax values, credentials or personal data.
    fields:Object.keys(profile).filter(k=>/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(k)).slice(0,40)};
}
export function summarizeEmissionBootstrap(data,expectedCnpj,companyId){
  const models=data?.launch?.diagnosis?.models;
  if(!models||typeof models!=="object")throw new Error("FISCAL_BOOTSTRAP_SCHEMA_UNRECOGNIZED");
  const identity=issuerIdentity(data,expectedCnpj,companyId);
  const profiles=data?.catalog?.profiles;
  return {identity,models:identity==="mismatch"?null:project(models),
    profileCount:Array.isArray(profiles)?profiles.length:null,
    profiles:identity==="confirmed"&&Array.isArray(profiles)?profiles.slice(0,100).map(profileSummary).filter(Boolean):[],
    profileFields:identity!=="mismatch"&&Array.isArray(profiles)?[...new Set(profiles.slice(0,10).flatMap(p=>profileSummary(p)?.fields??[]))].slice(0,60):[]};
}
