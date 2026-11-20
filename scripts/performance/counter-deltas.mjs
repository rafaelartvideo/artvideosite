export function counterDelta(before,after,fields) {
  const seconds=(Date.parse(after.captured_at)-Date.parse(before.captured_at))/1000;
  if(!(seconds>0))throw new Error('Intervalo inválido');
  const result={seconds,metrics:{}};
  for(const [section,keys] of Object.entries(fields)){
    if(before[section]?.stats_reset!==after[section]?.stats_reset){result.metrics[section]={unavailable:'stats_reset changed'};continue;}
    result.metrics[section]={};
    for(const key of keys){const a=before[section]?.[key],b=after[section]?.[key];
      result.metrics[section][key]=Number.isSafeInteger(a)&&Number.isSafeInteger(b)&&b>=a?{delta:b-a,perSecond:(b-a)/seconds}:{unavailable:'missing, reset or unsafe counter'};
    }
  }return result;
}
export function statementDeltas(before,after) {
  const previous=new Map(before.map(row=>[row.queryid,row]));
  return after.map(row=>{
    const old=previous.get(row.queryid),seconds=old?(Date.parse(row.captured_at)-Date.parse(old.captured_at))/1000:0;
    if(!old||old.stats_reset!==row.stats_reset||seconds<=0||row.calls<old.calls||row.total_exec_time<old.total_exec_time)
      return {rpc:row.rpc,queryid:row.queryid,unavailable:'missing, evicted or reset'};
    const calls=row.calls-old.calls,ms=row.total_exec_time-old.total_exec_time;
    return {rpc:row.rpc,queryid:row.queryid,seconds,calls,callsPerMinute:calls*60/seconds,sqlMeanMs:calls?ms/calls:null,
      note:'SQL average only: no p50/p95/p99 or gateway/error latency inferred'};
  });
}
