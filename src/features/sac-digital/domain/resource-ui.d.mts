export function mediaMaximum(mime?: string): number;
export function deliveryLabel(metadata: Record<string,any>|null|undefined):string;
export function fieldVisible(field:any,values:Record<string,any>):boolean;
export function formValues(fields:any[],values:Record<string,any>):Record<string,any>;
export function resultItems(data:unknown):any[];
export function apiDiagnostic(payload:any):string;
export function initialValues(fields:any[],protocol?:string):Record<string,any>;
export class IntentLedger { constructor(create?:()=>string,storage?:Storage); begin(body:any):string; finish(body:any,outcome:string):void; }
export function recordContext(fields:any[],row:any,area:string,protocol?:string):Record<string,any>;
export function friendlyEntries(value:any):Array<[string,any]>;
export function actionLabel(endpoint:any):string;
export function privateMediaIds(rows:any[]):string[];
export function hydrateMedia<T extends {id:string;media_url:string|null;raw_metadata:any}>(rows:T[],urls:Record<string,string>):T[];
export function cloudChannel(channel:any):boolean;
export function usableChannels(rows:any[]):any[];
export function approvedTemplates(rows:any[]):any[];
