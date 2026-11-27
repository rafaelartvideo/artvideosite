import {buildHomologationNfe,createNfeHomologationService} from "./nfe-homologation.mjs";
import {summarizeEmissionBootstrap} from "./emission-diagnostics.mjs";
const uuid=/^[0-9a-f-]{36}$/i;
const select="id,binding_id,organization_id,account_id,cnpj,external_company_id,session_revision,state,remote_id,remote_revision,protocol,error_code,created_at,updated_at";
const reject=code=>{throw new Error(code)};
function result(r){if(r.error)reject("FISCAL_PERSISTENCE_FAILED");return r.data;}
function integer(v){const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null;}
function norm(v){return typeof v==="string"?v.replace(/\D/g,""):"";}
function safeProfile(p){
  const id=p?.id??p?.profile_id,version=p?.version??p?.profile_version,model=p?.model??p?.modelo,catalogCode=p?.catalog_code;
  const valid=v=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0||typeof v==="string"&&/^[A-Za-z0-9_.-]{1,80}$/.test(v);
  if(!valid(id)||!valid(version)||String(model)!=="55"||!valid(catalogCode))return null;
  return {id,version,model:"55",catalogCode};
}
// Entry is only reachable after existing platform operator membership and both
// management permissions have been checked. No tenant may call these actions.
export async function handleNfeAdmin({admin,provider,account,companies,body,actorId}){
  if(!uuid.test(body.organizationId||""))reject("INVALID_ORGANIZATION");
  const [org,binding,module]=await Promise.all([
    admin.from("organizations").select("document").eq("id",body.organizationId).eq("status","active").maybeSingle(),
    admin.from("fiscal_organization_bindings").select("id,organization_id,account_id,cnpj,is_enabled").eq("organization_id",body.organizationId).eq("account_id",account.id).eq("is_enabled",true).maybeSingle(),
    admin.from("organization_modules").select("module_key").eq("organization_id",body.organizationId).eq("module_key","fiscal").eq("is_enabled",true).maybeSingle()
  ]);
  const b=result(binding),o=result(org);
  if(!b||!o||!result(module)||norm(o.document)!==b.cnpj)reject("FISCAL_BINDING_REQUIRED");
  const a=result(await admin.from("fiscal_provider_accounts").select("id,is_active,inventory_verified_at,session_revision").eq("id",account.id).maybeSingle());
  const inventory=result(await admin.from("fiscal_account_cnpjs").select("cnpj,verified_at").eq("account_id",a?.id||account.id));
  const own=inventory?.find(i=>i.cnpj===b.cnpj&&i.verified_at);
  if(!a?.is_active||!a.inventory_verified_at||a.session_revision!==account.session_revision||!own)reject("ACCOUNT_NOT_VERIFIED");
  if(!Array.isArray(companies)||companies.filter(c=>c.cnpj===b.cnpj).length!==1)reject("CNPJ_NOT_AUTHORIZED_BY_PROVIDER");
  let issuer=result(await admin.from("fiscal_homologation_issuers").select("*").eq("binding_id",b.id).maybeSingle());
  const scope={binding_id:b.id,organization_id:b.organization_id,account_id:b.account_id,cnpj:b.cnpj};
  const panelAllowed=companies.length===1&&inventory.length===1;
  async function bootstrap(id,source){
    const raw=await provider.emission({operation:"bootstrap",company:id,environment:2});
    const diag=summarizeEmissionBootstrap(raw,b.cnpj,id);
    if(diag.identity==="mismatch")reject("EMITTER_ID_MISMATCH");
    if(diag.identity!=="confirmed"&&!(source==="single_company_panel"&&panelAllowed))reject("EMITTER_IDENTITY_UNVERIFIED");
    const profiles=Array.isArray(raw?.catalog?.profiles)?raw.catalog.profiles.map(safeProfile).filter(Boolean):[];
    const model=raw?.launch?.diagnosis?.models?.["55"];
    const series=Array.isArray(model?.series)?model.series.map(s=>String(s?.series??"")).filter(s=>/^\d{1,3}$/.test(s)):[];
    return {identity:diag.identity,ready:model?.available===true&&model?.status==="ready",profiles,profileFields:diag.profileFields,series};
  }
  if(body.action==="nfe_bind"){
    const id=integer(body.emitterId);
    if(!id||body.confirm!==true||body.confirmedCnpj!==b.cnpj)reject("EMITTER_CONFIRMATION_REQUIRED");
    if(issuer&&integer(issuer.external_company_id)!==id)reject("EMITTER_CHANGE_REQUIRES_REVIEW");
    const data=await bootstrap(id,panelAllowed?"single_company_panel":"provider");
    const source=data.identity==="confirmed"?"provider":"single_company_panel";
    const row={...scope,external_company_id:id,session_revision:a.session_revision,verified_by:actorId,verified_at:new Date().toISOString(),identity_source:source};
    // Existing issuer ID is immutable in this flow; reject races via insert
    // unique constraints, and compare-and-swap the previous session revision.
    if(issuer){
      issuer=result(await admin.from("fiscal_homologation_issuers").update(row).eq("binding_id",b.id).eq("external_company_id",id).eq("session_revision",issuer.session_revision).select("*").maybeSingle());
    }else issuer=result(await admin.from("fiscal_homologation_issuers").insert(row).select("*").single());
    if(!issuer)reject("EMITTER_BINDING_CONFLICT");
    return {issuerId:id,identitySource:source,...data};
  }
  if(!issuer||issuer.session_revision!==a.session_revision||issuer.organization_id!==b.organization_id||issuer.account_id!==a.id||issuer.cnpj!==b.cnpj)reject("EMITTER_BINDING_REQUIRED");
  const id=integer(issuer.external_company_id);
  if(!id)reject("EMITTER_BINDING_REQUIRED");
  if(issuer.identity_source==="single_company_panel"&&!panelAllowed)reject("EMITTER_IDENTITY_UNVERIFIED");
  const table=()=>admin.from("fiscal_homologation_operations");
  const scoped=q=>q.eq("binding_id",b.id).eq("organization_id",b.organization_id).eq("account_id",a.id).eq("cnpj",b.cnpj).eq("external_company_id",id);
  if(body.action==="nfe_status"){
    const data=await bootstrap(id,issuer.identity_source);
    const operations=result(await scoped(table().select(select)).order("created_at",{ascending:false}).limit(20));
    return {issuerId:id,identitySource:issuer.identity_source,...data,operations};
  }
  if(body.action==="nfe_prepare"){
    if(!uuid.test(body.requestKey||""))reject("INVALID_REQUEST_KEY");
    const data=await bootstrap(id,issuer.identity_source);
    if(!data.ready)reject("MODEL_NOT_READY");
    const profile=data.profiles.find(p=>p.id===body.profileId&&p.version===body.profileVersion);
    if(!profile||!data.series.includes(body.series))reject("PROFILE_OR_SERIES_UNVERIFIED");
    const built=buildHomologationNfe(body.commercial,profile,body.series);
    const {profileId,profileVersion,...payload}=built;
    // The request key makes local preparation idempotent. An existing open
    // operation must be resumed, not replaced. Never overwrite the snapshot.
    const previous=result(await scoped(table().select(select)).eq("request_key",body.requestKey).maybeSingle());
    if(previous)return previous;
    return result(await table().insert({...scope,external_company_id:id,session_revision:a.session_revision,
      request_key:body.requestKey,profile_id:profileId,profile_version:profileVersion,payload,created_by:actorId}).select(select).single());
  }
  if(!uuid.test(body.operationId||""))reject("INVALID_OPERATION");
  const existing=result(await scoped(table().select("*")).eq("id",body.operationId).maybeSingle());
  if(!existing||existing.session_revision!==a.session_revision)reject("OPERATION_NOT_AVAILABLE");
  const data=await bootstrap(id,issuer.identity_source);
  if(["nfe_create","nfe_validate","nfe_issue"].includes(body.action)){
    if(!data.ready||!data.series.includes(existing.payload.series)||!data.profiles.some(p=>p.id===existing.profile_id&&p.version===existing.profile_version&&String(p.catalogCode)===existing.payload.commercial.items[0].catalog_code))reject("PROFILE_OR_SERIES_UNVERIFIED");
  }
  const repository={
    claim:async(operationId,allowed,state)=>result(await scoped(table().update({state,updated_at:new Date().toISOString()})).eq("id",operationId).eq("session_revision",a.session_revision).in("state",allowed).select("*").maybeSingle()),
    finish:async(operationId,claimed,patch)=>result(await scoped(table().update({...patch,updated_at:new Date().toISOString()})).eq("id",operationId).eq("session_revision",a.session_revision).eq("state",claimed).select(select).maybeSingle())
  };
  const service=createNfeHomologationService({repository,provider,companyId:id});
  if(body.action==="nfe_create")return service.create(existing.id);
  if(body.action==="nfe_validate")return service.validate(existing.id);
  if(body.action==="nfe_issue")return service.issue(existing.id,body.confirm);
  if(body.action==="nfe_process")return service.process(existing.id,body.confirm);
  if(body.action==="nfe_detail")return service.detail(existing.id);
  reject("INVALID_ACTION");
}
