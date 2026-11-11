import test from "node:test";
import assert from "node:assert/strict";
import { createProtocolAvatarCache } from "./protocol-avatar-cache.mjs";

test("cache de fotos SAC conserva avatares em refresh leve e observa mudanças", () => {
  const cache = createProtocolAvatarCache({ ttlMs: 1000, maxScopes: 2 });
  const orgUser = "empresaA:usuario1";
  const first = [{contact: {id:"contato1", updated_at:"v1", avatar_url:"data:image/jpeg;base64,abc"}}];
  assert.equal(cache.hasScope(orgUser), false);
  cache.capture(orgUser, first, 100);
  assert.equal(cache.hasScope(orgUser), true);
  assert.equal(cache.get(orgUser, "contato1").url, "data:image/jpeg;base64,abc");
  assert.deepEqual(cache.staleIds(orgUser, [{contact:{id:"contato1", updated_at:"v1"}}], 999), []);
  assert.deepEqual(cache.staleIds(orgUser, [{contact:{id:"contato1", updated_at:"v2"}}], 999), ["contato1"]);
  assert.deepEqual(cache.staleIds(orgUser, [{contact:{id:"contato1", updated_at:"v1"}}], 1100), ["contato1"]);
  cache.capture(orgUser, [{contact:{id:"contato1",updated_at:"v2",avatar_url:null}}], 1200);
  assert.equal(cache.get(orgUser, "contato1").url, null);
});

test("cache SAC separa identidade e empresa e limita memória de escopos", () => {
  const cache = createProtocolAvatarCache({ maxScopes: 2 });
  cache.capture("empresaA:user1", [{contact:{id:"id",avatar_url:"privado-A"}}]);
  assert.deepEqual(cache.staleIds("empresaB:user1", [{contact:{id:"id",updated_at:null}}]), ["id"]);
  cache.capture("empresaB:user1", [{contact:{id:"id",avatar_url:"privado-B"}}]);
  assert.equal(cache.get("empresaB:user1","id").url, "privado-B");
  cache.capture("empresaA:user2", [{contact:{id:"id",avatar_url:"privado-A2"}}]);
  assert.equal(cache.hasScope("empresaA:user1"),false);
  assert.equal(cache.get("empresaB:user1","id").url,"privado-B");
  assert.deepEqual(cache.staleIds("empresaA:user2", [
    {contact:{id:"id",updated_at:null}},
    {contact:{id:"id",updated_at:null}},
    {contact:{id:"new",updated_at:null}},
  ]), ["new"]);
});
