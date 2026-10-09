// Runtime-neutral gateway: injected persistence and transport make business calls testable offline.
export function operationPermission(operation) {
  const path = operation.path.toLowerCase();
  if (/campaign|sms|callcenter|telephony|\/call\b/.test(path)) return 'sac_digital.settings.manage';
  if (operation.method === 'GET') return 'sac_digital.messages.view';
  if (/\/send|\/notification\/(contact|direct)|\/resend/.test(path)) return 'sac_digital.messages.send';
  return 'sac_digital.protocols.manage';
}
export function parsePagination(body, currentPage=1) {
  const page=Number(currentPage)||1;
  const pager=body.pager && typeof body.pager === 'object' ? body.pager : {};
  const more=typeof body.has_more === 'boolean' ? body.has_more : typeof pager.has_more === 'boolean' ? pager.has_more : null;
  const next=Number(body.next_page ?? pager.next_page);
  if(more !== null) return {has_more:more,next_page:more ? Number.isInteger(next)&&next>page ? next : page+1 : null};
  if(Number.isInteger(next)&&next>page) return {has_more:true,next_page:next};
  // Missing continuation metadata is not evidence of completion: page until an empty list.
  if(Array.isArray(body.list)) return {has_more:body.list.length>0,next_page:body.list.length>0 ? page+1 : null};
  return {has_more:false,next_page:null};
}
export function operatorScopes(scopes, selectsProtocol=false) {
  // Solicitar somente os escopos publicados para a operação. O antigo
  // acréscimo de "profile" fazia algumas contas recusarem o login do operador
  // com invalid_scope, embora o atendimento tivesse protocol/edit liberados.
  return [...new Set([...scopes,...(selectsProtocol ? ['protocol','edit'] : [])])].sort();
}
// Token inspection is only a diagnostic. A nonempty subject still requires
// the authenticated profile to match the server-owned operator binding.
export function operatorTokenError(token) {
  try {
    const part=String(token).split('.')[1];
    if(!part) return null;
    const claims=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));
    return Object.hasOwn(claims,'sub') && !String(claims.sub || '').trim()
      ? 'operator_authorization_required' : null;
  } catch { return null; }
}
export function newConversationRoute(accessMode, protocol) {
  if(!protocol) return 'forward';
  if(protocol.isAtt !== true) return 'client';
  return accessMode === 'operator' ? 'operator' : 'notification';
}
export async function openOperatorSocket(token, Socket=WebSocket, timeoutMs=8000) {
  const socket=new Socket(`wss://ws.sac.digital/ws/att?${encodeURIComponent(token)}`);
  const close=()=>{try {socket.close();} catch {}};
  await new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);socket.removeEventListener('open',opened);socket.removeEventListener('error',failed);socket.removeEventListener('close',failed);};
    const opened=()=>{cleanup();resolve();};
    const failed=()=>{cleanup();close();reject(Object.assign(new Error('Não foi possível abrir a sessão operacional WebSocket da SAC Digital.'),{code:'operator_session_unavailable'}));};
    const timer=setTimeout(failed,timeoutMs);
    socket.addEventListener('open',opened);socket.addEventListener('error',failed);socket.addEventListener('close',failed);
  });
  return {close,assertOpen:()=>{if(socket.readyState!==1)throw Object.assign(new Error('A sessão operacional da SAC Digital foi encerrada.'),{code:'operator_session_unavailable'});}};
}
export function importPhoneCandidates(value) {
  const normalized=String(value || '').replace(/\D/g,'');
  const values=[normalized];
  if(normalized.startsWith('55') && normalized.length===13 && normalized[4]==='9') values.push(normalized.slice(0,4)+normalized.slice(5));
  else if(normalized.startsWith('55') && normalized.length===12 && /^[6-9]$/.test(normalized[4])) values.push(normalized.slice(0,4)+'9'+normalized.slice(4));
  return [...new Set(values)];
}
export function mayTryImportVariant(body,httpStatus) {
  return httpStatus>=400 && httpStatus<500 && ['error_valid_wpp','invalid_number','invalid_wpp','contact_validation_failed'].includes(String(body.type || '')) && body.outcome !== 'unknown';
}
export function routeProtocolOperation(endpointId, input, info) {
  const values={...input};
  if(info.is_closed === true || info.is_open === false || info.closed_at || info.finished_at) throw new Error('Protocolo encerrado. Inicie um novo atendimento.');
  if(typeof info.is_att !== 'boolean' || (info.is_open !== true && info.is_closed !== false)) throw new Error('Não foi possível confirmar a modalidade e abertura do protocolo na SAC Digital.');
  if(info.is_att === true) {
    if(endpointId === 37) throw new Error('Atendimento operacional não pode ser devolvido pelo contrato de autoatendimento.');
    if(endpointId === 36) {
      if(values.url && values.text) {values.caption=values.text;delete values.text;}
      return {endpointId:78,values};
    }
    if(endpointId === 38) {
      if(values.vote === undefined || values.vote === null || values.vote === '') throw new Error('A finalização operacional requer votação conforme contrato da SAC Digital.');
      return {endpointId:92,values:{protocol:values.protocol,vote:values.vote}};
    }
  }
  delete values.vote;
  return {endpointId,values};
}
export function channelCapabilityError(channel, values) {
  if(!channel || channel.actived === false || channel.active === false || channel.connected === false || channel.status === 'offline') return 'Selecione um canal ativo.';
  // Only explicit supplier metadata identifies special capabilities; legacy channels stay compatible.
  const type=String(channel.type || '').toLowerCase();
  if(type === 'callcenter') {
    if(channel.primary !== false) return 'Callcenter exige canal secundário confirmado pela SAC Digital.';
  } else if(['whatsapp_cloud','cloud_api','whatsapp_cloud_api'].includes(type)) {
    if(values.type !== undefined && (values.type !== 'template' || !values.template)) return 'Este canal Cloud exige template aprovado e variáveis.';
  } else if(/cloud|callcenter/.test(type)) return 'Capacidade do canal não confirmada. Verifique o contrato com a SAC Digital.';
  return null;
}
export function responseEnvelope(body, status, currentPage=1) {
  const evidenced=body && typeof body === 'object' && !Array.isArray(body) && (typeof body.status === 'boolean' || typeof body.success === 'boolean' || body.id != null || body.message_id != null || body.notification_id != null || Array.isArray(body.list) || Array.isArray(body.historic) || (body.info && typeof body.info === 'object'));
  const rejected = !evidenced || status < 200 || status >= 300 || body.status === false || body.success === false;
  return {success: !rejected, data: body, outcome: rejected ? 'rejected' : body.notification_id ? 'queued' : 'accepted',
    ...parsePagination(body,currentPage),
    ...(rejected ? {type: String(body.type || (!evidenced ? 'invalid_provider_response' : 'provider_rejected')).slice(0,80), error: String(body.message || body.error || 'Operação recusada pela SAC Digital.').slice(0,500)} : {})};
}
export async function executeSacOperation(operation, dependencies) {
  const fail = (type,error,outcome='rejected') => ({success:false,data:null,outcome,has_more:false,next_page:null,type,error});
  if (!await dependencies.authorize(operationPermission(operation))) return fail('permission_denied','Sem permissão para esta operação.');
  if (operation.mode === 'operator' && !dependencies.operator) return fail('operator_auth_contract_unverified','Vincule um operador e confirme a autenticação operacional da SAC Digital.');
  if(operation.mode === 'operator' && operation.protocol && operation.method === 'GET' && !await dependencies.authorize('sac_digital.protocols.manage')) return fail('permission_denied','A seleção operacional requer permissão para gerenciar atendimentos.');
  const mutation = operation.method !== 'GET';
  let attempt = null; let leased = false;
  try {
    if (mutation) {
      attempt = await dependencies.begin(operation);
      if (attempt.created !== true || attempt.state !== 'prepared') return fail('attempt_already_exists','Esta tentativa já foi processada. Reconcilie antes de repetir.',attempt.state === 'prepared' ? 'unknown' : attempt.state);
    }
    if (operation.mode === 'operator') {
      leased = await dependencies.lease();
      if (!leased) {if(attempt) await dependencies.record(attempt.id,'rejected',{type:'operator_busy'});return fail('operator_busy','Este operador está executando outra operação.');}
      await dependencies.operator();
      if (operation.protocol && operation.skipSelect !== true && !/\/select\//.test(operation.path)) {
        const selected = await dependencies.transport({method:'PATCH',path:`/operator/att/select/${encodeURIComponent(operation.protocol)}`,mode:'operator'});
        const selection=responseEnvelope(selected.body,selected.response.status);
        if (!selection.success) {
          const failure=selection;
          if(attempt) await dependencies.record(attempt.id,'rejected',selected.body);
          return failure;
        }
      }
    }
    if (dependencies.prepare) {
      const prepared = await dependencies.prepare(operation);
      if (prepared.success === false) {
        if (attempt) await dependencies.record(attempt.id, 'rejected', {type:prepared.type});
        return prepared;
      }
      operation = prepared;
    }
    const result = await dependencies.transport(operation);
    const page=Number(new URL(operation.path,'https://api.sac.digital').searchParams.get('p')) || 1;
    const envelope = responseEnvelope(result.body,result.response.status,page);
    if(!mutation && /\/(all|search|queue|list)(?:\?|$)/.test(operation.path) && !Array.isArray(result.body.list)) {
      envelope.success=false;envelope.outcome='rejected';envelope.type='invalid_provider_response';envelope.error='A SAC Digital não retornou a lista esperada. Confirme o contrato de resposta.';
    }
    if(mutation && envelope.type === 'invalid_provider_response') envelope.outcome='unknown';
    if (attempt) await dependencies.record(attempt.id,envelope.outcome,result.body);
    return envelope;
  } catch (error) {
    const errorCode=String(error?.code || '');
    const authentication=['operator_auth_contract_unverified','operator_profile_incompatible','operator_scope_missing','operator_authorization_required','operator_identity_mismatch','operator_session_unavailable'].includes(errorCode);
    const state = mutation && !authentication ? 'unknown' : 'rejected';
    if(attempt) {
      try { await dependencies.record(attempt.id,state,{type:errorCode || undefined}); }
      catch { /* The durable prepared attempt remains uncertain, never retryable. */ }
    }
    return fail(
      authentication ? errorCode : 'external_transport_failed',
      authentication
        ? String(error?.message || 'A autenticação operacional da SAC Digital foi recusada.')
        : 'Não foi possível confirmar o resultado externo. Reconcilie antes de repetir.',
      state,
    );
  } finally {
    if(leased) {
      try { await dependencies.release(); }
      catch { /* The bounded lease expires; cleanup cannot replace provider evidence. */ }
    }
  }
}

export function ownMediaStoragePath(message, organizationId) {
  const metadata=message.raw_metadata;
  if(!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || metadata.temp_storage_bucket !== 'sac-digital-attachments') return null;
  const path=metadata.temp_storage_path;
  if(typeof path !== 'string' || !path.startsWith(`${organizationId}/`) || path.length>300 || path.split('/').some(part=>!part || part==='.' || part==='..') || /[\\\u0000-\u001f]/.test(path)) return null;
  return path;
}
export function chooseImportChannel(channels) {
 const active=channels.filter(channel=>channel.actived===true||channel.active===true).filter(channel=>channel.connected!==false&&!['offline','disconnected'].includes(String(channel.status||'').toLowerCase()));
 const primary=active.find(channel=>channel.primary===true)||active[0];
 if(String(primary?.type||'').toLowerCase()==='callcenter') {
  const secondary=active.find(channel=>channel.primary===false&&String(channel.type||'').toLowerCase()==='callcenter');
  if(!secondary)throw Error('Callcenter exige canal secundário ativo confirmado.');
  return secondary;
 }
 return primary||null;
}

