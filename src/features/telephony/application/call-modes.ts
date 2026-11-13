import { pbxRequest } from './pbx-request';
export type CallMode = 'both' | 'receive_only' | 'make_only';
export const callModeOptions: {value: CallMode; label: string}[] = [
  {value:'both',label:'Faz e recebe'}, {value:'receive_only',label:'Só recebe'}, {value:'make_only',label:'Só faz'},
];
export const callModeLabel = (mode: CallMode) => callModeOptions.find(item => item.value === mode)?.label || 'Faz e recebe';
export type CallModePair = {internal_mode:CallMode;external_mode:CallMode};
export type ExtensionCallMode = CallModePair & {applied_internal_mode:CallMode;applied_external_mode:CallMode} & {extension_id:string; organization_id:string; endpoint_name:string; mode:CallMode; applied_mode:CallMode; revision:number; status:'applied'|'pending'|'failed'; last_error:string|null; can_manage:boolean};
export type MyCallMode = CallModePair & {desired_internal_mode:CallMode;desired_external_mode:CallMode} & {mode:CallMode;desired_mode:CallMode;status:'applied'|'pending'|'failed';can_make_calls:boolean;can_receive_calls:boolean};
export type BoundCallMode = {organizationId:string;endpoint:string;value:MyCallMode};
type Client = {rpc:(name:string,args:Record<string,unknown>)=>{abortSignal:(signal:AbortSignal)=>PromiseLike<{data:unknown;error:unknown}>}};
type Options = {signal?:AbortSignal;timeoutMs?:number};
const validMode = (mode:unknown):mode is CallMode => ['both','receive_only','make_only'].includes(String(mode));
const validStatus = (status:unknown) => ['applied','pending','failed'].includes(String(status));
const validId = (id:string) => typeof id === 'string' && Boolean(id.trim());
const unconfirmed = () => new Error('Modo de chamada sem confirmação. Atualize os dados antes de repetir uma alteração.');
async function request(client:Client,name:string,args:Record<string,unknown>,options:Options){
 try {const result=await pbxRequest(signal=>client.rpc(name,args).abortSignal(signal),'Modo de chamada',options);if(result.error)throw unconfirmed();return result.data;}
 catch {throw unconfirmed();}
}
export async function listExtensionCallModes(client:Client,organizationId:string,options:Options={}):Promise<ExtensionCallMode[]>{
 if(!validId(organizationId))throw new Error('Empresa inválida.');
 const data=await request(client,'pbx_list_extension_call_modes_v2',{p_organization_id:organizationId},options);
 if(!Array.isArray(data)||data.some(row=>row.organization_id!==organizationId||!validId(row.extension_id)||!['internal_mode','external_mode','applied_internal_mode','applied_external_mode'].every(key=>validMode(row[key]))||!validStatus(row.status)||!Number.isSafeInteger(row.revision)||row.revision<0||typeof row.can_manage!=='boolean'))throw unconfirmed();
 return data.map(row=>({...row,last_error:row.last_error?'A central não confirmou a alteração. Atualize e verifique o agente.':null}));
}
export async function setExtensionCallMode(client:Client,organizationId:string,extensionId:string,modes:CallModePair,revision:number,options:Options={}){
 if(!validId(organizationId)||!validId(extensionId)||!modes||!validMode(modes.internal_mode)||!validMode(modes.external_mode)||!Number.isSafeInteger(revision)||revision<0)throw new Error('Modo ou revisão inválidos. Atualize os dados.');
 return request(client,'pbx_set_extension_call_modes_v2',{p_organization_id:organizationId,p_extension_id:extensionId,p_internal_mode:modes.internal_mode,p_external_mode:modes.external_mode,p_expected_revision:revision},options);
}
export async function myCallMode(client:Client,organizationId:string,endpoint:string,options:Options={}):Promise<MyCallMode>{
 if(!validId(organizationId)||!validId(endpoint))throw new Error('Empresa ou ramal inválido.');
 const data=await request(client,'pbx_my_call_mode_v2',{p_organization_id:organizationId,p_endpoint_name:endpoint},options) as MyCallMode;
 if(!data||!['internal_mode','external_mode','desired_internal_mode','desired_external_mode'].every(key=>validMode(data[key]))||!validStatus(data.status))throw unconfirmed();
 return data;
}
export function boundCallMode(organizationId:string|null,endpoint:string,bound:BoundCallMode|null):MyCallMode|null{
 return organizationId&&bound?.organizationId===organizationId&&bound.endpoint===endpoint?bound.value:null;
}

export const canOriginate = (mode:MyCallMode|null,scope:"internal"|"external") => mode?.[`${scope}_mode`] !== "receive_only";
