import test from "node:test";
import assert from "node:assert/strict";
import { createMediaPreviewUrls } from "../application/media-preview-urls.mjs";

test("scope exit releases abandoned composer previews and pending audio", t => {
  const created = [];
  const revoked = [];
  t.mock.method(URL, "createObjectURL", blob => {
    assert.ok(blob instanceof Blob);
    const url = `blob:preview-${created.length}`;
    created.push(url);
    return url;
  });
  t.mock.method(URL, "revokeObjectURL", url => revoked.push(url));
  const urls = createMediaPreviewUrls();
  const photo = urls.create(new Blob(["photo"]));
  const audio = urls.create(new Blob(["audio"]));
  const failedUpload = urls.create(new Blob(["failed upload"]));
  urls.release(photo);
  assert.deepEqual(revoked, [photo], "transferred audio remains alive for pending playback");
  urls.clear();
  assert.deepEqual(revoked, [photo, audio, failedUpload]);
  urls.release(photo);
  urls.release(audio);
  urls.clear();
  assert.equal(revoked.length, 3, "settling a request after scope exit is harmless");
});

test("Atendimentos distingue figurinhas, autoria interna e coleção privada por empresa", async () => {
  const { readFileSync } = await import("node:fs");
  const read = path => readFileSync(new URL("../../../../"+path,import.meta.url),"utf8");
  const page=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const picker=read("src/features/whatsapp-channels/presentation/UnionWhatsAppStickerPicker.tsx");
  const edge=read("supabase/functions/union-whatsapp-inbox/index.ts");
  const bridge=read("services/union-wuzapi-bridge/server.mjs");
  const schema=read("supabase/migrations/20261111175500_union_whatsapp_sticker_library.sql");

  assert.match(page,/message\.message_type==="sticker"/);
  assert.match(page,/max-h-\[124px\] max-w-\[120px\]/);
  assert.match(page,/sender_name &&/);
  assert.match(page,/onSaveSticker=/);
  assert.match(page,/onResendSticker=/);
  assert.match(page,/stickerZoom && mediaUrl/);
  assert.match(picker,/Da empresa/);
  assert.match(picker,/Recentes/);
  assert.match(picker,/Favoritas/);
  assert.match(edge,/action==="sticker_list"/);
  assert.match(edge,/action==="sticker_save"/);
  assert.match(edge,/action==="sticker_favorite"/);
  assert.match(edge,/action==="sticker_send"/);
  assert.match(edge,/message_type:isMedia\?kind:"text"/);
  assert.match(edge,/sender_name:senderName/);
  assert.match(edge,/\["image","video","file"\]\.includes\(kind\)/);
  assert.match(bridge,/path="\/chat\/send\/sticker"/);
  assert.match(schema,/enable row level security/);
  assert.match(schema,/revoke all on public\.union_whatsapp_sticker_library from public,anon,authenticated/);
  assert.match(schema,/storage_path like organization_id::text \|\| '\/stickers\/%'/);
});
