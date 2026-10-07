// Operational-only Union runtime. The complete contracts and legacy screens stay
// in the repository; reactivation must be an explicit code change.
export const LEGACY_SAC_ENABLED = false;
const resources = new Set([2,3,4,5,6,7,42,43,44]);
const protocolControls = new Set([72,73]); // Queue/read and select used by conversation controls.
const newConversationResources = new Set([14,15,39,40]); // Channels/templates + contact/direct notification used by the New conversation flow.
const actions = new Set([
 'health','resource_health','test_connection','retry_webhook_event',
 'operator_bindings_admin','set_operator_binding_admin',
 'resource_operation','sync_resource','bootstrap','reconcile_outbound',
 'sync_protocol_history','enrich_protocol','media_urls','refresh_protocol',
 'link_customer','new_conversation_search','prepare_new_conversation_contact',
 'start_new_conversation','my_operator_binding','assume_protocol','routing_options',
 'forward_protocol','return_to_inbox','finish_protocol','send_media','send_order_message','send_message',
]);
const events = new Set(['protocol_opened','protocol_finished','protocol_in_att','protocol_forward','protocol_new_message','protocol_new_inbox','contact_new']);
export function resourceEnabled(id) { return LEGACY_SAC_ENABLED || resources.has(Number(id)); }
export function actionEnabled(action, id) {
 return LEGACY_SAC_ENABLED || (actions.has(action) && (!['resource_operation','sync_resource'].includes(action) || resourceEnabled(id) || (action === 'resource_operation' && (protocolControls.has(Number(id)) || newConversationResources.has(Number(id))))));
}
export function eventEnabled(type) { return LEGACY_SAC_ENABLED || events.has(type); }


export function conversationOwnership({
 accessMode,
 boundOperatorId,
 assignedOperatorId,
 assignedOperatorName,
}) {
 const mode=String(accessMode || '').trim();
 const bound=String(boundOperatorId || '').trim();
 const assigned=String(assignedOperatorId || '').trim();
 const assignedName=String(assignedOperatorName || '').trim();

 if(mode === 'manager') {
  return {allowed:true,needsAssignment:false,reason:'manager',ownerId:assigned,ownerName:assignedName};
 }
 if(mode !== 'operator' || !bound) {
  return {allowed:false,needsAssignment:false,reason:'profile_not_linked',ownerId:assigned,ownerName:assignedName};
 }
 if(!assigned) {
  return {allowed:true,needsAssignment:true,reason:'unassigned',ownerId:'',ownerName:''};
 }
 if(assigned === bound) {
  return {allowed:true,needsAssignment:false,reason:'owned_by_current_operator',ownerId:assigned,ownerName:assignedName};
 }
 return {allowed:false,needsAssignment:false,reason:'owned_by_other_operator',ownerId:assigned,ownerName:assignedName};
}
