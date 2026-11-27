import type { SupabaseClient } from '@supabase/supabase-js';
import { pbxRequest } from './pbx-request';
export type UniversalEntity = { id: string; name?: string; enabled?: boolean; [key: string]: any };
export type UniversalCollection = 'providers'|'contracts'|'connections'|'trunks'|'capacity_pools'|'dids'|'groups'|'outbound_routes';
export type UniversalDocument = { schema_version: 1; routing_enabled: boolean } & Record<UniversalCollection, UniversalEntity[]>;
export type UniversalAudit = {revision:number;created_at:string;actor_id:string|null;status:'pending'|'applied'|'failed'};
export type UniversalEnvelope = {organization_id:string;revision:number;document:UniversalDocument;status:string;observed:Record<string, any>|null;can_activate:boolean;last_error:unknown;audit?:UniversalAudit[]};
export function emptyUniversalDocument():UniversalDocument { return {schema_version:1,routing_enabled:false,providers:[],contracts:[],connections:[],trunks:[],capacity_pools:[],dids:[],groups:[],outbound_routes:[]}; }
export function capacityLabel(pool:UniversalEntity):string { if(pool.confidence==='unknown')return 'Desconhecida'; if(pool.mode==='shared')return pool.shared_limit ? `${pool.shared_limit} compartilhadas` : 'Desconhecida'; return `Entrada: ${pool.inbound_limit ?? 'desconhecida'} · Saída: ${pool.outbound_limit ?? 'desconhecida'}`; }
function envelope(data:unknown,organizationId:string):UniversalEnvelope { const value=(Array.isArray(data)?data[0]:data) as UniversalEnvelope; if(!value||value.organization_id!==organizationId||!Number.isSafeInteger(value.revision)||value.document?.schema_version!==1)throw new Error('Configuração indisponível.'); for(const key of ['providers','contracts','connections','trunks','capacity_pools','dids','groups','outbound_routes'])if(!Array.isArray(value.document[key as UniversalCollection]))throw new Error('Configuração indisponível.'); return value; }
export const UNIVERSAL_CENTRAL_UNLINKED = 'Central desta empresa ainda não vinculada. A administração Union precisa concluir a vinculação em Integrações → PABX.';
const safeMessages = {
 central_unlinked: UNIVERSAL_CENTRAL_UNLINKED,
 permission_denied: 'Você não tem permissão para configurar a telefonia desta empresa.',
 revision_conflict: 'A configuração foi alterada. Atualize o estado da central antes de salvar.',
 invalid_credential: 'Senha SIP inválida: informe de 1 a 256 caracteres compatíveis com a central, sem espaços, aspas, ponto e vírgula ou quebras de linha. Confira a credencial da operadora.',
 invalid_configuration: 'A central não aceitou a configuração. Atualize e confira os dados e os pré-requisitos antes de repetir.',
 unconfirmed: 'Alteração sem confirmação. Atualize antes de repetir.',
} as const;
export class UniversalTelephonyError extends Error {
 constructor(public readonly code: keyof typeof safeMessages) { super(safeMessages[code]); this.name='UniversalTelephonyError'; }
}
export function universalTelephonyErrorMessage(failure:unknown):string {
 return failure instanceof UniversalTelephonyError ? safeMessages[failure.code] ?? safeMessages.unconfirmed : safeMessages.unconfirmed;
}
function rpcError(error:{code?:string;message?:string}):UniversalTelephonyError {
 if(error.code==='23514'&&error.message==='SIP credential format unsupported')return new UniversalTelephonyError('invalid_credential');
 return new UniversalTelephonyError(error.code==='42501'?'permission_denied':error.code==='40001'?'revision_conflict':error.code==='23514'?'invalid_configuration':'unconfirmed');
}
/** Query each company afresh; an absent or disabled agent cannot accept credentials. */
export async function hasUniversalTelephonyCentral(client:SupabaseClient,organizationId:string,signal?:AbortSignal):Promise<boolean> {
 const result=await pbxRequest(abort=>client.rpc('pbx_list_agents',{p_organization_id:organizationId}).abortSignal(abort),'Consulta do vínculo da central',{signal});
 if(result.error)throw rpcError(result.error);
 if(!Array.isArray(result.data))throw new UniversalTelephonyError('unconfirmed');
 return result.data.some(agent=>typeof agent.id==='string'&&agent.enabled===true);
}
export async function listUniversalTelephony(client:SupabaseClient,organizationId:string,signal?:AbortSignal):Promise<UniversalEnvelope>{ const result=await pbxRequest(abort=>client.rpc('pbx_list_universal_telephony',{p_organization_id:organizationId}).abortSignal(abort),'Consulta da telefonia universal',{signal}); if(result.error)throw rpcError(result.error); return envelope(result.data,organizationId); }
export async function saveUniversalTelephony(client:SupabaseClient,organizationId:string,revision:number,document:UniversalDocument,secrets:Record<string,string>,signal?:AbortSignal):Promise<void>{ if(Object.values(secrets).some(value=>value.length>0&&!/^[A-Za-z0-9_!@%+.,:/?&*(){}~-]{1,256}$/.test(value)))throw new UniversalTelephonyError('invalid_credential'); const allowed=new Set(document.connections.map(item=>item.id)); if(Object.keys(secrets).some(id=>!allowed.has(id))||JSON.stringify(document).match(/"(?:password|secret)"\s*:/i))throw new UniversalTelephonyError('invalid_configuration'); if(!await hasUniversalTelephonyCentral(client,organizationId,signal))throw new UniversalTelephonyError('central_unlinked'); const result=await pbxRequest(abort=>client.rpc('pbx_save_universal_telephony',{p_organization_id:organizationId,p_expected_revision:revision,p_document:document,p_secrets:Object.fromEntries(Object.entries(secrets).filter(([,value])=>value.length>0))}).abortSignal(abort),'Salvar telefonia universal',{signal}); if(result.error)throw rpcError(result.error); }
