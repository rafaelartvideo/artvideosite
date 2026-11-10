/** Recency of the consulted snapshot, not proof that a phone can receive calls. */
export function isAgentHeartbeatFresh(enabled:boolean,lastSeen:string|null,now:number) {
 const seen=Date.parse(lastSeen||'');
 return enabled && Number.isFinite(seen) && seen<=now+5000 && now-seen<120000;
}
