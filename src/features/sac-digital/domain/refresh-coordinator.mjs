const requests = new Map();
export function singleFlight(key, run) {
  if (requests.has(key)) return requests.get(key);
  const promise = Promise.resolve().then(run).finally(() => {
    if (requests.get(key) === promise) requests.delete(key);
  });
  requests.set(key, promise);
  return promise;
}
// Batch notification bursts, allowing at most one trailing refresh while busy.
export function createRefreshQueue(run, delay = 350) {
  let timer, running = false, dirty = false, disposed = false;
  const flush = async () => {
    timer = undefined;
    if (disposed || running) return;
    dirty = false;
    running = true;
    try { await run(); } catch { /* Read loaders expose their own errors. */ }
    finally { running = false; if (dirty && !disposed) schedule(); }
  };
  const schedule = () => { if (!timer && !running) timer = setTimeout(flush, delay); };
  return {
    request() { if (!disposed) { dirty = true; schedule(); } },
    dispose() { disposed = true; clearTimeout(timer); },
  };
}

export async function initializeSacScreen({loadStatus, loadProtocols, loadUnreadCounts, onReady}) {
  await loadStatus();
  if (onReady() === false) return;
  void loadProtocols();
  void loadUnreadCounts();
}
