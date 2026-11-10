export type QueueMemberControl = {
 organization_id: string; queue_id: string; extension_id: string; revision: string; request_generation:number;
 desired_paused: boolean; status: 'pending' | 'applied' | 'failed';
 updated_at: string; last_checked_at: string | null; last_error: string | null;
};
export type AvailabilityMap = Record<string, QueueMemberControl>;
const time = (value: string | null) => { const result=Date.parse(value || ''); return Number.isFinite(result)?result:0; };

export function mergeAvailability(previous: AvailabilityMap, incoming: QueueMemberControl[], organizationId: string) {
 const next={...previous};
 for(const row of incoming){
  if(row.organization_id!==organizationId || !Number.isSafeInteger(row.request_generation) || row.request_generation<1)continue;
  const key=row.queue_id+'/'+row.extension_id, old=next[key];
  const currentTime=Math.max(time(row.updated_at),time(row.last_checked_at));
  const oldTime=old?Math.max(time(old.updated_at),time(old.last_checked_at)):0;
  if(!old || row.request_generation>old.request_generation ||
    (row.request_generation===old.request_generation && row.revision===old.revision && currentTime>=oldTime))next[key]=row;
 }
 return next;
}

export function newestQueueSnapshot<T extends {sampled_at:string}>(previous:T|undefined,incoming:T):T {
 return previous && time(previous.sampled_at)>time(incoming.sampled_at)?previous:incoming;
}

export function queueControlState(control: QueueMemberControl | undefined, observedPaused: boolean, sampledAt: string | undefined, now: number) {
 const confirmed=time(control?.last_checked_at || null);
 const recent=control?.status==='applied' && confirmed>0 && confirmed<=now+5000 && now-confirmed<=95000;
 return { paused: recent && confirmed>time(sampledAt || null) ? control.desired_paused : observedPaused,
  pending: control?.status==='pending', failed:control?.status==='failed' };
}
