export function canPrefetchCode(env) {
  const connection=env?.navigator?.connection;
  return Boolean(env)&&!env.document?.hidden&&env.navigator?.onLine!==false&&!connection?.saveData&&
    !['slow-2g','2g','3g'].includes(connection?.effectiveType);
}
export function scheduleOrderCodeWarmup(eligible,preload,env) {
  if(!eligible||!canPrefetchCode(env)||!env.requestIdleCallback)return ()=>{};
  let cancelled=false;
  const id=env.requestIdleCallback(deadline=>{
    if(cancelled||!canPrefetchCode(env)||deadline.timeRemaining()<8)return;
    try {void Promise.resolve(preload()).catch(()=>{});}catch{/* Hover can retry. */}
  });
  return ()=>{cancelled=true;env.cancelIdleCallback?.(id);};
}
