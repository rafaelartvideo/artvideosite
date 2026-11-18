import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { invalidateRealtimeBatch } from './realtime-invalidation.ts';
import { readFileSync } from 'node:fs';

test('realtime batches use a fixed window and discard queued work on scope exit', () => {
  const source = readFileSync('src/infrastructure/query/QueryRealtimeSync.tsx', 'utf8');
  assert.match(source, /if \(flushTimer !== undefined\) return/);
  assert.match(source, /const keys = \[\.\.\.pending\.values\(\)\]/);
  assert.match(source, /invalidateRealtimeBatch\(queryClient, keys/);
  assert.match(source, /if \(flushTimer !== undefined\) window\.clearTimeout\(flushTimer\)/);
  assert.match(source, /pending\.clear\(\)/);
  assert.match(source, /supabase\.removeChannel\(channel\)/);
});

test('baseline: separate overlapping invalidations start three requests', async t => {
  const client = new QueryClient(); t.after(() => client.clear());
  const key = ['orders', 'detail', 'one']; let calls = 0;
  client.setQueryData(key, 'initial');
  const observer = new QueryObserver(client, {queryKey:key, staleTime:Infinity,
    queryFn: async () => {calls++; return 'fresh';}});
  const unsubscribe = observer.subscribe(() => {}); t.after(unsubscribe);
  await Promise.all([['orders'], key, ['orders', 'detail']].map(queryKey =>
    client.invalidateQueries({queryKey, refetchType:'active'})));
  assert.equal(calls, 3);
});

test('overlapping realtime families refetch each active query once', async t => {
  const client = new QueryClient();
  t.after(() => client.clear());
  let calls = 0;
  const key = ['orders', 'detail', 'one'];
  client.setQueryData(key, 'initial');
  const observer = new QueryObserver(client, {queryKey:key, staleTime:Infinity,
    queryFn: async () => { calls++; return 'fresh'; }});
  const unsubscribe = observer.subscribe(() => {});
  t.after(unsubscribe);
  await invalidateRealtimeBatch(client, [['orders'], key, ['orders', 'detail']], () => true);
  assert.equal(calls, 1);
  assert.equal(client.getQueryData(key), 'fresh');
});

test('inactive modules become stale without fetching; other tenant clients stay intact', async t => {
  const client = new QueryClient(), other = new QueryClient();
  t.after(() => {client.clear(); other.clear();});
  const key = ['finance', 'entries'];
  client.setQueryData(key, 'cached'); other.setQueryData(key, 'other tenant');
  let calls = 0;
  const observer = new QueryObserver(client, {queryKey:key, staleTime:Infinity,
    queryFn: async () => {calls++; return 'fresh';}});
  const unsubscribe = observer.subscribe(() => {}); t.after(unsubscribe);
  client.setQueryData(['customers'], 'unaffected');
  await invalidateRealtimeBatch(client, [['finance']], () => false);
  assert.equal(calls, 0);
  assert.equal(client.getQueryState(key).isInvalidated, true);
  assert.equal(other.getQueryState(key).isInvalidated, false);
  assert.equal(client.getQueryState(['customers']).isInvalidated, false);
});
