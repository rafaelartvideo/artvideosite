import test from "node:test";
import assert from "node:assert/strict";
import {
  rememberVisibleAvatar, VISIBLE_AVATAR_CACHE_MAX_BYTES,
  VISIBLE_AVATAR_CACHE_MAX_ENTRIES,
  VISIBLE_AVATAR_FOUND_TTL_MS, VISIBLE_AVATAR_MISSING_TTL_MS,
  VISIBLE_AVATAR_RETRY_MS,
} from "./visible-avatar-cache.mjs";

const estimatedBytes = entries => Object.entries(entries).reduce(
  (total,[key,url])=>total+512+2*(key.length+(url?.length||0)),0
);

test("visible-avatar cache bounds empty and private-photo entries by count",()=>{
  let avatars={};
  for(let i=0;i<250;i++)avatars=rememberVisibleAvatar(avatars,"jid-"+i,null);
  assert.equal(Object.keys(avatars).length,VISIBLE_AVATAR_CACHE_MAX_ENTRIES);
  assert.equal(avatars["jid-249"],null);
  assert.equal(Object.hasOwn(avatars,"jid-0"),false);
});

test("visible-avatar cache bounds large data URLs by memory budget",()=>{
  let avatars={};
  for(let i=0;i<70;i++)
    avatars=rememberVisibleAvatar(avatars,"jid-"+i,
      "data:image/jpeg;base64,"+"Q".repeat(250000));
  assert.ok(estimatedBytes(avatars)<=VISIBLE_AVATAR_CACHE_MAX_BYTES);
  assert.ok(Object.keys(avatars).length<VISIBLE_AVATAR_CACHE_MAX_ENTRIES);
  assert.ok(Object.hasOwn(avatars,"jid-69"));
  assert.equal(Object.hasOwn(avatars,"jid-0"),false);
});

test("refreshing an avatar moves it to the most recent position",()=>{
  let avatars=rememberVisibleAvatar({},"a","data:image/jpeg;base64,a");
  avatars=rememberVisibleAvatar(avatars,"b","data:image/jpeg;base64,b");
  const previous=avatars;
  avatars=rememberVisibleAvatar(avatars,"a","data:image/jpeg;base64,new");
  assert.deepEqual(Object.keys(avatars),["b","a"]);
  assert.equal(previous.a,"data:image/jpeg;base64,a");
  assert.equal(avatars.a,"data:image/jpeg;base64,new");
  avatars=rememberVisibleAvatar(avatars,"a",null);
  assert.equal(avatars.a,null);
});

test("found, private and transient error refresh windows stay ordered",()=>{
  assert.ok(VISIBLE_AVATAR_RETRY_MS<VISIBLE_AVATAR_MISSING_TTL_MS);
  assert.ok(VISIBLE_AVATAR_MISSING_TTL_MS<VISIBLE_AVATAR_FOUND_TTL_MS);
});
