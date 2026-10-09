export const LEGACY_SAC_ENABLED:boolean;
export function resourceEnabled(id:unknown):boolean;
export function actionEnabled(action:string,id?:unknown):boolean;
export function eventEnabled(type:string):boolean;


export type SacOperationalStatus = 'pending' | 'finished' | 'abandoned' | 'waiting' | 'self_service' | 'inbox' | 'in_att';
export function protocolOperationalStatus(protocol: {status:string;external_protocol_id?:string;operator_id?:string|null;closed_at?:string|null;is_pending?:boolean;abandoned_at?:string|null;raw_metadata?:Record<string,any>}, waitingProtocolIds?:Set<string>):SacOperationalStatus;
export function waitingOperatorProtocolIds(rows:unknown[]):string[];
