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
