import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addCompatibleEventListener, dispatchCompatibleEvent,
  PERMISSIONS_CHANGED_EVENT, LEGACY_PERMISSIONS_CHANGED_EVENT } from './platform-identifiers.ts';

function mountRefresh() {
  const source = readFileSync('src/lib/auth.tsx', 'utf8');
  const declaration = source.indexOf('    let permissionRefreshQueued');
  const start = declaration >= 0 ? declaration : source.indexOf('    const handlePermissionChange =');
  const end = source.indexOf('    const removePermissionListener', start);
  assert.ok(start >= 0 && end > start);
  const calls = [];
  const user = {current:'user-a'}, organization = {current:'org-a'}, loading = {current:'in-flight'}, generation = {current:0};
  const {handler, dispose} = new Function('scope','signedInUserRef','activeOrganizationIdRef',
    'accessLoadingKeyRef','accessRequestRef','loadAccess', `let cancelled = false; ${source.slice(start,end)}
      return {handler:handlePermissionChange,dispose:()=>{cancelled=true;}};`)(
    'crm', user, organization, loading, generation, (...args) => {calls.push(args);});
  return {handler, dispose, calls, user, organization, generation, loading};
}

test('one compatibility event pair starts one permission bootstrap, later events still refresh', async t => {
  const original = globalThis.window; globalThis.window = new EventTarget();
  const refresh = mountRefresh();
  const off = addCompatibleEventListener(PERMISSIONS_CHANGED_EVENT, LEGACY_PERMISSIONS_CHANGED_EVENT, refresh.handler);
  t.after(() => {off(); globalThis.window = original;});
  dispatchCompatibleEvent(PERMISSIONS_CHANGED_EVENT, LEGACY_PERMISSIONS_CHANGED_EVENT);
  await Promise.resolve();
  assert.deepEqual(refresh.calls, [['user-a','org-a',true]]);
  dispatchCompatibleEvent(PERMISSIONS_CHANGED_EVENT, LEGACY_PERMISSIONS_CHANGED_EVENT);
  await Promise.resolve();
  assert.equal(refresh.calls.length,2);
});

test('queued refresh cannot supersede a newer company switch before its response commits', async () => {
  const refresh = mountRefresh();
  refresh.handler();
  // Switching starts a new generation, but the visible organization is still A
  // until B has passed the server bootstrap and access-hours checks.
  refresh.generation.current++;
  refresh.loading.current='user-a:org-b';
  await Promise.resolve();
  assert.equal(refresh.organization.current,'org-a');
  assert.equal(refresh.calls.length,0);
  assert.equal(refresh.loading.current,'user-a:org-b');
});

test('queued permission refresh cannot start after logout, company switch or unmount', async () => {
  for (const change of [r => {r.user.current=null;}, r => {r.user.current='user-b';},
    r => {r.organization.current='org-b';}, r => r.dispose()]) {
    const refresh = mountRefresh(); refresh.handler(); change(refresh);
    await Promise.resolve(); assert.equal(refresh.calls.length,0);
  }
});

test('an obsolete access failure cannot clear newer access or unlock its in-flight request', async () => {
  const source = readFileSync('src/lib/auth.tsx', 'utf8');
  const start = source.indexOf('  async function loadAccess(');
  const end = source.indexOf('  async function loadAccessData(',start);
  assert.ok(start >= 0 && end > start);
  const {transformSync} = await import('esbuild');
  const code = transformSync(source.slice(start,end), {loader:'ts'}).code;
  const key = {current:null}, requestId = {current:0};
  const requests = []; let failures = 0;
  const load = new Function('accessLoadingKeyRef','accessRequestRef','signedInUserRef',
    'activeOrganizationIdRef','loadAccessData','clearResolvedAccess','setProfile','setAccessError','setLoading','setLoadingProgress','console',
    `${code}; return loadAccess;`)(key, requestId, {current:'user-a'},
      {current:'org-a'},
      () => {requestId.current++; return new Promise((resolve,reject)=>requests.push({resolve,reject}));},
      () => {failures++;},()=>{},()=>{},()=>{},()=>{}, {error(){},warn(){}});
  const previous = load('user-a','org-a',true);
  key.current=null; // A subsequent real permission event requires a fresh bootstrap.
  const current = load('user-a','org-a',true);
  requests[0].reject(new Error('obsolete timeout')); await previous;
  assert.equal(failures,0);
  assert.equal(key.current,'user-a:org-a');
  await load('user-a','org-a',true);
  assert.equal(requests.length,2, 'the newer request must keep ownership of its lock');
  requests[1].resolve(); await current;
  assert.equal(key.current,null);
  const latest = load('user-a','org-a',true);
  requests[2].reject(new Error('current timeout')); await latest;
  assert.equal(failures,0,'a temporary background failure must preserve already validated access');
});
