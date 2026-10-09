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

export async function initializeSacScreen({loadStatus, loadProtocols, loadUnreadCounts, onReady}) {
  await loadStatus();
  if (onReady() === false) return;
  void loadProtocols();
  void loadUnreadCounts();
}

