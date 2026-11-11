import type {SupabaseClient} from '@supabase/supabase-js';
import {pbxRequest} from './pbx-request';

export type SipTrunkDraft={id:string|null;name:string;provider:string;host:string;port:number;transport:string;username:string;realm:string;enabled:boolean;inbound_enabled:boolean;allowed_extension_ids:string[]};
export type SipTrunk=SipTrunkDraft&{id:string;organization_id:string;agent_id:string;revision:number;status:'pending'|'applied'|'failed';last_error:string|null};
export function newSipTrunk():SipTrunkDraft{return{id:null,name:'',provider:'',host:'',port:5060,transport:'transport-udp-local',username:'',realm:'*',enabled:false,inbound_enabled:false,allowed_extension_ids:[]};}

export async function listSipTrunks(client:SupabaseClient,organizationId:string,signal?:AbortSignal):Promise<SipTrunk[]>{
 const result=await pbxRequest(abort=>client.rpc('pbx_list_sip_trunks',{p_organization_id:organizationId}).abortSignal(abort),'Consulta dos troncos',{signal});
 if(result.error)throw new Error('Não foi possível consultar os troncos desta empresa.');
 return (result.data||[]) as SipTrunk[];
}
export async function saveSipTrunk(client:SupabaseClient,organizationId:string,draft:SipTrunkDraft,password:string,signal?:AbortSignal):Promise<string>{
 const result=await pbxRequest(abort=>client.rpc('pbx_save_sip_trunk',{
  p_organization_id:organizationId,p_trunk_id:draft.id,p_name:draft.name.trim(),p_provider:draft.provider.trim(),
  p_host:draft.host.trim(),p_port:draft.port,p_transport:draft.transport,p_username:draft.username,p_realm:draft.realm,
  p_enabled:draft.enabled,p_allowed_extension_ids:draft.allowed_extension_ids,p_password:password||null,p_inbound_enabled:false,
 }).abortSignal(abort),'Cadastro do tronco',{signal});
 // Provider errors can contain connection data; never echo them into the UI.
 if(result.error)throw new Error('Tronco não confirmado. Confira os campos, os ramais autorizados e atualize a lista antes de repetir.');
 return String(result.data);
}
export async function retrySipTrunk(client:SupabaseClient,organizationId:string,id:string,signal?:AbortSignal){
 const result=await pbxRequest(abort=>client.rpc('pbx_retry_sip_trunk',{p_organization_id:organizationId,p_trunk_id:id}).abortSignal(abort),'Reprocessamento do tronco',{signal});
 if(result.error)throw new Error('Não foi possível solicitar o reprocessamento. Atualize a lista para conferir o estado.');
 return result.data;
}
