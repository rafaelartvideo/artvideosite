// Homologation only. Pure contract builder; never accept an arbitrary provider payload.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const reject=code=>{throw new Error(code)};
function str(value,max){if(typeof value!=="string"||!value.trim()||value.trim().length>max)reject("INVALID_FIELD");return value.trim();}
function digits(value,pattern){const s=str(value,40).replace(/\D/g,"");if(!pattern.test(s))reject("INVALID_FIELD");return s;}
function cents(value){if(typeof value!=="string"||!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(value))reject("INVALID_AMOUNT");const [whole,fraction=""]=value.split(".");return BigInt(whole)*100n+BigInt(fraction.padEnd(2,"0"));}
function decimal(n){return (n/100n).toString()+"."+(n%100n).toString().padStart(2,"0");}
function identifier(v){if(typeof v==="number"&&Number.isSafeInteger(v)&&v>0)return v;if(typeof v==="string"&&/^[A-Za-z0-9_.-]{1,80}$/.test(v))return v;reject("INVALID_PROFILE");}
export function buildHomologationNfe(input,profile,series){
  if(!input||!profile||String(profile.model)!=="55")reject("INVALID_PROFILE");
  if(!/^\d{1,3}$/.test(String(series)))reject("INVALID_SERIES");
  const id=identifier(profile.id),version=identifier(profile.version),catalogCode=String(identifier(profile.catalogCode));
  const customer=input.customer,address=customer?.address;
  const state=str(address?.uf,2).toUpperCase();
  if(state!=="SE")reject("PILOT_ONLY_INTRASTATE_SE");
  // Initial pilot uses one item, one cash payment, non-contributing consumer.
  // No guessed tax fields: provider applies the selected reviewed profile.
  const amount=cents(input.unitPrice),discount=cents(input.discount??"0");
  if(amount<=0n||discount>=amount)reject("INVALID_AMOUNT");
  const commercial={
    customer:{tax_id:digits(customer?.tax_id,/^(?:\d{11}|\d{14})$/),name:str(customer?.name,120),ie_indicator:9,address:{
      street:str(address?.street,120),number:str(address?.number,30),district:str(address?.district,80),city:str(address?.city,80),uf:state,
      municipality:digits(address?.municipality,/^28\d{5}$/),postal_code:digits(address?.postal_code,/^\d{8}$/)
    }},
    items:[{catalog_code:catalogCode,description:str(input.description,120),quantity:"1",unit_price:decimal(amount),discount:decimal(discount)}],
    payment:{type:"01",amount:decimal(amount-discount)}
  };
  return {model:"55",series:String(series),commercial,profileId:id,profileVersion:version};
}
export function assertProviderDraft(data){
  if(typeof data?.id!=="string"||!uuid.test(data.id)||!Number.isSafeInteger(data.revision)||data.revision<0)reject("DRAFT_RESPONSE_UNRECOGNIZED");
  return {id:data.id,revision:data.revision};
}
export function classifyValidation(data){
  // The docs do not specify a full validation response schema. Do not equate
  // success of the HTTP request to success of local fiscal validation.
  if(data?.valid===false||data?.validated===false||["invalid","rejected"].includes(data?.status)||Array.isArray(data?.errors)&&data.errors.length>0)return "validation_rejected";
  if((data?.valid===true||data?.validated===true||data?.status==="validated")&&(!Array.isArray(data?.errors)||!data.errors.length))return "validated";
  return "validation_unknown";
}
export function classifyDetail(data){
  const state=data?.state??data?.status;
  const protocol=typeof data?.protocol==="string"&&/^\d{10,30}$/.test(data.protocol)?data.protocol:null;
  if(state==="authorized"&&protocol)return {state:"authorized",protocol};
  if(state==="rejected")return {state:"rejected",protocol:null};
  return {state:"awaiting_confirmation",protocol:null};
}
// The repository must implement a durable atomic compare-and-swap claim.
// Persist before each external call, never retry /create automatically.
export function createNfeHomologationService({repository,provider,companyId}){
  if(!Number.isSafeInteger(companyId)||companyId<=0)reject("ISSUER_NOT_VERIFIED");
  const call=(operation,payload,extras={})=>provider.emission({operation,company:companyId,environment:2,payload,...extras});
  async function step(id,allowed,claimed,action,failed){
    const row=await repository.claim(id,allowed,claimed);
    if(!row)reject("OPERATION_CONFLICT");
    try{
      const patch=await action(row);
      const result=await repository.finish(id,claimed,patch);
      if(!result)reject("OPERATION_PERSISTENCE_FAILED");
      return result;
    }catch(error){
      // If even persistence fails, the claimed state remains locked, requiring
      // reconciliation. Never restore an earlier state and send again blindly.
      try{await repository.finish(id,claimed,{state:failed,error_code:"FISCAL_RESULT_UNCERTAIN"});}catch{/* preserve claim */}
      throw error;
    }
  }
  return Object.freeze({
    create:id=>step(id,["prepared"],"creating",async row=>{
      const d=assertProviderDraft(await call("create",row.payload));
      return {state:"draft",remote_id:d.id,remote_revision:d.revision,error_code:null};
    },"create_uncertain"),
    validate:id=>step(id,["draft"],"validating",async row=>{
      const result=await call("validate",{id:row.remote_id,profile_id:row.profile_id,profile_version:row.profile_version});
      return {state:classifyValidation(result),error_code:null};
    },"validation_unknown"),
    issue:(id,confirm)=>{if(confirm!==true)reject("CONFIRMATION_REQUIRED");return step(id,["validated"],"issuing",async row=>{
      if(!uuid.test(row.issue_key)||!uuid.test(row.remote_id))reject("INVALID_OPERATION_ID");
      await call("issue",{id:row.remote_id},{confirm:true,key:row.issue_key});
      return {state:"queued",error_code:null};
    },"issue_uncertain");},
    process:(id,confirm)=>{if(confirm!==true)reject("CONFIRMATION_REQUIRED");return step(id,["queued"],"processing",async row=>{
      await call("process_pending",{id:row.remote_id},{confirm:true});
      return {state:"awaiting_confirmation",error_code:null};
    },"awaiting_confirmation");},
    detail:id=>step(id,["awaiting_confirmation","issue_uncertain","queued"],"checking",async row=>{
      const result=classifyDetail(await call("detail",{id:row.remote_id}));
      return {state:result.state,protocol:result.protocol,error_code:null};
    },"awaiting_confirmation")
  });
}
