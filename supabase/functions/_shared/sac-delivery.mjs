export function providerDelivery(body={}) {
 const status=body.status && typeof body.status==='object' ? body.status : {};
 const candidates=[body,status];
 const timestamps=key=>candidates.some(row=>typeof row[key]==='string' && row[key].trim());
 const states=[body.delivery_status,body.status,status.status].filter(value=>typeof value==='string');
 const state=states.includes('read') || timestamps('readed_at') || timestamps('read_at') ? 'read'
  : states.includes('delivered') || timestamps('delivered_at') ? 'delivered'
  : states.includes('sent') || timestamps('sended_at') || timestamps('sent_at') ? 'sent'
  : body.notification_id ? 'queued' : 'accepted';
 const id=body.message_id ?? (body.notification_id ? null : body.id);
 return {state,externalMessageId:(typeof id==='string' && id.trim()) || typeof id==='number' ? `sac:${id}` : null};
}
export function submissionCanMatchHistory(metadata,targetTime,localExternalId,historyId) {
 if(localExternalId && historyId && localExternalId !== historyId) return false;
 if(['rejected','failed'].includes(metadata?.delivery_status)) return false;
 if(!metadata?.client_request_id) return true;
 const started=Date.parse(metadata.submission_started_at);
 return Number.isFinite(started) && Number.isFinite(targetTime) && targetTime>=started-2000;
}
