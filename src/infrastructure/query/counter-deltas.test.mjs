import test from 'node:test';
import assert from 'node:assert/strict';
import {counterDelta,statementDeltas} from '../../../scripts/performance/counter-deltas.mjs';
test('counter deltas reject resets, negative/unsafe values and use elapsed seconds',()=>{
  const a={captured_at:'2026-11-19T00:00:00Z',wal:{stats_reset:'a',wal_bytes:100}};
  const b={captured_at:'2026-11-19T00:01:00Z',wal:{stats_reset:'a',wal_bytes:220}};
  assert.deepEqual(counterDelta(a,b,{wal:['wal_bytes']}).metrics.wal.wal_bytes,{delta:120,perSecond:2});
  b.wal.stats_reset='b';assert.ok(counterDelta(a,b,{wal:['wal_bytes']}).metrics.wal.unavailable);
  b.wal.stats_reset='a';b.wal.wal_bytes=10;assert.ok(counterDelta(a,b,{wal:['wal_bytes']}).metrics.wal.wal_bytes.unavailable);
});
test('statement deltas use text IDs without mixing periods or inventing percentiles',()=>{
  const a=[{queryid:'9223372036854775000',rpc:'test',captured_at:'2026-11-19T00:00:00Z',stats_reset:'a',calls:10,total_exec_time:100}];
  const b=[{...a[0],captured_at:'2026-11-19T00:01:00Z',calls:12,total_exec_time:140}];
  assert.equal(statementDeltas(a,b)[0].sqlMeanMs,20);assert.equal(statementDeltas(a,b)[0].callsPerMinute,2);
  b[0].stats_reset='b';assert.ok(statementDeltas(a,b)[0].unavailable);
});
