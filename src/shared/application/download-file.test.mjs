import test from 'node:test';
import assert from 'node:assert/strict';

test('generated reports download a local blob without a network request', async t => {
  const { downloadBlobFile } = await import('./download-file.ts');
  assert.equal(typeof downloadBlobFile,'function');
  const previousDocument=globalThis.document;
  t.after(()=>{globalThis.document=previousDocument;});
  t.mock.timers.enable({apis:['setTimeout']});
  const anchor={style:{},click(){},remove(){}};
  globalThis.document={createElement:()=>anchor,body:{appendChild(){}}};
  t.mock.method(globalThis,'fetch',()=>assert.fail('local report must not fetch'));
  let received;
  t.mock.method(URL,'createObjectURL',blob=>{received=blob;return 'blob:report';});
  t.mock.method(URL,'revokeObjectURL',()=>{});
  const blob=new Blob(['CSV']);downloadBlobFile(blob,'report.csv');
  assert.equal(received,blob);assert.equal(anchor.download,'report.csv');
  t.mock.timers.tick(2000);
});

test('cross-origin attachment downloads use a local blob with original bytes and filename', async t => {
  const { downloadRemoteFile } = await import('./download-file.ts');
  const previousDocument = globalThis.document;
  t.after(() => { globalThis.document = previousDocument; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let blob, clicked = 0, removed = 0;
  const revoked = [];
  const anchor = { style: {}, click() { clicked++; }, remove() { removed++; } };
  globalThis.document = { createElement: () => anchor, body: { appendChild() {} } };
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url, 'https://storage.example/photo');
    return new Response('original-file-bytes');
  });
  t.mock.method(URL, 'createObjectURL', value => { blob = value; return 'blob:local-file'; });
  t.mock.method(URL, 'revokeObjectURL', value => revoked.push(value));
  await downloadRemoteFile('https://storage.example/photo', 'photo.png');
  assert.equal(await blob.text(), 'original-file-bytes');
  assert.equal(anchor.href, 'blob:local-file');
  assert.equal(anchor.download, 'photo.png');
  assert.equal(clicked, 1); assert.equal(removed, 1);
  assert.deepEqual(revoked, []);
  t.mock.timers.tick(2_000);
  assert.deepEqual(revoked, ['blob:local-file']);
});

test('failed HTTP response cannot download an error body as a customer file', async t => {
  const { downloadRemoteFile } = await import('./download-file.ts');
  t.mock.method(globalThis, 'fetch', async () => new Response('denied', {status:403}));
  let created = 0;
  t.mock.method(URL, 'createObjectURL', () => { created++; return 'blob:error'; });
  await assert.rejects(downloadRemoteFile('https://storage.example/photo', 'photo.png'));
  assert.equal(created, 0);
});

test('failed click still removes its temporary anchor and releases the blob', async t => {
  const { downloadRemoteFile } = await import('./download-file.ts');
  const previousDocument = globalThis.document;
  t.after(() => { globalThis.document = previousDocument; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let removed = 0, revoked = 0;
  globalThis.document = { createElement: () => ({ style: {}, click() { throw new Error('blocked'); }, remove() { removed++; } }), body: { appendChild() {} } };
  t.mock.method(globalThis, 'fetch', async () => new Response('bytes'));
  t.mock.method(URL, 'createObjectURL', () => 'blob:test');
  t.mock.method(URL, 'revokeObjectURL', () => { revoked++; });
  await assert.rejects(downloadRemoteFile('https://storage.example/photo', 'photo.png'), /blocked/);
  t.mock.timers.tick(2_000);
  assert.equal(removed, 1); assert.equal(revoked, 1);
});
