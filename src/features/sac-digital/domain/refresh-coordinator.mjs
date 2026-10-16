const requests = new Map();
export function singleFlight(key, run) {
  if (requests.has(key)) return requests.get(key);
  const promise = Promise.resolve().then(run).finally(() => {
    if (requests.get(key) === promise) requests.delete(key);
  });
  requests.set(key, promise);
  return promise;
}
export function freshSingleFlight(key,run) {
 const previous=requests.get(key);
 // Publish the barrier immediately: polling must not reuse the older request
 // while this operation's fresh read is waiting for it to finish.
 const promise=Promise.resolve(previous).catch(()=>{}).then(run).finally(()=>{
  if(requests.get(key)===promise)requests.delete(key);
 });
 requests.set(key,promise);
 return promise;
}
// Debounce notification bursts. Bulk imports may emit thousands of Realtime
// events; wait for a quiet window instead of refreshing the full inbox every
// few hundred milliseconds while the import is still running.
export function createRefreshQueue(run, delay = 500) {
  let timer, running = false, dirty = false, disposed = false;

  const flush = async () => {
    timer = undefined;
    if (disposed || running || !dirty) return;
    dirty = false;
    running = true;
    try { await run(); } catch { /* Read loaders expose their own errors. */ }
    finally {
      running = false;
      if (dirty && !disposed) schedule();
    }
  };

  const schedule = () => {
    if (disposed || running) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delay);
  };

  return {
    request() {
      if (disposed) return;
      dirty = true;
      schedule();
    },
    dispose() {
      disposed = true;
      dirty = false;
      if (timer) clearTimeout(timer);
    },
  };
}

// One initial gate: render only after the integration, conversation list and
// user/operator access have settled. Unread badges are independent and load
// after the screen becomes usable; other SAC sections mount only on selection.
export async function initializeSacScreen({loadStatus, loadProtocols, loadOperatorBinding, loadUnreadCounts, onReady}) {
  const [statusResult] = await Promise.allSettled([loadStatus(), loadProtocols()]);
  const integration = statusResult.status === 'fulfilled' ? statusResult.value : null;
  if (loadOperatorBinding) {
    try { await loadOperatorBinding(integration?.enabled === true); }
    catch { /* A transient binding lookup must not leave the screen blocked. */ }
  }
  if (onReady() === false) return;
  void Promise.resolve().then(loadUnreadCounts).catch(() => {});
}

