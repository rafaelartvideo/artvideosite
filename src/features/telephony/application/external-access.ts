export type ExternalDialGrant={organizationId:string;endpoint:string;allowed:boolean};

/** UI hint only. The PBX separately enforces the authenticated endpoint/lease. */
export function externalDialingAllowed(legacyAllowed:boolean,platform:boolean,organizationId:string|null,endpoint:string,grant:ExternalDialGrant|null):boolean{
 if(platform)return legacyAllowed;
 return Boolean(organizationId&&endpoint&&grant?.organizationId===organizationId&&grant.endpoint===endpoint&&grant.allowed===true);
}
