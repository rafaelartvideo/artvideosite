import type { UniversalDocument, UniversalEntity } from '../application/universal-telephony';

export class SimpleTrunkSetupError extends Error {}
export type SimpleTrunkInput={name?:string;host:string;username:string;extensionIds:string[];contractLimit:number|null;port?:number;transport?:'udp'|'tcp'|'tls';referenceConnectionId?:string};
export function prepareSimpleTrunk(current:UniversalDocument,organizationId:string,input:SimpleTrunkInput,eligibleExtensionIds:string[],makeId=()=>crypto.randomUUID()):{document:UniversalDocument;connectionId:string}{
 if(current.routing_enabled)throw new SimpleTrunkSetupError('Desative as rotas e aguarde a confirmação da central antes de adicionar uma linha.');
 const host=input.host.trim().toLowerCase(),username=input.username.trim();const name=(input.name?.trim()||host);
 if(!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(host)||host.includes('..')||!name||name.length>60||/[\x00-\x1f\x7f]/.test(name)||!/^[A-Za-z0-9_.+-]{1,128}$/.test(username))throw new SimpleTrunkSetupError('Confira o nome, o servidor e o usuário SIP. Informe somente o endereço do servidor, sem prefixos ou parâmetros.');
 const extensions=[...new Set(input.extensionIds)];if(!extensions.length||extensions.some(id=>!eligibleExtensionIds.includes(id)))throw new SimpleTrunkSetupError('Selecione pelo menos um ramal disponível desta empresa.');
 const limit=input.contractLimit;if(limit!==null&&(!Number.isInteger(limit)||limit<1||limit>10000))throw new SimpleTrunkSetupError('Informe um limite contratado inteiro entre 1 e 10000, ou deixe em branco.');
 const port=input.port??5060,transport=input.transport??'udp';if(!Number.isInteger(port)||port<1||port>65535||!['udp','tcp','tls'].includes(transport))throw new SimpleTrunkSetupError('Confira a porta e o transporte SIP.');
 if(current.connections.some(row=>row.host.toLowerCase()===host&&row.username.toLowerCase()===username.toLowerCase()))throw new SimpleTrunkSetupError('Este acesso SIP já está cadastrado. Use Editar na linha existente.');
 const matching=current.connections.filter(row=>row.host.toLowerCase()===host);
 let reference=input.referenceConnectionId?current.connections.find(row=>row.id===input.referenceConnectionId):undefined;
 if(input.referenceConnectionId&&!reference)throw new SimpleTrunkSetupError('Contrato de referência indisponível. Atualize o cadastro.');
 if(!reference&&matching.length){if(new Set(matching.map(row=>row.contract_id)).size!==1)throw new SimpleTrunkSetupError('Há mais de um contrato nesse servidor. Escolha a linha de referência em Opções avançadas.');reference=matching[0];}
 const document=structuredClone(current);const ids=new Set(Object.values(current).flatMap(value=>Array.isArray(value)?value.map(row=>row.id):[]));
 function id(){for(let i=0;i<100;i++){const value=makeId();if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value))throw new SimpleTrunkSetupError('Não foi possível preparar o cadastro.');if(!ids.has(value)){ids.add(value);return value;}}throw new SimpleTrunkSetupError('Não foi possível preparar o cadastro.');}
 let providerId=reference?.provider_id,contractId=reference?.contract_id;
 if(reference&&(!document.providers.some(row=>row.id===providerId)||!document.contracts.some(row=>row.id===contractId&&row.provider_id===providerId)))throw new SimpleTrunkSetupError('Referência de contrato inválida. Revise em Avançado.');
 if(!providerId){providerId=id();document.providers.push({id:providerId,name,enabled:true,options:{}});}
 if(!contractId){contractId=id();document.contracts.push({id:contractId,provider_id:providerId,name:'Contrato · '+name,enabled:true});}
 const connectionId=id(),trunkId=id();document.connections.push({id:connectionId,provider_id:providerId,contract_id:contractId,name,auth_mode:'registration',host,port,transport,username,realm:'*',inbound_cidrs:[],enabled:true,inbound_enabled:false,outbound_enabled:true});
 document.trunks.push({id:trunkId,name:'Linha · '+name,connection_ids:[connectionId],enabled:true});
 const sameExtensions=(group:UniversalEntity)=>group.extension_ids.length===extensions.length&&extensions.every(value=>group.extension_ids.includes(value));
 const overlapping=current.outbound_routes.filter(route=>route.enabled).slice().sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id)).map(route=>({route,group:current.groups.find(row=>row.id===route.group_id)})).filter(value=>value.group?.enabled&&value.group.extension_ids.some((value:string)=>extensions.includes(value)));
 const first=overlapping[0];const compatible=first&&first.route.destination_pattern==='br_national'&&sameExtensions(first.group!)&&first.route.caller_id===null&&first.route.max_cost===null?first:undefined;
 if(overlapping.length&&!compatible)throw new SimpleTrunkSetupError('Esses ramais já utilizam uma regra de saída diferente. Ajuste as preferências em Avançado.');
 let groupId:string;
 if(compatible){groupId=compatible.group!.id;const group=document.groups.find(row=>row.id===groupId)!;const priority=Math.max(0,...group.members.map((row:UniversalEntity)=>row.priority))+1;if(priority>9999)throw new SimpleTrunkSetupError('Revise a prioridade das linhas em Avançado.');group.members.push({connection_id:connectionId,trunk_id:trunkId,priority});}
 else {groupId=id();document.groups.push({id:groupId,name:'Saída · '+name,strategy:'priority',members:[{connection_id:connectionId,trunk_id:trunkId,priority:1}],extension_ids:extensions,enabled:true});const priority=Math.max(0,...current.outbound_routes.map(row=>row.priority))+1;if(priority>9999)throw new SimpleTrunkSetupError('Revise as regras de saída em Avançado.');document.outbound_routes.push({id:id(),name:'Nacionais · '+name,group_id:groupId,priority,destination_pattern:'br_national',prefix:null,caller_id:null,max_cost:null,options:{},enabled:true});}
 function pool(scope:string,scope_id:string,provided:number|null){if(!document.capacity_pools.some(row=>row.scope===scope&&row.scope_id===scope_id))document.capacity_pools.push({id:id(),scope,scope_id,mode:'shared',shared_limit:provided,inbound_limit:null,outbound_limit:null,confidence:provided===null?'unknown':'contract'});}
 // Existing upper limits are immutable here. A new credential never expands them.
 pool('organization',organizationId,current.connections.length?null:limit);pool('provider',providerId,limit);pool('contract',contractId,limit);pool('connection',connectionId,limit);pool('trunk',trunkId,limit);pool('group',groupId,limit);
 return {document,connectionId};
}

export type SimpleTrunkEditInput=Pick<SimpleTrunkInput,'name'|'host'|'username'|'port'|'transport'>;
/** Edit the existing credential in place; never recreate the linked routing graph. */
export function prepareSimpleTrunkEdit(current:UniversalDocument,connectionId:string,input:SimpleTrunkEditInput):{document:UniversalDocument;connectionId:string;identityChanged:boolean}{
 if(current.routing_enabled)throw new SimpleTrunkSetupError('Desative as rotas e aguarde a confirmação da central antes de editar a linha.');
 const previous=current.connections.find(row=>row.id===connectionId);
 if(!previous||previous.auth_mode==='ip')throw new SimpleTrunkSetupError('Acesso indisponível neste cadastro. Confira a configuração avançada.');
 const host=input.host.trim().toLowerCase(),username=input.username.trim();const name=(input.name?.trim()||host);
 if(!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(host)||host.includes('..')||!name||name.length>60||/[\x00-\x1f\x7f]/.test(name)||!/^[A-Za-z0-9_.+-]{1,128}$/.test(username))throw new SimpleTrunkSetupError('Confira o nome, o servidor e o usuário SIP. Informe somente o endereço do servidor, sem prefixos ou parâmetros.');
 const port=input.port??5060,transport=input.transport??'udp';if(!Number.isInteger(port)||port<1||port>65535||!['udp','tcp','tls'].includes(transport))throw new SimpleTrunkSetupError('Confira a porta e o transporte SIP.');
 if(current.connections.some(row=>row.id!==connectionId&&String(row.host).toLowerCase()===host&&String(row.username).toLowerCase()===username.toLowerCase()))throw new SimpleTrunkSetupError('Este acesso SIP já está cadastrado em outra linha.');
 const document=structuredClone(current);
 const connection=document.connections.find(row=>row.id===connectionId)!;
 Object.assign(connection,{name,host,username,port,transport});
 return {document,connectionId,identityChanged:previous.host!==host||previous.username!==username};
}

export type SimpleDestination={id:string;kind:string;label:string};
export type SimpleInboundInput={enabled:boolean;numbers:string;networks:string;destinationId:string;destinationKind:string;source:'request_uri'|'to_header'|'registered_account';applyToContract?:boolean};
/** Only exact numbers and explicit trusted provider networks. Never guess public IPs from DNS. */
export function simpleInboundTemplate(document:UniversalDocument,host:string,referenceId?:string){
 const matching=document.connections.filter(row=>row.host.toLowerCase()===host.trim().toLowerCase()&&row.auth_mode==='registration'&&row.inbound_enabled);
 const reference=referenceId?matching.find(row=>row.id===referenceId):matching.length&&new Set(matching.map(row=>row.contract_id)).size===1?matching[0]:undefined;
 if(!reference)return null;
 const dids=document.dids.filter(row=>row.connection_id===reference.id&&row.enabled);
 if(!dids.length||new Set(dids.map(row=>row.destination_kind+':'+row.destination_id)).size!==1)return null;
 return {numbers:dids.map(row=>row.number).join(', '),networks:reference.inbound_cidrs.join(', '),destinationKind:dids[0].destination_kind as string,destinationId:dids[0].destination_id as string,source:(document.providers.find(row=>row.id===reference.provider_id)?.options?.did_source||'request_uri') as 'to_header'|'request_uri'};
}
export function configureSimpleInbound(current:UniversalDocument,connectionId:string,input:SimpleInboundInput,destinations:SimpleDestination[],makeId=()=>crypto.randomUUID()):UniversalDocument{
 if(current.routing_enabled)throw new SimpleTrunkSetupError('Desative as rotas e aguarde a confirmação da central.');
 const document=structuredClone(current),connection=document.connections.find(row=>row.id===connectionId);
 if(!connection||connection.auth_mode!=='registration')throw new SimpleTrunkSetupError('Configure a entrada deste acesso em Avançado.');
 if(!input.enabled){connection.inbound_enabled=false;return document;}
 const provider=document.providers.find(row=>row.id===connection.provider_id);
 if(!provider)throw new SimpleTrunkSetupError('Operadora indisponível.');
 if(!['request_uri','to_header','registered_account'].includes(input.source))throw new SimpleTrunkSetupError('Selecione o formato de identificação enviado pela operadora.');
 const numbers=[...new Set(input.numbers.split(/[,;\n]+/).map(value=>value.trim().replace(/[() .-]/g,'')).filter(Boolean))];
 if(!numbers.length||numbers.length>20||numbers.some(value=>!/^\+?[0-9]{3,15}$/.test(value)))throw new SimpleTrunkSetupError('Informe os números exatos enviados pela operadora, separados por vírgulas.');
 if(input.source==='registered_account'&&numbers.length!==1)throw new SimpleTrunkSetupError('Para recebimento pela conta SIP, vincule um único número público por conta.');
 const networks=[...new Set(input.networks.split(/[,;\s]+/).filter(Boolean).map(value=>value.includes('/')?value:value.includes(':')?value+'/128':value+'/32'))];
 if(!networks.length||networks.length>32||networks.some(value=>! /^(?:[0-9.]+|[0-9a-fA-F:]+)\/[0-9]{1,3}$/.test(value)||Number(value.split('/')[1])<1||Number(value.split('/')[1])>(value.includes(':')?128:32)))throw new SimpleTrunkSetupError('Informe os IPs ou redes CIDR de sinalização de entrada confirmados pela operadora. Não use redes abertas.');
 if(!['extension','queue','flow'].includes(input.destinationKind)||!destinations.some(row=>row.id===input.destinationId&&row.kind===input.destinationKind))throw new SimpleTrunkSetupError('Selecione um destino disponível desta empresa.');
 const targets=input.applyToContract?document.connections.filter(row=>row.provider_id===connection.provider_id&&row.contract_id===connection.contract_id&&row.host.toLowerCase()===connection.host.toLowerCase()&&row.auth_mode==='registration'&&row.enabled):[connection];
 if(!targets.some(row=>row.id===connectionId))throw new SimpleTrunkSetupError('A linha precisa estar habilitada.');
 const ids=new Set(targets.map(row=>row.id));
 const existingSource=provider.options?.did_source||'request_uri';
 if(existingSource!==input.source&&document.connections.some(row=>row.provider_id===provider.id&&row.inbound_enabled&&!ids.has(row.id)))throw new SimpleTrunkSetupError('O formato do DID é compartilhado pela operadora. Ajuste as demais linhas na configuração avançada.');
 for(const row of targets){
  const existing=document.dids.filter(did=>did.connection_id===row.id&&did.enabled);
  if(new Set(existing.map(did=>did.destination_kind+':'+did.destination_id)).size>1)throw new SimpleTrunkSetupError('Esta linha possui destinos distintos. Edite as regras em Avançado.');
  if(existing.some(did=>!numbers.includes(did.number)))throw new SimpleTrunkSetupError('Inclua os números já ativos para preservá-los ou remova-os em Avançado.');
 }
 provider.options={...provider.options,did_source:input.source};
 const used=new Set(Object.values(document).flatMap(value=>Array.isArray(value)?value.map(row=>row.id):[]));
 for(const row of targets){
  row.inbound_enabled=true;row.inbound_cidrs=[...networks];
  for(const number of numbers){
   const previous=document.dids.find(did=>did.connection_id===row.id&&did.number===number);
   if(previous){Object.assign(previous,{destination_kind:input.destinationKind,destination_id:input.destinationId,enabled:true});continue;}
   let id='';for(let i=0;i<100;i++){const candidate=makeId();if(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(candidate)&&!used.has(candidate)){id=candidate;break;}}
   if(!id)throw new SimpleTrunkSetupError('Não foi possível preparar o cadastro de entrada.');
   used.add(id);document.dids.push({id,connection_id:row.id,number,destination_kind:input.destinationKind,destination_id:input.destinationId,enabled:true});
  }
 }
 return document;
}
