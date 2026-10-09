import { exchangeToken } from './sac-oauth.mjs';
export async function authorizedOperatorToken(admin,context,credentials,fetcher=fetch) {
 const args={p_organization_id:context.organizationId,p_user_id:context.userId,p_operator_id:context.operatorId,p_binding_version:context.bindingVersion,p_client_id:credentials.clientId};
 const stored=await admin.rpc('sac_digital_operator_session_get',args);
 if(stored.error) throw Object.assign(Error('Não foi possível consultar a autorização SAC.'),{code:'operator_session_unavailable'});
 const session=stored.data;
 if(!session) throw Object.assign(Error('Clique em Autorizar Operador e entre com sua conta de Operador na SAC Digital.'),{code:'operator_authorization_required'});
 if(Date.parse(session.expires_at)>Date.now()+120000) return session.access_token;
 if(!session.refresh_token || Date.parse(session.refresh_expires_at)<=Date.now()) throw Object.assign(Error('Sua autorização SAC expirou. Clique em Autorizar Operador.'),{code:'operator_authorization_required'});
 const next=await exchangeToken(credentials,{grant_type:'refresh_token',refresh_token:session.refresh_token},fetcher);
 const saved=await admin.rpc('sac_digital_operator_session_set',{...args,p_tokens:next});
 if(saved.error) throw Object.assign(Error('Não foi possível salvar a renovação da autorização SAC.'),{code:'operator_session_unavailable'});
 return next.access_token;
}
