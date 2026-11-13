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

export type LegacySipTrunk = {
 id:string; organization_id:string; agent_id:string; name:string; provider:string; management_source:'vps';
 host:string|null; username:string|null; port:number; enabled:boolean; revision:number;
 status:'pending'|'applied'|'failed'; last_error:string|null; observed_enabled:boolean|null;
 registration_state:'registered'|'unregistered'|'unknown'; checked_at:string|null; can_control:boolean;
};
export async function listLegacySipTrunks(client:SupabaseClient,organizationId:string,signal?:AbortSignal):Promise<LegacySipTrunk[]>{
 const result=await pbxRequest(abort=>client.rpc('pbx_list_legacy_trunks',{p_organization_id:organizationId}).abortSignal(abort),'Consulta das linhas existentes',{signal});
 if(result.error)throw new Error('Não foi possível consultar as linhas existentes desta empresa.');
 return ((result.data||[]) as LegacySipTrunk[]).filter(item=>item.organization_id===organizationId);
}
export async function setLegacySipTrunkEnabled(client:SupabaseClient,organizationId:string,id:string,enabled:boolean,revision:number,signal?:AbortSignal):Promise<number>{
 const result=await pbxRequest(abort=>client.rpc('pbx_set_legacy_trunk_enabled',{
  p_organization_id:organizationId,p_trunk_id:id,p_enabled:enabled,p_expected_revision:revision,
 }).abortSignal(abort),'Controle da linha existente',{signal});
 if(result.error)throw new Error('Alteração da linha sem confirmação. Atualize a lista antes de repetir.');
 return Number(result.data);
}
export function legacyRegistrationLabel(item:LegacySipTrunk,now=Date.now()):string{
 const checked=item.checked_at?Date.parse(item.checked_at):NaN;
 if(!Number.isFinite(checked)||now-checked>120000||checked>now+5000)return 'Registro sem confirmação recente';
 if(item.observed_enabled===false)return 'Linha observada desativada';
 if(item.observed_enabled!==true||item.registration_state==='unknown')return 'Registro desconhecido';
 return item.registration_state==='registered'?'Registrada na operadora':'Não registrada na operadora';
}
