// Local UI bridge only. No SIP credentials, network requests or new voice session.
export const CHAT_PBX_PREFILL = "union:chat-pbx-prefill";
export const CHAT_PBX_STATE = "union:chat-pbx-state";
let current:{organizationId:string;busy:boolean}|null=null;
export function publishChatPbxState(organizationId:string,busy:boolean){
  current={organizationId,busy};
  window.dispatchEvent(new Event(CHAT_PBX_STATE));
}
export function getChatPbxBusy(organizationId:string){return current?.organizationId===organizationId&&current.busy;}
