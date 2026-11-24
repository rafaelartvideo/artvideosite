import test from "node:test";
import assert from "node:assert/strict";
import { historyId, timestampMicros, normalizeArchiveTimestamp, compareHistory, mergeHistoryPage, mergeFetchedHistoryPages, projectHistorical } from "./history-page.mjs";
const row=(key,at,body_text="same")=>({id:historyId(key.repeat(40)),sent_at:at,body_text});
const old=row("a","2024-01-01T10:00:00.000001Z"),first=row("b","2026-11-24T18:00:00.000001+00:00"),second=row("c","2026-11-24T18:00:00.000002+00:00"),third=row("d","2026-11-24T18:00:00.000002Z");
test("microsecond precision and stable ID tie breaker",()=>{
 assert.equal(timestampMicros("2024-01-01T07:00:00.123456-03:00"),timestampMicros("2024-01-01T10:00:00.123456Z"));
 assert.equal(timestampMicros("2024-01-01T10:00:00.000002Z")-timestampMicros("2024-01-01T10:00:00.000001Z"),1n);
 assert(compareHistory(third,second)<0);
 assert.throws(()=>timestampMicros("not a date"));
});
test("pages interleave archives and current rows; repeated text stays distinct",()=>{
 const a=mergeHistoryPage([first,third],[second,old],null,2);
 assert.deepEqual(a.items.map(x=>x.id),[second.id,third.id]);assert.equal(a.hasMore,true);
 const b=mergeHistoryPage([first,third],[second,old],a.nextCursor,2);
 assert.deepEqual(b.items.map(x=>x.id),[old.id,first.id]);assert.equal(b.hasMore,false);
 assert.equal(mergeHistoryPage([first],[first],null,10).items.length,1);
 assert.throws(()=>mergeHistoryPage([{...first,sent_at:old.sent_at}],[first]));
});
test("all message attachments survive; no remote key, technical source name or invented receipt",()=>{
 const p={media:[{url_sha256:"1".repeat(64),available:true,mime:"image/jpeg",rclone_relative_key:"private"},{url_sha256:"2".repeat(64),available:false,mime:"audio/mpeg"}],
  messages:[{import_key:"a".repeat(40),protocol_key:"b".repeat(32),at:"2024-01-01T00:00:00Z",direction:"incoming",sender_original:"contact",text:"exemplo",links:["https://example.org"],media:[{url_sha256:"1".repeat(64),kind:"image"},{url_sha256:"2".repeat(64),kind:"audio"}]}]};
 const result=projectHistorical(p,{organizationId:"org",conversationId:"conv"});
 assert.equal(result.length,1);assert.equal(result[0].attachments.length,2);assert.equal(result[0].attachments[1].available,false);
 assert.equal(result[0].read_only,true);assert.equal(result[0].delivery_status,null);assert.equal(result[0].body_text,"exemplo");
 assert.equal(JSON.stringify(result).includes("rclone_relative_key"),false);
 assert.throws(()=>projectHistorical({...p,messages:[p.messages[0],p.messages[0]]},{organizationId:"org",conversationId:"conv"}));
});

test("truncated source pages cannot skip unseen archived rows",()=>{
 const a=mergeFetchedHistoryPages({items:[third,first,old],hasMore:false},{items:[second],hasMore:true},null,3);
 assert.deepEqual(a.items.map(x=>x.id),[second.id,third.id]);
 assert.equal(a.hasMore,true);
 assert.equal(a.nextCursor.id,second.id);
 const b=mergeFetchedHistoryPages({items:[first,old],hasMore:false},{items:[],hasMore:false},a.nextCursor,3);
 assert.deepEqual(b.items.map(x=>x.id),[old.id,first.id]);
 assert.equal(b.hasMore,false);
 assert.throws(()=>mergeFetchedHistoryPages({items:[],hasMore:true},{items:[],hasMore:false}));
 assert.throws(()=>mergeFetchedHistoryPages({items:[third],hasMore:false},{items:[third],hasMore:false}));
});


test("archive timestamps normalize SQL spaces, compact offsets and fractional precision without guessing zones",()=>{
 const expected="2024-01-01T10:00:00.123456Z";
 for(const input of ["2024-01-01 07:00:00.123456-03:00","2024-01-01T07:00:00.1234560-0300","2024-01-01 10:00:00.123456+00","2024-01-01 10:00:00.123456 UTC","2024-01-01T10:00:00.123456789Z"]){
  assert.equal(normalizeArchiveTimestamp(input),expected);
  assert.equal(timestampMicros(normalizeArchiveTimestamp(input)),timestampMicros(expected));
 }
 assert.equal(normalizeArchiveTimestamp("2024-01-01T07:00-03:00"),"2024-01-01T10:00:00.000000Z");
 for(const invalid of ["2024-01-01 07:00:00","2024-02-30T07:00:00Z","2024-01-01T07:00:00+99:00","not a date"])
  assert.throws(()=>normalizeArchiveTimestamp(invalid));
 const projected=projectHistorical({media:[],messages:[{import_key:"a".repeat(40),protocol_key:"b".repeat(32),at:"2024-01-01 07:00:00.123456-0300",direction:"incoming",media:[]}]},{organizationId:"org",conversationId:"conv"});
 assert.equal(projected[0].sent_at,expected);
});
