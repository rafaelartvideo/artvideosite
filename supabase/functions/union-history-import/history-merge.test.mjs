import test from "node:test";
import assert from "node:assert/strict";
import {mergeFetchedHistoryPages as edgeMerge} from "./history-merge.mjs";
import {mergeFetchedHistoryPages,historyId} from "../../../tools/history-import/history-page.mjs";
const row=(key,sent_at)=>({id:historyId(key.repeat(40)),sent_at,body_text:"same"});
const old=row("a","2024-01-01T10:00:00.000001Z"),first=row("b","2026-11-24T18:00:00.000001+00:00"),second=row("c","2026-11-24T18:00:00.000002+00:00"),third=row("d","2026-11-24T18:00:00.000002Z");
test("edge merge matches archive contract, including truncated source pages",()=>{
 const live={items:[third,first,old],hasMore:false},archive={items:[second],hasMore:true};
 assert.deepEqual(edgeMerge(live,archive,null,3),mergeFetchedHistoryPages(live,archive,null,3));
 const page=edgeMerge(live,archive,null,3);
 assert.deepEqual(page.items.map(x=>x.id),[second.id,third.id]);
 assert.deepEqual(edgeMerge({items:[first,old],hasMore:false},{items:[],hasMore:false},page.nextCursor,3).items.map(x=>x.id),[old.id,first.id]);
 assert.throws(()=>edgeMerge({items:[third],hasMore:false},{items:[third],hasMore:false}));
});
