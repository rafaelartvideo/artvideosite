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

// Queue polling only reconciles the visible UI. Webhooks, worker ingestion and
// the separate Realtime notification subscriptions continue while it is hidden.
export function createVisiblePolling(run, {page = document, connection = window, interval = 30_000} = {}) {
 let timer, running = false, resumePending = false, disposed = false;
 let visible = page.visibilityState !== 'hidden';
 const refresh = async (resume = false) => {
  if (disposed || !visible) return;
  if (running) { resumePending ||= resume; return; }
  running = true;
  try { await run(); } catch { /* The next visible tick can retry. */ }
  finally {
   running = false;
   if (resumePending) {
    resumePending = false;
    if (!disposed && visible) void refresh();
   }
  }
 };
 const stop = () => { if (timer !== undefined) clearInterval(timer); timer = undefined; };
 const start = () => { stop(); if (!disposed && visible) timer = setInterval(() => void refresh(), interval); };
 const visibilityChanged = () => {
  const next = page.visibilityState !== 'hidden';
  if (next === visible) return;
  visible = next;
  if (visible) { void refresh(true); start(); }
  else { resumePending = false; stop(); }
 };
 const reconnected = () => { if (visible) { void refresh(true); start(); } };
 page.addEventListener('visibilitychange', visibilityChanged);
 connection.addEventListener('online', reconnected);
 // Initial screen loading already fetched the queue.
 start();
 return { dispose() {
  disposed = true; resumePending = false; stop();
  page.removeEventListener('visibilitychange', visibilityChanged);
  connection.removeEventListener('online', reconnected);
 } };
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
  // Fetch conversations in parallel with integration status. As soon as
  // status is known, resolve the bound SAC Operator (and its waiting queue)
  // without holding it behind the potentially larger protocol list.
  const integration = Promise.resolve().then(loadStatus).catch(() => null);
  const conversations = Promise.resolve().then(loadProtocols).catch(() => {});
  const access = integration.then(status => loadOperatorBinding?.(status?.enabled === true)).catch(() => {});
  await Promise.all([conversations, access]);
  if (onReady() === false) return;
  void Promise.resolve().then(loadUnreadCounts).catch(() => {});
}

