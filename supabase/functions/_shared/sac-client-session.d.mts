export type ClientCredentials={clientId:string;clientSecret:string};
export type ClientSessionInput={organizationId:string;credentials:ClientCredentials;scopes:string[]};
export type ClientSession={token:string;expiresAt:number};
export function clientCredentialFingerprint(credentials:ClientCredentials):Promise<string>;
export function clientTokenExpiry(token:string,body:Record<string,unknown>,now?:number):number;
export function createSacClientSessions(dependencies:{rpc:(name:string,args:Record<string,unknown>)=>Promise<unknown>;fetcher?:typeof fetch;now?:()=>number;sleep?:(ms:number)=>Promise<void>}):{
 get(input:ClientSessionInput):Promise<ClientSession>;
 invalidate(input:ClientSessionInput,rejectedToken:string):Promise<void>;
};
